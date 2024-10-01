export interface FileCacheItem {
  ctime: number;
  data: unknown;
}

export interface FileCacheProvider {
  get(id: string): Promise<FileCacheItem>;
  set(id: string, value: FileCacheItem): Promise<FileCacheItem>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}
