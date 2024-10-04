/** Configuration data for FsDriver. */
export interface FsConfig {
  /**
   * Path to store an index of node ids and other state between restarts. The
   * default path is `"./${configFileName}.idx.json"`. Set `false` to disable.
   */
  index?: string | false;
  /** A relative or absolute path to the root data directory. */
  root: string;
}
/** Structure containing an index of ids and state. */
export interface FsIndexData {
  /** FS node ids keyed by path. */
  node: Record<string, string>;
  /** Resource id, a unique id for the file tree resource in an application. */
  rid: string;
}

/** Default file extension to create */
export const FsIndexDefaultFileExtension = ".idx.json";
