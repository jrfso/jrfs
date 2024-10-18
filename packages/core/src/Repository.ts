// Local
import {
  type Entry,
  type EntryOfId,
  type EntryOrPath,
  type FileTypes,
  type MutativePatches,
  type NodeInfo,
  isDirectoryId,
} from "@/types";
import type {
  Driver,
  DriverFactory,
  DriverTypeOptions,
  DriverTypes,
  TransactionOutParams,
} from "@/Driver";
import { FileTree } from "@/FileTree";
import { FileTypeProvider } from "@/FileTypeProvider";
import {
  type CreateShortIdFunction,
  applyPatch,
  createPatch,
  createShortId as defaultCreateShortId,
} from "@/helpers";

// TODO: A dynamic COMMAND system, so websocket messages can simply relay those.

// TODO: Add a method to register a view.
// - A file type to match or other filter must be provided.
// - A function to run after (a batch?) of tree/data changes is needed.
//   - The function will aggregate tree/data from matching files.
// - Options for when to run the function can be specified, e.g.
//   - when the matching file LISTING changes.
//   - when ANY matching files' data becomes available (or changes).
//   - when ALL matching files' data becomes available (or changes thereafter).
// - An option to actively LOAD matching files' data can be specified.

/**
 * Provides access to a JSON repo/file system from client or server.
 *
 * @template FT File Types interface mapping file type names to TS types.
 * Each key of `FT` should be declared as a `FileOf<Instance, Meta?>` and the
 * corresponding `FileTypeInfo` should be set in the {@link FileTypeProvider}
 * supplied to the `Repository`constructor.
 *
 * @template DK Driver key used in constructor option.
 *
 * @template DT Driver type from `DriverTypes[DK]` else `Driver`.
 */
export class Repository<FT extends FileTypes<FT>> {
  #driver: Driver;
  #files: FileTree;
  #fileTypes: FileTypeProvider<FT>;
  #plugin: Partial<{
    /** Internal plugin data. One prop per registered plugin. */
    [Prop in RepositoryPluginName]: RepositoryPlugins[Prop]["data"];
  }>;

  constructor(
    options: RepositoryOptions<FT> &
      Partial<Pick<DriverTypeOptions, RepositoryOptions<FT>["driver"]>>,
  ) {
    const {
      driver: driverType,
      fileTypes,
      createShortId = defaultCreateShortId,
      plugins,
    } = options;
    const driverFactory = getDriverFactory(driverType);
    const driverOptions = options[driverType];
    const driver = driverFactory(
      {
        createShortId,
        fileTypes,
      },
      driverOptions,
    );
    const files = new FileTree();
    this.#driver = driver;
    this.#files = files;
    this.#fileTypes = fileTypes;
    // Set object name for the default `toString` implementation.
    (this as any)[Symbol.toStringTag] = `Repository(${driver})`;
    // Initialize plugins.
    this.#plugin = {};
    if (plugins) {
      for (const name in plugins) {
        const params = (plugins as Record<string, unknown>)[name];
        if (params === false) continue;
        const plugin = getPlugin(name);
        plugin.call(this, params);
      }
    }
  }
  // #region -- Core
  /** The driver interface of the configured implementation. */
  get driver() {
    return this.#driver;
  }

  get files() {
    return this.#files;
  }

  get fileTypes() {
    return this.#fileTypes;
  }
  /** Protected plugin data. */
  protected get plugin() {
    return this.#plugin;
  }
  // #endregion
  // #region -- Lifecycle

  /** Closes the repo if opened. */
  async close() {
    return this.#driver.close();
  }
  /**
   * Loads all directories and files within the repo path.
   */
  async open() {
    return this.#driver.open(this.#files);
  }
  // #endregion
  // #region -- Diagnostics

  toString() {
    return (this as any)[Symbol.toStringTag];
  }
  // #endregion
  // #region -- FS Commands

  // TODO: Do more validation before passing FS actions to driver.
  #fs: FsCommands<FT> = Object.freeze({
    add: async (
      to: string,
      params: {
        /** File data. */
        data?: unknown;
        /** Parent entry. */
        parent?: EntryOfId | null;
      } = {},
      out?: TransactionOutParams,
    ): Promise<Entry> => {
      const { data, parent } = params;
      if (parent) {
        const { files } = this;
        const { entry } = files.entry(parent);
        to = files.path(entry) + "/" + to;
      }
      return this.#driver.add(
        "data" in params && typeof data !== "undefined"
          ? {
              to,
              data,
            }
          : {
              to,
            },
        out,
      );
    },

    copy: async (
      entry: EntryOrPath,
      dest: EntryOrPath | null,
      out?: TransactionOutParams,
    ): Promise<Entry> => {
      const { files } = this;
      const { path: from, entry: fromEntry } = files.entry(entry);
      const { path: into, entry: intoEntry } = files.dest(dest);
      let to: string;
      if (into) {
        if (intoEntry) {
          // Found Node at destination.
          if (!isDirectoryId(intoEntry.id)) {
            throw new Error(`Destination already exists "${into}"`);
          }
          // Found DirectoryNode at destination. Move entry INTO it.
          to = (into.endsWith("/") ? into : into + "/") + fromEntry.name;
          // e.g. to = this.getNodePath(intoNode) + "/" + fromEntry.name;
        } else {
          to = into;
        }
      } else {
        // When dest is null, the `to` path is the root.
        // NOTE: All paths are relative to Repository root, so no leading "/".
        to = fromEntry.name;
      }
      return this.#driver.copy(
        {
          from,
          fromEntry,
          to,
        },
        out,
      );
    },

    get: async <T = unknown, D = T extends keyof FT ? FT[T]["data"] : T>(
      target: EntryOrPath,
    ): Promise<{
      entry: Entry;
      data: Readonly<D>;
    }> => {
      const { files } = this;
      const { path: from, entry, data } = files.fileEntry(target);
      // In memory?
      if (typeof data !== "undefined") {
        return {
          entry,
          data: data as Readonly<D>,
        };
      }
      // Get from driver.
      const result = await this.#driver.get({ from, fromEntry: entry });
      return result as { entry: Entry; data: Readonly<D> };
    },

    move: async (
      entry: EntryOrPath,
      dest: EntryOrPath | null,
      out?: TransactionOutParams,
    ): Promise<Entry> => {
      const { files } = this;
      const { path: from, entry: fromEntry } = files.entry(entry);
      const { path: into, entry: intoEntry } = files.dest(dest);
      let to: string;
      if (into) {
        if (intoEntry) {
          // Found Node at destination.
          if (!isDirectoryId(intoEntry.id)) {
            throw new Error(`Destination already exists "${into}"`);
          }
          // Found DirectoryNode at destination. Move entry INTO it.
          to = (into.endsWith("/") ? into : into + "/") + fromEntry.name;
          // e.g. to = this.getNodePath(intoNode) + "/" + fromEntry.name;
        } else {
          to = into;
        }
      } else {
        // When dest is null, the `to` path is the root.
        // NOTE: All paths are relative to Repository root, so no leading "/".
        to = fromEntry.name;
      }
      return this.#driver.move(
        {
          from,
          fromEntry,
          to,
        },
        out,
      );
    },

    patch: (
      entry: EntryOrPath,
      params: {
        /** ctime used to check if the original changed, before patching. */
        ctime: number;
        patches: MutativePatches;
        undo?: MutativePatches;
      },
      out?: TransactionOutParams,
    ): Promise<Entry> => {
      const { files } = this;
      const {
        path: to,
        entry: toEntry,
        data: origData,
      } = files.fileEntry(entry);
      if (typeof origData === "undefined") {
        throw new Error(`Entry has no data "${to}".`);
      }
      const { ctime, patches, undo } = params;
      if (ctime && ctime !== toEntry.ctime) {
        // TODO: Don't just throw an error here. Instead, figure out if the
        // patches are compatible and apply them OR throw a typed error so the
        // caller can handle it.
        throw new Error(`Entry cannot be patched "${to}".`);
      }
      // CONSIDER: origData could be null...
      const data = applyPatch(origData!, patches);
      return this.#driver.write(
        {
          to,
          toEntry,
          data,
          patch: {
            ctime,
            patches,
            undo,
          },
        },
        out,
      );
    },

    remove: async (
      entry: EntryOrPath,
      out?: TransactionOutParams,
    ): Promise<Entry> => {
      const { files } = this;
      const { path: from, entry: fromEntry } = files.entry(entry);
      return this.#driver.remove(
        {
          from,
          fromEntry,
        },
        out,
      );
    },

    rename: async (
      entry: EntryOrPath,
      name: string,
      out?: TransactionOutParams,
    ): Promise<Entry> => {
      const { files } = this;
      const { path: from, entry: fromEntry } = files.entry(entry);
      let to: string;
      const pId = fromEntry.pId;
      if (!pId) {
        to = name;
      } else {
        to = files.parentPath(fromEntry) + "/" + name;
      }
      return this.#driver.move(
        {
          from,
          fromEntry,
          to,
        },
        out,
      );
    },
    write: async <T = unknown, D = T extends keyof FT ? FT[T]["data"] : T>(
      entry: EntryOrPath,
      writerOrData:
        | ((data: D) => D | Promise<D> | void | Promise<void>)
        | Readonly<D>,
      out?: TransactionOutParams,
    ): Promise<Entry> => {
      const { files } = this;
      const { path: to, entry: toEntry, data } = files.fileEntry(entry);
      let origData = data as D | undefined;
      if (typeof origData === "undefined") {
        origData = (await this.fs.get(toEntry)).data as D;
      }
      if (typeof writerOrData === "function") {
        // We don't need mutative's Draft<D> here to remove readonly from D's
        // properties since D represents a mutable type already.
        const writer = writerOrData as (
          // data: Draft<T> is default, but for local cast skip the type import.
          data: unknown,
        ) => D | Promise<D> | void | Promise<void>;
        const [data, patches, undo] = await createPatch(origData, writer);
        if (patches.length < 1) {
          // No change.
          return toEntry;
        }
        return this.#driver.write(
          {
            to,
            toEntry,
            data,
            patch: {
              ctime: toEntry.ctime,
              patches,
              undo,
            },
          },
          out,
        );
      }
      return this.#driver.write(
        {
          to,
          toEntry,
          data: writerOrData,
        },
        out,
      );
    },
  });

  get fs(): FsCommands<FT> {
    return this.#fs;
  }
  // #endregion
  // #region -- Queries

  async findTypes<K extends keyof FT & string>(
    type: K,
  ): Promise<
    Array<{
      node: NodeInfo;
      data: Readonly<FT[K]["data"]> | undefined;
    }>
  > {
    const results: Array<{
      node: NodeInfo;
      data: Readonly<FT[K]["data"]> | undefined;
    }> = [];
    const fileType = this.#fileTypes.get(type);
    if (!fileType) {
      return [];
    }
    const { files } = this;
    const fileTypeEnding = fileType.end;
    files.forEach(null, (node /* , i, siblings */) => {
      if (!node.isDir && node.name.endsWith(fileTypeEnding)) {
        const data = files.data(node.id);
        results.push({
          node,
          data,
        });
      }
    });
    return results;
  }
  // #endregion
}
// #region -- Diagnostics

// Set object name for the default `toString` implementation.
(Repository as any)[Symbol.toStringTag] = "Repository";

// #endregion
// #region -- Options

/** Options to create a {@link Repository}. */
export interface RepositoryOptions<FT extends FileTypes<FT>> {
  /** Name of the driver type to use. */
  driver: keyof DriverTypes;
  fileTypes: FileTypeProvider<FT>;
  /** Provide a unique short id generator to create node ids. */
  createShortId?: CreateShortIdFunction;

  plugins?: Record<RepositoryPluginName, RepositoryPluginOf["params"]>;
}
// #endregion
// #region -- Drivers

/** Map of registered driver factory functions. */
const driverFactories: Record<string, DriverFactory> = {};

export function getDriverFactory<FT extends FileTypes<FT>>(
  driverType: keyof DriverTypes & string,
) {
  const driverFactory = driverFactories[driverType];
  if (!driverFactory) {
    throw new Error(`Driver factory not found - "${driverType}"`);
  }
  return driverFactory;
}

/**
 * Register a new driver type.
 * @param name Driver to register. Also see the TS declaration example below.
 * @param factory Function to create the driver instance.
 */
export function registerDriver<K extends string = keyof DriverTypes>(
  name: K,
  factory: DriverFactory,
) {
  driverFactories[name] = factory;
}
// #endregion
// #region -- Plugins

const repositoryPlugins: Record<string, RepositoryPlugin<any>> = {};

function getPlugin(name: string) {
  const plugin = repositoryPlugins[name];
  if (!plugin) {
    throw new Error(`Plugin not found "${name}".`);
  }
  return plugin;
}
/**
 * Registers a plugin to initialize in the {@link Repository} constructor
 * when enabled in the given {@link RepositoryOptions}.
 * @param name Name of the plugin to register.
 * @param plugin Plugin initialization function.
 */
export function registerPlugin<N extends RepositoryPluginName>(
  name: N,
  plugin: RepositoryPlugin<RepositoryPlugins[N]["params"]>,
) {
  repositoryPlugins[name] = plugin;
}

/** {@link Repository} plugin implementation function. */
export interface RepositoryPlugin<P = unknown> {
  (this: Repository<any>, params: P | undefined): void;
}
/** Declares the integral types of a {@link RepositoryPlugin}. */
export interface RepositoryPluginOf<P = undefined, D = unknown> {
  /** Params passed when calling plugin. A `false` value disables the plugin. */
  params?: P | boolean;
  /** Type of the internal data stored in {@link Repository} by the plugin. */
  data?: D;
}
/** Interface to declare global {@link RepositoryPlugin} info onto. */
export interface RepositoryPlugins {
  // e.g. myPlugin: RepositoryPluginOf<{foo?:"bar"|"baz"}>;
}
/** Plugin name of a plugin registered in {@link RepositoryPlugins} */
export type RepositoryPluginName = keyof RepositoryPlugins &
  NonNullable<string>;

// #endregion

export interface FsCommands<FT extends FileTypes<FT>> {
  add(
    to: string,
    params?: {
      /** File data. */
      data?: unknown;
      /** Parent entry. */
      parent?: EntryOfId | null;
    },
    out?: TransactionOutParams,
  ): Promise<Entry>;
  copy(
    entry: EntryOrPath,
    dest: EntryOrPath | null,
    out?: TransactionOutParams,
  ): Promise<Entry>;
  get<T = unknown, D = T extends keyof FT ? FT[T]["data"] : T>(
    target: EntryOrPath,
  ): Promise<{
    entry: Entry;
    data: Readonly<D>;
  }>;
  move(
    entry: EntryOrPath,
    dest: EntryOrPath | null,
    out?: TransactionOutParams,
  ): Promise<Entry>;
  patch(
    entry: EntryOrPath,
    params: {
      /** ctime used to check if the original changed, before patching. */
      ctime: number;
      patches: MutativePatches;
      undo?: MutativePatches;
    },
    out?: TransactionOutParams,
  ): Promise<Entry>;
  remove(entry: EntryOrPath, out?: TransactionOutParams): Promise<Entry>;
  rename(
    entry: EntryOrPath,
    name: string,
    out?: TransactionOutParams,
  ): Promise<Entry>;
  /**
   * Writes to an existing file with your `writer` function.
   * @template T `FileType` name OR the `data` type to write.
   */
  write<T = unknown, D = T extends keyof FT ? FT[T]["data"] : T>(
    entry: EntryOrPath,
    writer: (data: D) => D | Promise<D> | void | Promise<void>,
    out?: TransactionOutParams,
  ): Promise<Entry>;
  /**
   * Overwrites an existing file with the given `data`.
   * @template T `FileType` name OR the `data` type to write.
   */
  write<T = unknown, D = T extends keyof FT ? FT[T]["data"] : T>(
    entry: EntryOrPath,
    data: Readonly<D>,
    out?: TransactionOutParams,
  ): Promise<Entry>;
}
