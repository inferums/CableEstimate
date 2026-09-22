/*
 * Хранилище «ключ — значение» для проектов.
 *
 * Раньше проект лежал в localStorage одним ключом: лимит около 5 МБ на весь
 * сайт, а ошибка записи при переполнении проглатывалась молча — приложение
 * продолжало работать, ничего не сохраняя. Для нескольких объектов со сметами
 * (проект со сметой — около 300 КБ) этого мало, поэтому основное хранилище —
 * IndexedDB: лимит на порядки больше, а отказ записи виден как отклонённое
 * обещание и доходит до пользователя.
 *
 * localStorage остаётся запасным вариантом: в приватном окне или при
 * запрещённой IndexedDB приложение должно работать, пусть и с прежним лимитом.
 */

export interface Kv {
  /** Как называется хранилище — показывается пользователю при работе на запасном */
  readonly kind: "indexeddb" | "localstorage";
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Ключи, начинающиеся с prefix; нужны, чтобы восстановить реестр по записям */
  keys(prefix?: string): Promise<string[]>;
}

const DB_NAME = "cableestimate";
const DB_VERSION = 1;
const STORE = "kv";

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Ошибка запроса к хранилищу"));
  });

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Не удалось открыть хранилище"));
    req.onblocked = () => reject(new Error("Хранилище занято другой вкладкой"));
  });
}

function idbKv(db: IDBDatabase): Kv {
  /*
   * Каждая операция — своя транзакция. Ошибка записи (нет места на диске,
   * запрет хранения) доходит до вызывающего кода, а не теряется.
   */
  const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  return {
    kind: "indexeddb",
    async get<T>(key: string) {
      return (await request(tx("readonly").get(key))) as T | undefined;
    },
    async set(key: string, value: unknown) {
      const store = tx("readwrite");
      await new Promise<void>((resolve, reject) => {
        const req = store.put(value, key);
        req.onerror = () => reject(req.error ?? new Error("Ошибка записи"));
        store.transaction.oncomplete = () => resolve();
        store.transaction.onabort = () =>
          reject(store.transaction.error ?? new Error("Запись отменена"));
      });
    },
    async delete(key: string) {
      await request(tx("readwrite").delete(key));
    },
    async keys(prefix = "") {
      const all = (await request(tx("readonly").getAllKeys())) as IDBValidKey[];
      return all.filter((k): k is string => typeof k === "string" && k.startsWith(prefix));
    },
  };
}

const LS_PREFIX = "cableestimate:kv:";

export function localStorageKv(): Kv {
  return {
    kind: "localstorage",
    get<T>(key: string) {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return Promise.resolve(raw === null ? undefined : (JSON.parse(raw) as T));
    },
    set(key: string, value: unknown) {
      /* Здесь ошибку переполнения намеренно не глушим — пусть дойдёт до UI */
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      return Promise.resolve();
    },
    delete(key: string) {
      localStorage.removeItem(LS_PREFIX + key);
      return Promise.resolve();
    },
    keys(prefix = "") {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(LS_PREFIX + prefix)) out.push(k.slice(LS_PREFIX.length));
      }
      return Promise.resolve(out);
    },
  };
}

/** Хранилище в памяти — для тестов и как последний рубеж, если оба недоступны */
export function memoryKv(): Kv {
  const map = new Map<string, string>();
  return {
    kind: "localstorage",
    get<T>(key: string) {
      const raw = map.get(key);
      return Promise.resolve(raw === undefined ? undefined : (JSON.parse(raw) as T));
    },
    set(key: string, value: unknown) {
      map.set(key, JSON.stringify(value));
      return Promise.resolve();
    },
    delete(key: string) {
      map.delete(key);
      return Promise.resolve();
    },
    keys(prefix = "") {
      return Promise.resolve([...map.keys()].filter((k) => k.startsWith(prefix)));
    },
  };
}

/** Открывает основное хранилище, откатываясь на localStorage, если IndexedDB недоступна */
export async function openKv(): Promise<Kv> {
  try {
    if (typeof indexedDB === "undefined") return localStorageKv();
    return idbKv(await openDb());
  } catch {
    return localStorageKv();
  }
}
