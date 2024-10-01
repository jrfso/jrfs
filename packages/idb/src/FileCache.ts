import { openDB } from "idb";
import {
  type Entry,
  type FileCacheItem,
  type FileCacheProvider,
  idOrEntryId,
} from "@jrfs/core";

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
    get(entryOrId) {
      const id = idOrEntryId(entryOrId);
      return db.get(store, id);
    },
    async getData<T = unknown>(entry: Entry): Promise<T | undefined> {
      const { id, ctime } = entry;
      // Cached item?
      const item = (await db.get(store, id)) as FileCacheItem;
      if (!item) return undefined;
      // Matches current timestamp?
      if (item.ctime !== ctime) {
        // Prune expired item immediately.
        await db.delete(store, id);
        return undefined;
      }
      // Return cached data.
      return item.data as T;
    },
    async set(entry, data) {
      const item: FileCacheItem = {
        ctime: entry.ctime,
        data,
      };
      await db.put(store, item, entry.id);
      return item;
    },
    delete(entryOrId) {
      const id = idOrEntryId(entryOrId);
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
