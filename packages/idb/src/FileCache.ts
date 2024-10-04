/**
 * @file A file cache with IndexedDB.
 *
 * References:
 * - [idb on github](https://github.com/jakearchibald/idb)
 * - [How to use idb, a 1kb package that makes IndexedDB easy](https://hackernoon.com/use-indexeddb-with-idb-a-1kb-library-that-makes-it-easy-8p1f3yqq)
 *
 */
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
import { apply } from "mutative";

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

  async function getItem(entryOrId: EntryOrId) {
    const id = idOrEntryId(entryOrId);
    return db.get(store, id);
  }

  async function deleteItem(entryOrId: EntryOrId) {
    const id = idOrEntryId(entryOrId);
    console.log("[IDB] FileCache.delete", id);
    await db.delete(store, id);
  }

  async function setItem<T = Readonly<unknown>>(entry: Entry, data: T) {
    const { id, ctime } = entry;
    console.log("[IDB] FileCache.set", id, ctime, data);
    const item: FileCacheItem<T> = {
      ctime,
      data,
    };
    await db.put(store, item, id);
    return item;
  }

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

  async function onTreeChange(changes: FileTreeChange) {
    const { id, /*tx,op,added,changed,*/ removed, patch } = changes;
    if (removed) {
      console.log(`[IDB] onTreeChange (removed)`, logFileTreeChange(changes));
      for (const id of removed) {
        if (isFileId(id)) deleteItem(id);
      }
    } else if (patch) {
      // We only patch our cached item if the tree has no in-memory data for it.
      // This situation happens when the client reads and caches the data, then
      // refreshes the page.
      //
      // If the tree DOES have in-memory data (from a read), then the
      // WritableFileTree.sync will do the patch and our cache will be updated
      // shortly in our onDataChange handler. To avoid double cache writes, in
      // that situation, we don't patch the cache item here.
      //
      if (typeof tree.data(id) === "undefined") {
        const entry = tree.getEntry(id)!;
        const { ctime } = entry;
        const trx = db.transaction(store, "readwrite");
        const cached = (await trx.store.get(id)) as FileCacheItem;
        if (cached && cached.ctime === ctime) {
          console.log("Cache already updated", id, ctime);
          return;
        }
        if (patch.ctime !== cached.ctime) {
          await trx.store.delete(id);
          console.warn(
            `[IDB] Detected out of sync cache in [onTreeChange]->` +
              `"${id}@${ctime}".`,
          );
          return;
        }
        // TODO: Don't make me import `apply` from "mutative".
        const data = apply(cached.data, patch.patches);
        await trx.store.put({ ctime, data } satisfies FileCacheItem, id);
      }
    }
  }

  function removeOutOfSync(
    cached: FileCacheItem,
    entry: Entry,
    caller?: string,
  ): boolean {
    const { id } = entry;
    async function removeIfOutOfSync() {
      // In a transaction, check the cached item again to ensure out of sync.
      const trx = db.transaction(store, "readwrite");
      const cached = (await trx.store.get(id)) as FileCacheItem;
      if (cached) {
        const { ctime } = cached;
        const current = tree.getEntry(id);
        const remove = !current || current.ctime !== ctime;
        if (!remove) return;
        // Prune expired item immediately.
        await trx.store.delete(id);
        console.warn(
          `[IDB] Detected out of sync cache in [${caller}]->"${id}@${ctime}".`,
        );
      }
    }
    const probablyOutOfSync = cached.ctime !== entry.ctime;
    if (probablyOutOfSync) {
      removeIfOutOfSync();
    }
    return probablyOutOfSync;
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
      if (!item || removeOutOfSync(item, entry, "FileCache.getData")) {
        return undefined;
      }
      // Return cached data.
      return item.data as T;
    },
    async remove() {
      // TODO: Handle blocked callback of deleteDB().
      await deleteDB(dbName);
    },
  };
  return fileCache;
}
