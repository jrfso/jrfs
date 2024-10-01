import { openDB } from "idb";
import type { FileCacheProvider } from "@jrfs/core";

export interface IdbFileCacheOptions {
  db?: string;
  store?: string;
}

export async function createFileCache(options: IdbFileCacheOptions = {}) {
  const { db: dbName = "fcache", store = "fdata" } = options;
  const db = await openDB(dbName, 1, {
    upgrade(db, oldVersion, newVersion, tx, event) {
      db.createObjectStore(store);
    },
  });
  const fileCache: FileCacheProvider = {
    get(id) {
      return db.get(store, id);
    },
    async set(id, value) {
      await db.put(store, value, id);
      return value;
    },
    delete(id) {
      return db.delete(store, id);
    },
    clear() {
      return db.clear(store);
    },
    keys() {
      return db.getAllKeys(store) as Promise<string[]>;
    },
  };
  return fileCache;
}
