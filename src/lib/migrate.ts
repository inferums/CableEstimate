import { DEFAULT_SURFACES, PLATES, TRAYS } from "../data/catalogs";
import type { PlateMark, TrayMark } from "../data/catalogs";
import type { ProjectState } from "./types";

/**
 * Версия формата проекта.
 *
 * 1 — исходный формат.
 * 2 — справочник лотков и плит переведён на серию 3.006.1-2.87: габариты марок
 *     изменились, часть марок плит (П6-8, П7-8, П6д-8, П7д-8) в серии
 *     отсутствует. Плюс в параметрах лотка появились толщины слоёв.
 */
export const SCHEMA_VERSION = 2;

/** Версии, из которых умеем открывать проект */
const SUPPORTED_VERSIONS = [1, 2];

export interface MigrationResult {
  state: ProjectState;
  /** Что пришлось изменить — показывается пользователю, а не замалчивается */
  notes: string[];
}

export const isSupportedVersion = (v: unknown) =>
  typeof v === "number" && SUPPORTED_VERSIONS.includes(v);

/** Толщины слоёв, появившиеся в параметрах лотка позже исходного формата */
const LOTOK_LAYER_DEFAULTS = {
  topFill: 300,
  tapeWidth: 950,
  pgsAbove: 100,
  pgsTop: 70,
  pgsInside: 70,
} as const;

/**
 * Плита под лоток: марка обязана совпадать с лотком по ширине.
 * Предпочитаем полноразмерную плиту того же класса нагрузки.
 */
function plateForTray(tray: TrayMark, preferred: string | undefined): PlateMark {
  const exact = PLATES.find((p) => p.mark === preferred);
  if (exact && exact.width === tray.width) return exact;

  const fit = PLATES.filter((p) => p.width === tray.width);
  const full = (p: PlateMark) => !p.mark.includes("/2") && !p.mark.includes("д");
  return (
    fit.find((p) => full(p) && p.load.startsWith("8")) ??
    fit.find(full) ??
    fit[0] ??
    PLATES[0]
  );
}

/**
 * Приводит проект к текущему формату и справочнику.
 *
 * Работает как ремонт, а не как проверка: если марка исчезла из справочника
 * или параметр не задан, подбирается замена, но каждая подмена попадает в
 * notes — молча подставлять другое изделие в ведомость нельзя.
 */
export function migrateProject(input: ProjectState, fromVersion: number): MigrationResult {
  const state: ProjectState = JSON.parse(JSON.stringify(input));
  const notes: string[] = [];

  /* --- общая целостность --- */
  if (!Array.isArray(state.segments)) state.segments = [];
  if (!Array.isArray(state.types)) state.types = [];
  if (!Array.isArray(state.surfaces) || state.surfaces.length === 0) {
    state.surfaces = DEFAULT_SURFACES;
    notes.push("Типы покрытий отсутствовали — восстановлены значения по умолчанию.");
  }
  if (!Number.isFinite(state.chains) || state.chains < 1) {
    state.chains = 1;
    notes.push("Число цепей не задано — принято 1.");
  }

  /* --- параметры лотка --- */
  const lotok = state.params?.lotok;
  if (lotok) {
    for (const [key, value] of Object.entries(LOTOK_LAYER_DEFAULTS)) {
      const current = (lotok as unknown as Record<string, unknown>)[key];
      if (!Number.isFinite(current)) {
        (lotok as unknown as Record<string, number>)[key] = value;
      }
    }

    const tray = TRAYS.find((t) => t.mark === lotok.trayMark);
    if (!tray) {
      notes.push(`Марка лотка «${lotok.trayMark}» отсутствует в серии 3.006.1-2.87 — принят ${TRAYS[0].mark}.`);
      lotok.trayMark = TRAYS[0].mark;
    }
    const actualTray = TRAYS.find((t) => t.mark === lotok.trayMark)!;

    const plate = plateForTray(actualTray, lotok.plateMark);
    if (plate.mark !== lotok.plateMark) {
      notes.push(
        `Плита «${lotok.plateMark}» не подходит к лотку ${actualTray.mark} (${actualTray.width} мм) — принята ${plate.mark}.`,
      );
      lotok.plateMark = plate.mark;
    }

    if (fromVersion < 2) {
      notes.push(
        `Габариты лотка ${actualTray.mark} уточнены по серии 3.006.1-2.87 ` +
          `(${actualTray.length}×${actualTray.width}×${actualTray.height} мм) — проверьте ширину траншеи.`,
      );
    }
  }

  /* --- плита открытой траншеи --- */
  const open = state.params?.open;
  if (open && !PLATES.some((p) => p.mark === open.plateMark)) {
    const replacement = PLATES.find((p) => p.mark.includes("д")) ?? PLATES[0];
    notes.push(`Плита «${open.plateMark}» отсутствует в справочнике — принята ${replacement.mark}.`);
    open.plateMark = replacement.mark;
  }

  /* --- ссылки участков на покрытия --- */
  const surfaceIds = new Set(state.surfaces.map((s) => s.id));
  let repaired = 0;
  for (const seg of state.segments) {
    if (!surfaceIds.has(seg.surfaceId)) {
      seg.surfaceId = state.surfaces[0].id;
      repaired++;
    }
  }
  if (repaired > 0) {
    notes.push(`У ${repaired} участк(ов) было указано несуществующее покрытие — принято «${state.surfaces[0].name}».`);
  }

  return { state, notes };
}
