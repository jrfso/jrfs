import type { Repository } from "@/Repository";
import type { WritableFileTree } from "@/WritableFileTree";

/** @import { FileTree } from "@/FileTree" */

// #region -- FileTree

export type FileTreeOperation = "add" | "copy" | "move" | "remove" | "write";
/** Event data for {@link FileTree.onChange}. */
export interface FileTreeChange {
  /** The transaction type. */
  op: FileTreeOperation;
  /** The entry id which was the target of the change. */
  id: string;
  /** Transaction number. */
  tx: number;

  /** All entries added, in order of addition. */
  added?: Entry[];
  /** All entries changed, in order of change. */
  changed?: Entry[];
  /** All entry ids removed, in order of removal (child to parent). */
  removed?: string[];

  patch?: {
    /** Original file ctime, before patch. */
    ctime: number;
    patches: MutativePatches;
    undo?: MutativePatches;
  };
}
/** Event data for {@link FileTree.onDataChange} */
export interface FileDataChange {
  entry: Entry;
  data: unknown;
}

export type FileDataChangeHandler = (change: FileDataChange) => void;

export type FileTreeChangeHandler = (change: FileTreeChange) => void;

export interface MutativePatch {
  op: "add" | "remove" | "replace";
  path: (string | number)[];
  value?: unknown;
}

export type MutativePatches = MutativePatch[];

export function logFileTreeChange({
  op,
  id,
  tx,
  added: a,
  changed: c,
  removed: r,
}: FileTreeChange) {
  return (
    `#${tx} ${op} ${id} ( ` +
    `a:${a?.length ?? 0} c:${c?.length ?? 0} r:${r?.length ?? 0}` +
    ` )`
  );
}

// #endregion
// #region -- Nodes

export interface NodeBuilder {
  /** The basic node details. */
  entry: NodeEntry;
  /** Child node ids. */
  children?: string[];
  /** The file data, if any. */
  data?: unknown;
}

/** Basic file-system node details needed to track a file or directory. */
export interface NodeEntry {
  /** Change time Unix timestamp, e.g. milliseconds since UTC 1970-01-01. */
  ctime: number;
  /** Directory or File id. Begins with `d` or `f` for Directory or File. */
  id: string;
  /** Name of the Directory or File. */
  name: string;
  /** Parent (Directory) id. */
  pId?: string;

  // CONSIDER: Add fields for `size` and (MIME) `type`.
}
/** A read-only {@link NodeEntry}. */
export type Entry = Readonly<NodeEntry>;

export type EntryOfId = Pick<Entry, "id">;

export type EntryOrPath = EntryOfId | string;
/**
 * Parameter of an `Entry{id}` or just an `string` id.
 *
 * NOTE: Uses `EntryOfId` instead of `Entry`, to enforce non-usage of fields
 * other than `id` when an `Entry` is given as a parameter to a public method.
 */
export type EntryOrId = EntryOfId | string;

/** Extended file-system node details. */
export interface NodeInfo extends NodeEntry {
  /** The number of children. */
  children?: number;
  /** True if this node represents a Directory. */
  isDir: boolean;
  /** Relative path to the Directory or File. */
  path: string;
}
/** Callback to map a node (N) to a different type (T). */
export type NodeMapper<N, T> = (node: N) => T;
/** Options used when adding a file-system node. */
export interface NodeOptions {
  /** id if known (e.g. when loading from fs) */
  id?: string;
  /** File data to pre-load. */
  data?: unknown;
  /** `true` if directory. */
  isDir?: boolean;
  /** Parent directory node id. */
  pId?: string;
  /** Stats info (e.g. from `fs.stat` or compatible source). */
  stats: {
    /** Change time Unix timestamp, e.g. milliseconds since UTC 1970-01-01. */
    ctime: Date | number;
  };
}
/** Callback to visit each node. */
export type NodeVisitor<T> = (
  /** Current node. */
  node: T,
  /** Details of `node` placement within the tree. */
  tree: {
    /** Depth within the tree. `0` is a root node.  */
    depth: number;
    /** Overall iteration index. */
    index: number;
    /** Index of `node` within `siblings` (`parent` children). */
    order: number;
    /** Parent of `node`, if any. */
    parent?: T;
    /** Array of siblings including current `node`. */
    siblings: T[];
  },
) => NodeVisitResult;
/**
 * Result to control flow from visiting a node. e.g. `true`: return, `false`:
 * skip children.
 */
export type NodeVisitResult = boolean | undefined | void;

export function getCtimeOption(stats: NodeOptions["stats"]) {
  const ctime = stats.ctime;
  return typeof ctime === "number" ? ctime : ctime.getTime();
}

export function idOrEntryId(value: EntryOrId) {
  return typeof value === "string" ? value : value.id;
}

export function isDirectoryId(id: string): boolean {
  return id.startsWith("d");
}

export function isFileId(id: string): boolean {
  return id.startsWith("f");
}
// #endregion
// #region -- File Types

/** Gets type of `data` for file type if `T` is a `keyof FT` or `Else`. */
export type FileDataType<
  FT,
  T extends keyof FT | Omit<string, keyof FT>,
  Else = any,
> = T extends keyof FT
  ? "data" extends keyof FT[T]
    ? FT[T]["data"]
    : Else
  : Else;

/** Gets type of `meta` for file type if `T` is a `keyof FT` or `Else`. */
export type FileMetaType<
  FT,
  T extends keyof FT | Omit<string, keyof FT>,
  Else = any,
> = T extends keyof FT
  ? "meta" extends keyof FT[T]
    ? FT[T]["meta"]
    : Else
  : Else;

/**
 * Declares the `data` and `meta`data types of a given file-type.
 * @template D `data` Describes the JSON root found in a file of this type.
 * @template M `meta` Describes file-type wide metadata.
 */
export interface FileType<D = unknown, M = unknown> {
  /** The JSON root found in a file of this type. */
  data: D;
  /** File-type wide metadata. */
  meta: M;
}
/**
 * A {@link FileTypeInfo} with `name` as registered with a `FileTypeProvider`.
 * @template FT File Types interface, to map file type names to TS types.
 * @template T Key of `FT`, a file type name.
 */
export interface FileTypeEntry<FT, T extends keyof FT = keyof FT>
  extends FileTypeInfo<FileMetaType<FT, T>> {
  name: T & string;
}
/**
 * Type information for a file type, except for it's `name`.
 * @template M Type of file `meta` data.
 */
export interface FileTypeInfo<M = unknown> {
  /** A description of the file type. */
  desc?: string;
  /**
   * E.N.D. file name string (Extension Name Duo). This string can contain just
   * a file extension OR a file name ending + extension. This string is also
   * appended to the end of any new file created using this type information.
   * @example
   * end: ".jpg"     // match + new file named: file.jpg.
   * end: ".db.json" // match + new file named: file.db.json
   */
  end: string;

  // /** File name patterns which match this file type. */
  // match?: string[/* ".foo", ".bar.baz" */];

  /** Custom meta-data for this file type. */
  meta?: M;
  /** The JSON schema used to validate this file type. */
  schema?: any;
}

export interface FileTypeProvider<FT> {
  /**
   * Returns the first {@link FileTypeEntry<FT>} where {@link FileTypeInfo.end}
   * matches the end of the given `nameOrPath`.
   * @param nameOrPath File name or path.
   */
  fromPath(nameOrPath: string): FileTypeEntry<FT> | undefined;
  /** Gets file type info by name. */
  get<T extends keyof FT & string>(
    typeName: T,
  ): FileTypeEntry<FT, T> | undefined;
  /** Sets file type info by name. */
  set(typesByName: {
    [T in keyof FT]?: FileTypeInfo<FileMetaType<FT, T>>;
  }): this;
  /** Sets a single file type info by name. */
  setOne<T extends keyof FT & string>(
    typeName: T,
    info: FileTypeInfo<FileMetaType<FT, T>>,
  ): this;
  /**
   * Validates if `value` matches type name `T` schema registered in the
   * repository-typemap `FT`.
   * @template T Type name.
   */
  validate<T extends keyof FT & string>(
    typeName: T,
    value: unknown,
  ): value is FileDataType<FT, T>;
}
// #endregion
// #region -- Plugins

/** {@link Repository} plugin implementation function. */
export interface Plugin<P = unknown> {
  (props: PluginProps, params: P | undefined): void;
}
/** Plugin name of a plugin registered in {@link Plugins} */
export type PluginName = keyof Plugins & string;
/**  */
export interface PluginProps {
  readonly commands: CommandRegistry;
  readonly config: RepositoryConfig;
  readonly repo: Repository<any>;
}
/** Declares global {@link Plugin}s. `{"myPlugin":{params?,data}}` */
export interface Plugins {
  // e.g. myPlugin: PluginType<{foo?:"bar"|"baz"}>;
  // "test": PluginType<true, boolean>;
}
/** Data types in {@link Plugins}. `{[P in Plugins]: Plugins[P]["data"]}` */
export type PluginsData = {
  /** Internal plugin data. One prop per registered plugin. */
  [Prop in PluginName]?: Plugins[Prop]["data"];
};
/** Declares types that define {@link Plugins}. `{params?,data?}` */
export interface PluginType<P = undefined, D = unknown> {
  /** Params passed when calling plugin. A `false` value disables the plugin. */
  params?: P | boolean;
  /** Type of the internal data stored in {@link Repository} by the plugin. */
  data?: D;
}
// #endregion
// #region -- Commands

/** Global command type declarations. `{"my.cmd":{params[?],result}}` */
export interface Commands extends FsCommands {
  // "test.echo": {
  //   params: { message: string };
  //   result: { message: string };
  // };
}

/** Global `keyof` {@link Commands} `& string` type. */
export type CommandName = keyof Commands & string;

/** Gets type of command `params` if `CN` is a command name or `Else`. */
export type CommandParams<
  CN extends CommandName | Omit<string, keyof Commands>,
  Else = any,
> = CN extends CommandName
  ? "params" extends keyof Commands[CN]
    ? Commands[CN]["params"]
    : Else
  : Else;

export interface CommandRegistry {
  get<CN extends CommandName | Omit<string, CommandName>>(
    commandName: CN,
  ): RunCommand<CN> | undefined;

  /** Adds a single command runner. */
  register<CN extends CommandName | Omit<string, keyof Commands>>(
    commandName: CN,
    runner: RunCommand<CN>,
  ): this;
  /** Adds command runners from `[name, value]` entries. */
  register<CN extends CommandName | Omit<string, keyof Commands>>(
    commands: Array<[CN, RunCommand<any>]>,
    runner?: never,
  ): this;
  // /** Adds command runners by name. */
  // register<>(commandsByName: { [CN in CommandName]?: RunCommand<CN> }): this;
}

/** Gets type of command `result` if `CN` is a command name or `Else`. */
export type CommandResult<
  CN extends CommandName | Omit<string, keyof Commands>,
  Else = any,
> = CN extends CommandName
  ? "result" extends keyof Commands[CN]
    ? Commands[CN]["result"]
    : Else
  : Else;

/** Declares the types that define custom {@link Commands}. */
export type CommandType<
  Params = unknown,
  Result = unknown,
> = undefined extends Params
  ? { params?: Params; result: Result }
  : { params: Params; result: Result };

export type RunCommand<CN extends CommandName | Omit<string, keyof Commands>> =
  (
    props: RunCommandProps,
    params: CommandParams<CN>,
  ) => Promise<CommandResult<CN>>;

export interface RunCommandProps {
  // CONSIDER: Add repo, driver, [plugin?]...
  config: RepositoryConfig;
  files: WritableFileTree;
  fileTypes: FileTypeProvider<any>;
}
/** Helper to define a command runner. */
export function command<CN extends CommandName | Omit<string, keyof Commands>>(
  commandName: CN,
  runner: RunCommand<CN>,
): [CN, RunCommand<any>] {
  return [commandName, runner];
}
// #endregion
// #region -- Commands: FS

export interface FsCommands {
  "fs.add": CommandType<{ to: string; data?: unknown }, FsEntryIdResult>;
  "fs.copy": CommandType<{ from: string; to: string }, FsEntryIdResult>;
  "fs.get": CommandType<{ from: string }, FsDataResult>;
  "fs.move": CommandType<{ from: string; to: string }, FsEntryIdResult>;
  "fs.remove": CommandType<{ from: string }, FsEntryIdResult>;
  "fs.write": CommandType<
    {
      to: string;
      ctime: number;
      data?: unknown;
      patch?: MutativePatches;
    },
    FsEntryIdResult
  >;
}
/** Global `keyof` {@link FsCommands} `& CommandName` type. */
export type FsCommandName = keyof FsCommands & CommandName;

/** `{ id, data }` */
export interface FsDataResult extends FsEntryIdResult {
  /** Complete data. */
  data?: unknown;
}
/** `{ id }` */
export interface FsEntryIdResult {
  /** Id of the entry affected by the command. */
  id: string;
}
// #endregion
// #region -- Repository: Configuration

export interface RepositoryConfig {
  host: RepositoryHostConfig;
}

export interface RepositoryHostConfig {
  dataPath: string;
  // gitPath: string;
}

// #endregion
