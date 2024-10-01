/** Configuration data for FsDriver. */
export interface FsConfig {
  /** A relative or absolute path to the root data directory. */
  root: string;
  /**
   * Disable cached ids by setting `false` or set a file path `string`. The
   * default path is `"./${configFileName}.ids.json"`
   */
  ids?: string | false;
}
/** Structure of a file that maps a path to a node id. */
export type IdsFile = Record<string, string>;
