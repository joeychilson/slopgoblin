import type { Scores } from "../core/decisions.ts";

interface Entry {
  id: string;
  /** The `questionKey` these scores answer. */
  key: string;
  scores: Scores;
  notSlop?: boolean;
  seen: number;
}

const STORE = "posts";
const TTL = 30 * 864e5;

let db: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("slopgoblin", 2);
    req.onupgradeneeded = () => {
      if (req.result.objectStoreNames.contains(STORE)) req.result.deleteObjectStore(STORE);
      req.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("seen", "seen");
    };
    req.onsuccess = () => {
      // Chrome closes it when the reader clears site data; reopen on next use.
      req.result.onclose = () => (db = undefined);
      resolve(req.result);
    };
    req.onerror = () => {
      db = undefined;
      reject(req.error);
    };
  });
  return db;
}

async function store(mode: IDBTransactionMode) {
  return (await open()).transaction(STORE, mode).objectStore(STORE);
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const getEntry = async (id: string): Promise<Entry | undefined> =>
  done((await store("readonly")).get(id));

export const putEntry = async (entry: Entry) => {
  await done((await store("readwrite")).put(entry));
};

export async function prune() {
  const objectStore = await store("readwrite");
  const cursors = objectStore.index("seen").openKeyCursor(IDBKeyRange.upperBound(Date.now() - TTL));
  cursors.onsuccess = () => {
    const cursor = cursors.result;
    if (!cursor) return;
    objectStore.delete(cursor.primaryKey);
    cursor.continue();
  };
}
