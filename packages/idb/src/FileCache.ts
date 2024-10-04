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
  type FileDataChange,
  type FileTree,
  type FileTreeChange,
  isFileId,
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
  const { db: defaultDbName = "jrfs_fc", store = "fc" } = options;
  let db = null! as IDBPDatabase<unknown>;
  let dbName = null! as string;
  let tree = null! as FileTree;
  let unsubFromDataChanges: () => void | undefined;
  let unsubFromTreeChanges: () => void | undefined;

  async function getItem(entry: Entry): Promise<FileCacheItem> {
    return db.get(store, entry.id);
  }

  function deleteIfOutOfSync(
    cached: FileCacheItem,
    entry: Entry,
    caller?: string,
  ): boolean {
    const { id } = entry;
    async function deleteIfReallyOutOfSync() {
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
      deleteIfReallyOutOfSync();
    }
    return probablyOutOfSync;
  }

  function onDataChange(change: FileDataChange) {
    const { entry, data } = change;
    const hasValue = typeof data !== "undefined";
    const { id, ctime } = entry;
    console.log(`[IDB] onDataChange`, id, ctime, hasValue ? "(SET)" : "(DEL)");
    if (hasValue) {
      const item = { ctime, data } satisfies FileCacheItem<unknown>;
      db.put(store, item, id);
    } else {
      db.delete(store, entry.id);
    }
  }

  async function onTreeChange(changes: FileTreeChange) {
    const { id, /*tx,op,added,changed,*/ removed, patch } = changes;
    if (removed) {
      const ids = removed.filter(isFileId);
      if (ids.length < 1) return;
      console.log(`[IDB] onTreeChange (remove)`, ids);
      await db.delete(store, ids);
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
        console.log(`[IDB] onTreeChange`, id, ctime, "(SET)");
        // TODO: Don't make me import `apply` from "mutative".
        const data = apply(cached.data, patch.patches);
        await trx.store.put({ ctime, data } satisfies FileCacheItem, id);
      }
    }
  }

  const fileCache: FileCacheProvider = {
    async open(fileTree) {
      tree = fileTree;
      dbName = defaultDbName + (!tree.rid ? "" : "_" + tree.rid);
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
      if (!item || deleteIfOutOfSync(item, entry, "FileCache.getData")) {
        return undefined;
      }
      // Return cached data.
      return item.data as T;
    },
    async remove() {
      // CONSIDER: Handle blocked callback of deleteDB?
      await deleteDB(dbName);
    },
  };
  return fileCache;
}
