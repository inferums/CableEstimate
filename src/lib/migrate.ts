import { DEFAULT_SOIL, DEFAULT_SURFACES, LOTOK_TYPE1, PLATES, TRAYS } from "../data/catalogs";
import type { PlateMark, TrayMark } from "../data/catalogs";
import type { LotokParams, ProjectState } from "./types";

/**
 * Версия формата проекта.
 *
 * 1 — исходный формат.
 * 2 — справочник лотков и плит переведён на серию 3.006.1-2.87: габариты марок
 *     изменились, часть марок плит (П6-8, П7-8, П6д-8, П7д-8) в серии
 *     отсутствует. Плюс в параметрах лотка появились толщины слоёв.
 * 3 — параметры грунта на всю линию: группа и доля мокрого грунта.
 * 4 — прокладка в лотках описана разрезом «Тип I»: вместо одной ширины и
 *     толщин слоёв — обозначения с чертежа (B₃, B₄, h₁…h₅). Ширина по дну
 *     теперь считается из ширины лотка и пазух, а не задаётся числом.
 */
export const SCHEMA_VERSION = 4;

/** Версии, из которых умеем открывать проект */
const SUPPORTED_VERSIONS = [1, 2, 3, 4];

export interface MigrationResult {
  state: ProjectState;
  /** Что пришлось изменить — показывается пользователю, а не замалчивается */
  notes: string[];
}

export const isSupportedVersion = (v: unknown) =>
  typeof v === "number" && SUPPORTED_VERSIONS.includes(v);


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

  /* --- грунт: до версии 3 его не было, считалось как 2 группа и 50% мокрого.
     Подставляем ровно это, поэтому объёмы не меняются и сообщать не о чем. */
  const soil = state.soil as Partial<typeof DEFAULT_SOIL> | undefined;
  if (!soil || !Number.isFinite(soil.group) || !Number.isFinite(soil.wetShare)) {
    state.soil = {
      group: Number.isFinite(soil?.group) ? soil!.group! : DEFAULT_SOIL.group,
      wetShare: Number.isFinite(soil?.wetShare) ? soil!.wetShare! : DEFAULT_SOIL.wetShare,
    };
  }

  /* --- параметры лотка --- */
  const lotok = state.params?.lotok;
  if (lotok) {
    const note = migrateLotokToType1(lotok);
    if (note) notes.push(note);

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

  /* --- акты закрытия объёмов ---
     Объёмы в актах заморожены и здесь не пересчитываются: это принятые
     работы. Выбрасываем только заведомо испорченные записи. */
  if (state.acts !== undefined) {
    const acts = Array.isArray(state.acts) ? state.acts : [];
    const good = acts.filter((a) => a && typeof a === "object" && Array.isArray(a.items) && Array.isArray(a.scope));
    if (good.length !== acts.length) {
      notes.push(`Повреждённых актов закрытия: ${acts.length - good.length} — они не прочитаны.`);
    }
    state.acts = good;
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

/**
 * Перевод параметров лотка на разрез «Тип I» (формат 4).
 *
 * Раньше ширина траншеи задавалась одним числом, теперь она складывается из
 * ширины лотка и пазух. Чтобы объёмы не поехали, свободное место делится
 * пополам между пазухами — тогда ширина по дну остаётся прежней. Толщины
 * слоёв переносятся по смыслу: подсыпка под лоток, подсыпка внутри лотка,
 * слой до плиты. Что именно изменилось, пользователь видит в сообщении: молча
 * менять сечение, по которому считается ведомость, нельзя.
 */
function migrateLotokToType1(lotok: LotokParams): string | null {
  const old = lotok as unknown as Record<string, unknown>;
  const num = (key: string): number | null => (Number.isFinite(old[key]) ? (old[key] as number) : null);
  if (num("b3") !== null && num("h1") !== null) return null;

  const tray = TRAYS.find((t) => t.mark === lotok.trayMark) ?? TRAYS[0];
  const widthM = num("width");
  const free = widthM !== null ? Math.round(widthM * 1000 - tray.width) : null;
  const half = free !== null && free > 0 ? Math.round(free / 2) : null;

  const set = (key: keyof LotokParams, value: number) => {
    if (!Number.isFinite(old[key])) (old as Record<string, number>)[key] = value;
  };

  set("b3", half ?? LOTOK_TYPE1.b3);
  set("b4", free !== null && half !== null ? free - half : LOTOK_TYPE1.b4);
  set("bShield", LOTOK_TYPE1.bShield);
  set("b5", LOTOK_TYPE1.b5);
  /* Основание переносится из метров в миллиметры, слои внутри — как были */
  set("h1", num("bedding") !== null ? Math.round(num("bedding")! * 1000) : LOTOK_TYPE1.h1);
  set("h2", num("pgsInside") ?? LOTOK_TYPE1.h2);
  set("h3", num("pgsTop") ?? LOTOK_TYPE1.h3);
  set("h4", LOTOK_TYPE1.h4);
  set("h5", num("pgsAbove") ?? LOTOK_TYPE1.h5);
  set("zptCount", LOTOK_TYPE1.zptCount);
  set("volsCount", LOTOK_TYPE1.volsCount);
  set("clampStep", LOTOK_TYPE1.clampStep);
  if (lotok.backfillType !== "sand" && lotok.backfillType !== "soil") lotok.backfillType = LOTOK_TYPE1.backfillType;
  if (lotok.beddingType !== "sand" && lotok.beddingType !== "pgs") lotok.beddingType = LOTOK_TYPE1.beddingType;

  for (const dead of ["width", "bedding", "topFill", "tapeWidth", "pgsAbove", "pgsTop", "pgsInside"]) {
    delete old[dead];
  }

  /* Прежняя ширина могла быть меньше самого лотка — такие данные не разложить
     на пазухи, и подставлять их молча нельзя */
  if (half === null) {
    return (
      `Прокладка в лотках переведена на разрез «Тип I». Прежняя ширина траншеи ` +
      `${widthM !== null ? `${widthM} м ` : ""}не вмещала лоток ${tray.mark} (${tray.width} мм), ` +
      `поэтому приняты пазухи по умолчанию ${lotok.b3} и ${lotok.b4} мм — проверьте разрез.`
    );
  }
  return (
    `Прокладка в лотках переведена на разрез «Тип I»: ширина траншеи ` +
    `${widthM !== null ? `${widthM} м ` : ""}разложена на лоток ${tray.width} мм и пазухи ` +
    `${lotok.b3} и ${lotok.b4} мм — проверьте их и глубины на разрезе.`
  );
}
