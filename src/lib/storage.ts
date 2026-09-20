import { isSupportedVersion, migrateProject, SCHEMA_VERSION, type MigrationResult } from "./migrate";
import type { ProjectState } from "./types";

const STORAGE_KEY = "cableestimate:project";

interface StoredPayload {
  version: number;
  savedAt: string;
  state: ProjectState;
}

const payloadFor = (state: ProjectState): StoredPayload => ({
  version: SCHEMA_VERSION,
  savedAt: new Date().toISOString(),
  state,
});

export function saveToLocal(state: ProjectState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payloadFor(state)));
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

/**
 * Читает проект из localStorage, приводя его к текущему формату.
 *
 * Проект более ранней версии не выбрасывается: он мигрируется, а всё, что
 * пришлось подправить, возвращается в notes, чтобы пользователь это увидел.
 */
export function loadFromLocal(): MigrationResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload: StoredPayload = JSON.parse(raw);
    if (!isSupportedVersion(payload.version) || !payload.state?.params) return null;
    return migrateProject(payload.state, payload.version);
  } catch {
    return null;
  }
}

export function exportJsonFile(state: ProjectState) {
  const blob = new Blob([JSON.stringify(payloadFor(state), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const code = (state.projectCode || "КЛ").replace(/\s+/g, "_");
  a.href = url;
  a.download = `CableEstimate_${code}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJsonFile(file: File): Promise<MigrationResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload: StoredPayload = JSON.parse(reader.result as string);
        if (!isSupportedVersion(payload.version)) {
          reject(new Error(`Формат файла (версия ${payload.version}) не поддерживается`));
          return;
        }
        if (!payload.state || !payload.state.segments || !payload.state.params) {
          reject(new Error("Файл не содержит данные проекта"));
          return;
        }
        resolve(migrateProject(payload.state, payload.version));
      } catch {
        reject(new Error("Ошибка чтения файла"));
      }
    };
    reader.onerror = () => reject(new Error("Ошибка чтения файла"));
    reader.readAsText(file);
  });
}

export function clearLocal() {
  localStorage.removeItem(STORAGE_KEY);
}
