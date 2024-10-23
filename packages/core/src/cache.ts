import type { Entry } from "@/types";
import type { FileTree } from "@/FileTree";

/**
 * Common file caching interface used in official drivers.
 *
 * See usage in:
 * - [WebDriver](../../web/src/WebDriver.ts)
 * - [FileCache](../../idb/src/FileCache.ts)
 */
export interface FileCacheProvider {
  /** Closes the file cache connection or handle. */
  close(): Promise<void>;
  /** Gets data cached for a {@link FileTree}'s {@link Entry} if exists. */
  getData<T = Readonly<unknown>>(entry: Entry): Promise<T | undefined>;
  /** Opens the cache associated with the given {@link FileTree}. */
  open(fileTree: FileTree): Promise<void>;
  /** Removes the cache storage associated with the given {@link FileTree}. */
  remove(fileTree: FileTree): Promise<void>;
}
