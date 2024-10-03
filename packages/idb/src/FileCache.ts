import { IDBPDatabase, deleteDB, openDB } from "idb";
import {
  type Entry,
  type EntryOrId,
  type FileDataChange,
  type FileTree,
  type FileTreeChange,
  idOrEntryId,
  isFileId,
  logFileTreeChange,
} from "@jrfs/core";
import type { FileCacheProvider } from "@jrfs/core/cache";

export interface IdbFileCacheOptions {
  db?: string;
  store?: string;
}

interface FileCacheItem<T = Readonly<unknown>> {
  ctime: number;
  data: T;
}

export function createFileCache(options: IdbFileCacheOptions = {}) {
  const { db: dbName = "fcache", store = "fdata" } = options;
  let db = null! as IDBPDatabase<unknown>;
  let tree = null! as FileTree;
  let unsubFromDataChanges: () => void | undefined;
  let unsubFromTreeChanges: () => void | undefined;
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

  async function getItem(entryOrId: EntryOrId) {
    const id = idOrEntryId(entryOrId);
    await waitIfWriting(id);
    return db.get(store, id);
  }

  async function deleteItem(entryOrId: EntryOrId) {
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
  }

  async function setItem<T = Readonly<unknown>>(entry: Entry, data: T) {
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
  }

  // async function clearItems() {
  //   console.log("[IDB] FileCache.clear");
  //   return db.clear(store);
  // }

  function onDataChange(change: FileDataChange) {
    const { entry, data } = change;
    const hasValue = typeof data !== "undefined";
    console.log(`[IDB] onDataChange`, entry.id, hasValue ? "(SET)" : "(DEL)");
    if (hasValue) {
      setItem(entry, data);
    } else {
      deleteItem(entry);
    }
  }

  function onTreeChange(changes: FileTreeChange) {
    const { /*id,tx,op,added,changed,*/ removed /*,patch*/ } = changes;
    // console.log(`[IDB] onTreeChange`, logFileTreeChange(changes));
    // if (added || changed) {
    //   const data = tree.data(id);
    //   if (typeof data !== "undefined") {
    //     const entry = tree.getEntry(id);
    //     if (entry) {
    //       setItem(entry, data);
    //     }
    //   }
    // }
    if (removed) {
      console.log(`[IDB] onTreeChange (removed)`, logFileTreeChange(changes));
      for (const id of removed) {
        if (isFileId(id)) deleteItem(id);
      }
    }
  }

  const fileCache: FileCacheProvider = {
    async open(fileTree) {
      tree = fileTree;
      db = await openDB(dbName, 1, {
        upgrade(db, oldVersion, newVersion, tx, event) {
          db.createObjectStore(store);
        },
      });
      unsubFromDataChanges = tree.onDataChange(onDataChange);
      unsubFromTreeChanges = tree.onChange(onTreeChange);
    },
    async close() {
      if (unsubFromDataChanges) unsubFromDataChanges();
      if (unsubFromTreeChanges) unsubFromTreeChanges();
      if (db) db.close();
    },
    async getData<T = unknown>(entry: Entry) {
      // Cached item?
      const item = await getItem(entry);
      if (!item) return undefined;
      // Matches current timestamp?
      const { id, ctime } = entry;
      if (item.ctime !== ctime) {
        // Prune expired item immediately.
        console.warn(
          `[IDB] FileCache item was out of sync "${id}@${item.ctime}"`,
        );
        await deleteItem(id);
        return undefined;
      }
      // Return cached data.
      return item.data as T;
    },
    async remove() {
      // TODO: Handle blocked callback of deleteDB().
      await deleteDB(dbName);
      // CONSIDER: We can offer an option to clear items instead of whole db.
    },
  };
  return fileCache;
}

/** `[resolve, reject]` */
type PromiseCallbacks = [(result?: any) => void, (reason?: any) => void];
