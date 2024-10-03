import type { Entry, EntryOrId } from "@/types";

export interface FileCacheItem<T = Readonly<unknown>> {
  ctime: number;
  data: T;
}

export interface FileCacheProvider {
  get(entryOrId: EntryOrId): Promise<FileCacheItem>;
  getData<T = Readonly<unknown>>(entry: Entry): Promise<T | undefined>;
  set<T = Readonly<unknown>>(entry: Entry, data: T): Promise<FileCacheItem<T>>;
  delete(entryOrId: EntryOrId): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}
