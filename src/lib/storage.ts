import { isSupportedVersion, migrateProject, SCHEMA_VERSION, type MigrationResult } from "./migrate";
import type { ProjectState } from "./types";

/*
 * Файлы проекта.
 *
 * Объекты хранятся в браузере (см. lib/projects.ts), а .json — способ унести
 * объект на другую машину или оставить копию перед опасной правкой.
 */

interface StoredPayload {
  version: number;
  savedAt: string;
  state: ProjectState;
}

export function exportJsonFile(state: ProjectState) {
  const payload: StoredPayload = { version: SCHEMA_VERSION, savedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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
