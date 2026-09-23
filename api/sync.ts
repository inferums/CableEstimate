import { timingSafeEqual } from "node:crypto";
import {
  actPath,
  actsPrefix,
  encodeToken,
  isValidId,
  metaPath,
  PREFIX,
  projectPath,
  remoteMeta,
  safeActId,
  type RemoteMeta,
} from "./_shared";
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

/*
 * SDK хранилища подключается на месте, а не при загрузке модуля.
 *
 * При загрузке его отказ — например, когда рантайм функции старше Node 20, —
 * роняет функцию целиком, и наружу уходит пустой 500 без объяснений. Здесь
 * отказ становится обычной ошибкой с текстом, который видно в приложении.
 */
const blob = () => import("@vercel/blob");

function passwordOk(given: string): boolean {
  /* Сравниваем в том же виде, в каком пароль приходит в заголовке */
  const want = encodeToken(process.env.CABLE_SYNC_PASSWORD ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  /* Длины сравниваем отдельно: timingSafeEqual требует равной длины */
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Читает файл из приватного хранилища; useCache: false — иначе можно получить версию до записи */
async function readJson<T>(pathname: string): Promise<T | null> {
  const { get } = await blob();
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, value: unknown) {
  const { put } = await blob();
  return put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function listMetas(): Promise<RemoteMeta[]> {
  const { list } = await blob();
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const metaFiles = blobs.filter((b) => b.pathname.endsWith("/meta.json"));
  const metas = await Promise.all(metaFiles.map((b) => readJson<RemoteMeta>(b.pathname)));
  return metas.filter((m): m is RemoteMeta => m !== null);
}

async function pull(id: string) {
  const state = await readJson<ProjectState>(projectPath(id));
  if (!state) return json({ error: "Объекта нет в облаке" }, 404);

  const { list } = await blob();
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
  const { list } = await blob();
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
  const { del, list } = await blob();
  const { blobs } = await list({ prefix: `${PREFIX}${id}/`, limit: 1000 });
  if (blobs.length > 0) await del(blobs.map((b) => b.pathname));
  return json({ ok: true });
}

/** Запрос, приведённый к одному виду независимо от соглашения рантайма */
interface Incoming {
  method: string;
  authorization: string;
  readBody: () => Promise<string>;
}

async function route(request: Incoming): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Только POST" }, 405);
  if (!process.env.CABLE_SYNC_PASSWORD) {
    return json({ error: "Синхронизация не настроена: не задан CABLE_SYNC_PASSWORD" }, 503);
  }

  const given = request.authorization.replace(/^Bearer\s+/i, "");
  if (!passwordOk(given)) return json({ error: "Неверный пароль" }, 401);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.readBody()) as Record<string, unknown>;
  } catch {
    return json({ error: "Ожидается JSON" }, 400);
  }

  const action = body.action;
  const id = typeof body.id === "string" ? body.id : "";
  const needsId = action !== "list" && action !== "ping";
  if (needsId && !isValidId(id)) return json({ error: "Неверный идентификатор объекта" }, 400);

  try {
    /*
     * Самопроверка: что видит функция на сервере. Только признаки наличия,
     * без значений — иначе проверка сама раздавала бы токены. Отвечает уже
     * после проверки пароля, поэтому посторонним недоступна.
     */
    if (action === "ping") {
      let sdk = "ок";
      try {
        await blob();
      } catch (err) {
        sdk = (err as Error).message;
      }
      return json({
        node: process.version,
        sdk,
        env: {
          CABLE_SYNC_PASSWORD: true,
          BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
          BLOB_STORE_ID: Boolean(process.env.BLOB_STORE_ID),
          VERCEL_OIDC_TOKEN: Boolean(process.env.VERCEL_OIDC_TOKEN),
        },
      });
    }
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

/*
 * Функцию можно вызвать двумя способами: веб-соглашением (Request → Response)
 * и узловым (req, res). Какое применит рантайм, зависит от его версии, а
 * ошибка выглядит одинаково безлико — пустой 500. Поэтому обслуживаем оба:
 * различаем по тому, есть ли у заголовков метод get, как у веб-запроса.
 */

interface NodeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  setEncoding?: (enc: string) => void;
  on: (event: string, cb: (chunk?: unknown) => void) => void;
}

interface NodeResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

const isWebRequest = (x: unknown): x is Request =>
  typeof (x as Request)?.headers?.get === "function" && typeof (x as Request).json === "function";

const readNodeBody = (req: NodeRequest): Promise<string> =>
  new Promise((resolve, reject) => {
    /* Рантайм часто разбирает тело за нас — тогда читать поток уже нечего */
    if (req.body !== undefined && req.body !== null) {
      resolve(typeof req.body === "string" ? req.body : JSON.stringify(req.body));
      return;
    }
    let data = "";
    req.setEncoding?.("utf8");
    req.on("data", (chunk) => {
      data += String(chunk);
    });
    req.on("end", () => resolve(data));
    req.on("error", (err) => reject(err as Error));
  });

export default async function handler(a: unknown, b?: unknown): Promise<Response | void> {
  if (isWebRequest(a)) {
    return route({
      method: a.method,
      authorization: a.headers.get("authorization") ?? "",
      readBody: () => a.text(),
    });
  }

  const req = a as NodeRequest;
  const res = b as NodeResponse;
  const auth = req.headers?.authorization;
  const answer = await route({
    method: req.method ?? "GET",
    authorization: Array.isArray(auth) ? (auth[0] ?? "") : (auth ?? ""),
    readBody: () => readNodeBody(req),
  });

  res.statusCode = answer.status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(await answer.text());
}
