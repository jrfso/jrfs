import { join } from "node:path";
import type { RepositoryConfig } from "@jrfs/core";

/** Returns the full native path to the given relative node path. */
export function hostDataPath(config: RepositoryConfig, nodePath: string) {
  return join(config.host.dataPath, nodePath);
}
