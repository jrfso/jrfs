import { openDB } from "idb";
import { type Entry, idOrEntryId } from "@jrfs/core";
import {
  type FileCacheItem,
  type FileCacheProvider,
} from "./FileCacheProvider";

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
  const writing = new Map<string, Promise<void>>();

  function doneWriting(id: string, next: () => void, ctime = -1) {
    writing.delete(id);
    console.log("[IDB] Wrote", id, ctime);
    next();
  }

  function startWriting(id: string, ctime = -1) {
    let callbacks!: PromiseCallbacks;
    writing.set(
      id,
      new Promise<void>((resolve, reject) => {
        callbacks = [resolve, reject];
      }),
    );
    console.log("[IDB] Writing", id, ctime);
    return callbacks;
  }
  /**
   * This function is needed since WritableFileTree writes are synchronous, so
   * they don't wait for FileCache write operations to finish. Meanwhile, any
   * functions that READ from FileCache will certainly wait for the result and
   * therefore, we will make them wait until writes are finished before reading.
   *
   * However, we do not block writes while reading and we depend on IDB to sync.
   */
  async function waitIfWriting(id: string) {
    const writer = writing.get(id);
    if (!writer) return;
    await writer;
  }

  const fileCache: FileCacheProvider = {
    async get(entryOrId) {
      const id = idOrEntryId(entryOrId);
      await waitIfWriting(id);
      return db.get(store, id);
    },
    async getData<T = unknown>(entry: Entry) {
      const { id, ctime } = entry;
      await waitIfWriting(id);
      // Cached item?
      const item = (await db.get(store, id)) as FileCacheItem;
      if (!item) return undefined;
      // Matches current timestamp?
      if (item.ctime !== ctime) {
        // Prune expired item immediately.
        console.warn(
          `[IDB] FileCache item was out of sync "${id}@${item.ctime}"`,
        );
        await fileCache.delete(id);
        return undefined;
      }
      // Return cached data.
      return item.data as T;
    },
    async set<T = Readonly<unknown>>(entry: Entry, data: T) {
      const { id, ctime } = entry;
      console.log("[IDB] FileCache.set", id, ctime, data);
      await waitIfWriting(id);
      const [resolve, reject] = startWriting(id, ctime);
      const item: FileCacheItem<T> = {
        ctime,
        data,
      };
      try {
        await db.put(store, item, id);
      } catch (ex) {
        doneWriting(id, () => reject(ex), ctime);
        throw ex;
      }
      doneWriting(id, resolve, ctime);
      return item;
    },
    async delete(entryOrId) {
      const id = idOrEntryId(entryOrId);
      console.log("[IDB] FileCache.delete", id);
      await waitIfWriting(id);
      const [resolve, reject] = startWriting(id);
      try {
        await db.delete(store, id);
      } catch (ex) {
        doneWriting(id, () => reject(ex));
        throw ex;
      }
      doneWriting(id, resolve);
    },
    clear() {
      console.log("[IDB] FileCache.clear");
      return db.clear(store);
    },
    keys() {
      return db.getAllKeys(store) as Promise<string[]>;
    },
  };
  return fileCache;
}

/** `[resolve, reject]` */
type PromiseCallbacks = [(result?: any) => void, (reason?: any) => void];
