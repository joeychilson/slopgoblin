import type { Scores } from "../core/decisions.ts";

/** A post's cached answer. */
export interface Entry {
  id: string;
  /** The `questionKey` the scores answer. Rewording the question makes them stale. */
  key: string;
  scores: Scores;
  /** Rejected by the API's safety filter; never resent. */
  blocked?: boolean;
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
      // Version 1 kept one score per yes/no question. Those answers don't carry over.
      if (req.result.objectStoreNames.contains(STORE)) req.result.deleteObjectStore(STORE);
      req.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("seen", "seen");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
  const index = (await store("readwrite")).index("seen");
  const cursors = index.openCursor(IDBKeyRange.upperBound(Date.now() - TTL));
  cursors.onsuccess = () => {
    const cursor = cursors.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
}
