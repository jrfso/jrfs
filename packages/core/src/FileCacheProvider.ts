import type { Entry, EntryOrId } from "@/types";

export interface FileCacheItem {
  ctime: number;
  data: Readonly<unknown>;
}

export interface FileCacheProvider {
  get(entryOrId: EntryOrId): Promise<FileCacheItem>;
  getData<T = unknown>(entry: Entry): Promise<T | undefined>;
  set<T = unknown>(entry: Entry, data: T): Promise<FileCacheItem>;
  delete(entryOrId: EntryOrId): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}
