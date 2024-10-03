import type { Entry } from "@/types";
import type { FileTree } from "@/FileTree";

export interface FileCacheProvider {
  close(): Promise<void>;
  getData<T = Readonly<unknown>>(entry: Entry): Promise<T | undefined>;
  open(fileTree: FileTree): Promise<void>;
  remove(): Promise<void>;
}
