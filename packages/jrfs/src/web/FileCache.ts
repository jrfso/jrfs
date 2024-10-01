import { openDB } from "idb";

export interface FileCacheItem {
  ctime: number;
  data: unknown;
}

export interface FileCache {
  get(id: string): Promise<FileCacheItem>;
  set(id: string, value: FileCacheItem): Promise<FileCacheItem>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export async function createFileCache() {
  const db = await openDB("fcache", 1, {
    upgrade(db, oldVersion, newVersion, tx, event) {
      db.createObjectStore("fdata");
    },
  });
  const fileCache: FileCache = {
    get(id: string) {
      return db.get("fdata", id);
    },
    async set(id: string, value: FileCacheItem) {
      await db.put("fdata", value, id);
      return value;
    },
    delete(id: string) {
      return db.delete("fdata", id);
    },
    clear() {
      return db.clear("fdata");
    },
    keys() {
      return db.getAllKeys("fdata") as Promise<string[]>;
    },
  };
  return fileCache;
}
