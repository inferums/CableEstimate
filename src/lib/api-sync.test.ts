import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/sync";
import { encodeToken } from "./cloud-shared";

/*
 * Проверка серверной функции без облака: SDK хранилища подменён.
 *
 * Главное здесь — функция обязана отвечать и когда рантайм зовёт её
 * веб-соглашением (Request → Response), и когда узловым (req, res). Разница
 * между ними снаружи выглядит одинаково — пустой 500, — и поймать её можно
 * только здесь.
 */

vi.mock("@vercel/blob", () => ({
  list: vi.fn().mockResolvedValue({ blobs: [] }),
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue({}),
  del: vi.fn().mockResolvedValue(undefined),
}));

const PASSWORD = "пароль-для-проверки";

beforeEach(() => {
  process.env.CABLE_SYNC_PASSWORD = PASSWORD;
});

afterEach(() => {
  delete process.env.CABLE_SYNC_PASSWORD;
});

/** Вызов веб-соглашением */
const web = (body: unknown, password = PASSWORD) =>
  handler(
    new Request("https://example.com/api/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${encodeToken(password)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  ) as Promise<Response>;

/** Вызов узловым соглашением: рантайм передаёт req и res */
async function node(body: unknown, password = PASSWORD, parsed = false) {
  const chunks = JSON.stringify(body);
  const req = {
    method: "POST",
    headers: { authorization: `Bearer ${encodeToken(password)}` },
    body: parsed ? (body as object) : undefined,
    setEncoding: () => {},
    on: (event: string, cb: (chunk?: unknown) => void) => {
      if (parsed) return;
      if (event === "data") cb(chunks);
      if (event === "end") cb();
    },
  };
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    payload: "",
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(payload = "") {
      this.payload = payload;
    },
  };
  await handler(req, res);
  return res;
}

describe("вызов веб-соглашением", () => {
  it("самопроверка отвечает сведениями о сервере", async () => {
    const res = await web({ action: "ping" });
    const data = (await res.json()) as { node: string; sdk: string; env: Record<string, boolean> };

    expect(res.status).toBe(200);
    expect(data.sdk).toBe("ок");
    expect(data.node).toMatch(/^v\d+/);
    expect(data.env.CABLE_SYNC_PASSWORD).toBe(true);
  });

  it("список объектов работает при пустом хранилище", async () => {
    const res = await web({ action: "list" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ objects: [] });
  });

  it("чужой пароль отклоняется", async () => {
    const res = await web({ action: "list" }, "не тот");
    expect(res.status).toBe(401);
  });

  it("идентификатор с выходом за пределы каталога отклоняется", async () => {
    const res = await web({ action: "pull", id: "../../secrets" });
    expect(res.status).toBe(400);
  });
});

describe("вызов узловым соглашением", () => {
  it("самопроверка отвечает тем же, что и веб-вызов", async () => {
    const res = await node({ action: "ping" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect((JSON.parse(res.payload) as { sdk: string }).sdk).toBe("ок");
  });

  it("тело читается и когда рантайм разобрал его за нас", async () => {
    const res = await node({ action: "list" }, PASSWORD, true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ objects: [] });
  });

  it("чужой пароль отклоняется", async () => {
    const res = await node({ action: "list" }, "не тот");
    expect(res.statusCode).toBe(401);
  });
});

describe("функция не настроена", () => {
  it("без пароля в окружении синхронизация выключена, а не открыта", async () => {
    delete process.env.CABLE_SYNC_PASSWORD;
    const res = await web({ action: "list" }, "");
    expect(res.status).toBe(503);
  });

  it("пустой пароль не подходит к заданному", async () => {
    const res = await web({ action: "list" }, "");
    expect(res.status).toBe(401);
  });
});
