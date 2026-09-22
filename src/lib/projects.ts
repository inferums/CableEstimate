import type { Kv } from "./kv";
import { isSupportedVersion, migrateProject, SCHEMA_VERSION, type MigrationResult } from "./migrate";
import type { ProjectState } from "./types";

/*
 * Реестр объектов.
 *
 * Приложение ведёт несколько объектов сразу и переключается между ними.
 * Каждый объект лежит отдельной записью `project:<id>`, а список объектов —
 * записью `index`. Список держим отдельно, чтобы показать перечень, не читая
 * все проекты целиком (проект со сметой — сотни килобайт). Если список
 * разошёлся с записями — например, запись сохранилась, а список нет, — он
 * восстанавливается по самим записям: истина в записях, а не в списке.
 */

export const PROJECT_PREFIX = "project:";
const INDEX_KEY = "index";
const CURRENT_KEY = "current";

/** Ключ старого хранилища — один проект в localStorage */
export const LEGACY_KEY = "cableestimate:project";

export interface ProjectMeta {
  id: string;
  name: string;
  code: string;
  /** ISO-время последнего сохранения */
  updatedAt: string;
  createdAt: string;
  /** Число участков, актов и признак сметы — чтобы в списке было видно, что за объект */
  segments: number;
  acts: number;
  hasSmeta: boolean;
  /** Размер записи в байтах — видно, сколько объект занимает */
  size: number;
}

interface StoredProject {
  version: number;
  savedAt: string;
  state: ProjectState;
}

let uid = 0;
export const newProjectId = () =>
  `p${Date.now().toString(36)}${(uid++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const byUpdated = (a: ProjectMeta, b: ProjectMeta) => b.updatedAt.localeCompare(a.updatedAt);

function metaOf(id: string, state: ProjectState, createdAt: string, savedAt: string, size: number): ProjectMeta {
  return {
    id,
    name: state.projectName,
    code: state.projectCode,
    updatedAt: savedAt,
    createdAt,
    segments: state.segments.length,
    acts: state.acts?.length ?? 0,
    hasSmeta: Boolean(state.smeta),
    size,
  };
}

const readIndex = async (kv: Kv): Promise<ProjectMeta[]> =>
  (await kv.get<ProjectMeta[]>(INDEX_KEY)) ?? [];

const writeIndex = (kv: Kv, list: ProjectMeta[]) => kv.set(INDEX_KEY, [...list].sort(byUpdated));

/**
 * Перечень объектов. Записи, которых нет в списке, добавляются в него, а
 * пропавшие записи из списка убираются: список — производная величина.
 */
export async function listProjects(kv: Kv): Promise<ProjectMeta[]> {
  const index = await readIndex(kv);
  const keys = await kv.keys(PROJECT_PREFIX);
  const ids = new Set(keys.map((k) => k.slice(PROJECT_PREFIX.length)));

  const alive = index.filter((m) => ids.has(m.id));
  const missing = [...ids].filter((id) => !alive.some((m) => m.id === id));
  if (missing.length === 0 && alive.length === index.length) return [...alive].sort(byUpdated);

  for (const id of missing) {
    const rec = await kv.get<StoredProject>(PROJECT_PREFIX + id);
    if (!rec?.state?.params) continue;
    alive.push(metaOf(id, rec.state, rec.savedAt, rec.savedAt, JSON.stringify(rec).length));
  }
  const repaired = [...alive].sort(byUpdated);
  await writeIndex(kv, repaired);
  return repaired;
}

/** Читает объект, приводя его к текущему формату; notes показываются пользователю */
export async function loadProject(kv: Kv, id: string): Promise<MigrationResult | null> {
  const rec = await kv.get<StoredProject>(PROJECT_PREFIX + id);
  if (!rec || !isSupportedVersion(rec.version) || !rec.state?.params) return null;
  return migrateProject(rec.state, rec.version);
}

/**
 * Сохраняет объект и обновляет список.
 *
 * Сначала запись, потом список: если запись не прошла (нет места), список
 * останется прежним и не будет обещать объект, которого нет. Обратный порядок
 * приводил бы к строке в списке без данных.
 */
export async function saveProject(kv: Kv, id: string, state: ProjectState): Promise<ProjectMeta> {
  const rec: StoredProject = { version: SCHEMA_VERSION, savedAt: new Date().toISOString(), state };
  await kv.set(PROJECT_PREFIX + id, rec);

  const index = await readIndex(kv);
  const prev = index.find((m) => m.id === id);
  const meta = metaOf(id, state, prev?.createdAt ?? rec.savedAt, rec.savedAt, JSON.stringify(rec).length);
  await writeIndex(kv, [...index.filter((m) => m.id !== id), meta]);
  return meta;
}

export async function createProject(kv: Kv, state: ProjectState): Promise<ProjectMeta> {
  return saveProject(kv, newProjectId(), state);
}

/**
 * Копия объекта — обычно чтобы начать новый объект с готовыми параметрами.
 * Акты и смета не копируются: принятые объёмы относятся к своему объекту, и
 * перенос их в новый означал бы, что работы приняты дважды.
 */
export async function duplicateProject(kv: Kv, id: string): Promise<ProjectMeta | null> {
  const loaded = await loadProject(kv, id);
  if (!loaded) return null;
  const copy: ProjectState = {
    ...loaded.state,
    projectName: `${loaded.state.projectName} (копия)`,
    acts: [],
    smeta: undefined,
  };
  return createProject(kv, copy);
}

export async function deleteProject(kv: Kv, id: string): Promise<void> {
  await kv.delete(PROJECT_PREFIX + id);
  await writeIndex(kv, (await readIndex(kv)).filter((m) => m.id !== id));
  if ((await getCurrentId(kv)) === id) await kv.delete(CURRENT_KEY);
}

export const getCurrentId = (kv: Kv) => kv.get<string>(CURRENT_KEY);
export const setCurrentId = (kv: Kv, id: string) => kv.set(CURRENT_KEY, id);

/**
 * Переносит проект из старого хранилища (один ключ localStorage) в реестр.
 *
 * Старый ключ не удаляется: пока пользователь не убедился, что всё на месте,
 * единственная копия его работы не должна зависеть от успеха переноса.
 * Повторно перенос не делается — иначе объект двоился бы при каждом запуске.
 */
export async function adoptLegacy(kv: Kv, raw: string | null): Promise<ProjectMeta | null> {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as StoredProject;
    if (!isSupportedVersion(payload.version) || !payload.state?.params) return null;
    const { state } = migrateProject(payload.state, payload.version);
    return await saveProject(kv, newProjectId(), state);
  } catch {
    return null;
  }
}

export interface Workspace {
  kv: Kv;
  projects: ProjectMeta[];
  current: ProjectMeta;
  state: ProjectState;
  /** Что изменила миграция открытого объекта */
  notes: string[];
}

/**
 * Готовит рабочее место при запуске: открывает хранилище, при первом запуске
 * подбирает проект из старого хранилища, и открывает последний объект.
 */
export async function openWorkspace(
  kv: Kv,
  makeDefault: () => ProjectState,
  legacyRaw: string | null,
): Promise<Workspace> {
  let projects = await listProjects(kv);

  if (projects.length === 0) {
    const adopted = await adoptLegacy(kv, legacyRaw);
    const meta = adopted ?? (await createProject(kv, makeDefault()));
    projects = [meta];
  }

  const wanted = await getCurrentId(kv);
  const current = projects.find((m) => m.id === wanted) ?? projects[0];
  const loaded = await loadProject(kv, current.id);
  await setCurrentId(kv, current.id);

  return {
    kv,
    projects,
    current,
    state: loaded?.state ?? makeDefault(),
    notes: loaded?.notes ?? [],
  };
}
