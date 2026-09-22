import { del, get, list, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import {
  actPath,
  actsPrefix,
  isValidId,
  metaPath,
  PREFIX,
  projectPath,
  remoteMeta,
  safeActId,
  type RemoteMeta,
} from "../src/lib/cloud-shared";
import type { Act, ProjectState } from "../src/lib/types";

/*
 * Синхронизация объектов с приватным хранилищем Vercel Blob.
 *
 * Доступ закрыт общим паролем (CABLE_SYNC_PASSWORD): хранилище приватное, но
 * сама функция иначе открыта всему интернету. Пароль сравнивается за
 * постоянное время — иначе его можно подобрать по времени ответа.
 *
 * Раскладка файлов: objects/<id>/meta.json, project.json и acts/<actId>.json.
 * Акты пишутся один раз и не переписываются — это и есть защита принятых
 * объёмов от гонки двух машин.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });

function passwordOk(given: string): boolean {
  const want = process.env.CABLE_SYNC_PASSWORD ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  /* Длины сравниваем отдельно: timingSafeEqual требует равной длины */
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Читает файл из приватного хранилища; useCache: false — иначе можно получить версию до записи */
async function readJson<T>(pathname: string): Promise<T | null> {
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const writeJson = (pathname: string, value: unknown) =>
  put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

async function listMetas(): Promise<RemoteMeta[]> {
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const metaFiles = blobs.filter((b) => b.pathname.endsWith("/meta.json"));
  const metas = await Promise.all(metaFiles.map((b) => readJson<RemoteMeta>(b.pathname)));
  return metas.filter((m): m is RemoteMeta => m !== null);
}

async function pull(id: string) {
  const state = await readJson<ProjectState>(projectPath(id));
  if (!state) return json({ error: "Объекта нет в облаке" }, 404);

  const { blobs } = await list({ prefix: actsPrefix(id), limit: 1000 });
  const acts = (await Promise.all(blobs.map((b) => readJson<Act>(b.pathname)))).filter(
    (a): a is Act => a !== null,
  );
  const meta = await readJson<RemoteMeta>(metaPath(id));
  return json({ state, acts, meta });
}

async function push(id: string, state: ProjectState, device: string, base: string | null, force: boolean) {
  const current = await readJson<RemoteMeta>(metaPath(id));
  /* Кто-то записал объект после того, как мы его забирали, — решает человек */
  if (current && current.updatedAt !== base && !force) {
    return json({ error: "conflict", remote: current }, 409);
  }

  /* Акт пишется один раз: уже уехавший акт не трогаем даже при перезаписи */
  const known = new Set(
    (await list({ prefix: actsPrefix(id), limit: 1000 })).blobs.map((b) =>
      b.pathname.slice(actsPrefix(id).length).replace(/\.json$/, ""),
    ),
  );
  for (const act of state.acts ?? []) {
    if (!safeActId(act.id) || known.has(act.id)) continue;
    await writeJson(actPath(id, act.id), act);
  }

  const body = JSON.stringify(state);
  await writeJson(projectPath(id), state);
  const meta = remoteMeta(id, state, device, body.length);
  await writeJson(metaPath(id), meta);
  return json({ meta });
}

async function remove(id: string) {
  const { blobs } = await list({ prefix: `${PREFIX}${id}/`, limit: 1000 });
  if (blobs.length > 0) await del(blobs.map((b) => b.pathname));
  return json({ ok: true });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Только POST" }, 405);
  if (!process.env.CABLE_SYNC_PASSWORD) {
    return json({ error: "Синхронизация не настроена: не задан CABLE_SYNC_PASSWORD" }, 503);
  }

  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!passwordOk(given)) return json({ error: "Неверный пароль" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Ожидается JSON" }, 400);
  }

  const action = body.action;
  const id = typeof body.id === "string" ? body.id : "";
  if (action !== "list" && !isValidId(id)) return json({ error: "Неверный идентификатор объекта" }, 400);

  try {
    if (action === "list") return json({ objects: await listMetas() });
    if (action === "pull") return pull(id);
    if (action === "delete") return remove(id);
    if (action === "push") {
      const state = body.state as ProjectState | undefined;
      if (!state?.params || !Array.isArray(state.segments)) {
        return json({ error: "В запросе нет проекта" }, 400);
      }
      const device = typeof body.device === "string" ? body.device.slice(0, 64) : "—";
      const base = typeof body.base === "string" ? body.base : null;
      return await push(id, state, device, base, body.force === true);
    }
    return json({ error: "Неизвестное действие" }, 400);
  } catch (err) {
    return json({ error: `Хранилище: ${(err as Error).message}` }, 502);
  }
}
