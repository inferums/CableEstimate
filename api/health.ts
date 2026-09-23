/*
 * Простейшая проверка живости: ни одного импорта, ни одной зависимости.
 *
 * Нужна для разделения причин, когда /api/sync отвечает пустым 500. Если эта
 * функция отвечает, а sync падает — дело в его зависимостях; если молчат обе,
 * сломан сам механизм функций (рантайм, версия Node, настройки сборки).
 *
 * Секретов не выдаёт: только признак жизни и версия рантайма, поэтому пароля
 * не требует — иначе ей нельзя было бы воспользоваться, когда пароль и есть
 * предмет разбирательства.
 */

interface NodeResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

const body = () =>
  JSON.stringify({
    ok: true,
    node: process.version,
    /* Задан ли пароль — да или нет, без значения */
    passwordSet: Boolean(process.env.CABLE_SYNC_PASSWORD),
  });

/* Оба соглашения вызова, как и в sync: какое применит рантайм — не наше дело */
export default function handler(a: unknown, b?: unknown): Response | void {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (typeof (a as Request)?.headers?.get === "function") {
    return new Response(body(), { status: 200, headers });
  }
  const res = b as NodeResponse;
  res.statusCode = 200;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body());
}
