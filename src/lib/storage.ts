import type { ProjectState } from "./types";

const STORAGE_KEY = "cableestimate:project";
const SCHEMA_VERSION = 1;

interface StoredPayload {
  version: number;
  savedAt: string;
  state: ProjectState;
}

export function saveToLocal(state: ProjectState) {
  try {
    const payload: StoredPayload = {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      state,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

export function loadFromLocal(): ProjectState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload: StoredPayload = JSON.parse(raw);
    if (payload.version !== SCHEMA_VERSION) return null;
    return payload.state;
  } catch {
    return null;
  }
}

export function exportJsonFile(state: ProjectState) {
  const payload: StoredPayload = {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const code = (state.projectCode || "КЛ").replace(/\s+/g, "_");
  a.href = url;
  a.download = `CableEstimate_${code}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJsonFile(file: File): Promise<ProjectState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload: StoredPayload = JSON.parse(reader.result as string);
        if (payload.version !== SCHEMA_VERSION) {
          reject(new Error("Несовместимая версия файла"));
          return;
        }
        if (!payload.state || !payload.state.segments || !payload.state.params) {
          reject(new Error("Файл не содержит данные проекта"));
          return;
        }
        resolve(payload.state);
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
