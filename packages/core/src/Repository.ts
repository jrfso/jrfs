// Local
import {
  type CommandName,
  type CommandParams,
  type CommandResult,
  type Entry,
  type EntryOfId,
  type EntryOrPath,
  type FileDataType,
  type FileTypeProvider,
  type MutativePatches,
  type NodeInfo,
  type Plugin,
  type PluginName,
  type Plugins,
  type PluginsData,
  isDirectoryId,
} from "@/types";
import type {
  Driver,
  DriverFactory,
  DriverTypeOptions,
  DriverTypes,
} from "@/Driver";
import { FileTree } from "@/FileTree";
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
 * Each key of `FT` should be declared as a `FileType<Instance, Meta?>` and the
 * corresponding `FileTypeInfo` should be set in the {@link FileTypeProvider}
 * supplied to the `Repository`constructor.
 */
export class Repository<FT> {
  #driver: Driver;
  #files: FileTree;
  #fileTypes: FileTypeProvider<FT>;
  #plugin: PluginsData;

  constructor(
    options: RepositoryOptions<FT> &
      Partial<Pick<DriverTypeOptions, RepositoryOptions<FT>["driver"]>>,
  ) {
    const {
      driver: driverType,
      fileTypes,
      createShortId = defaultCreateShortId,
      plugins: pluginParams = {},
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
    if (pluginParams) {
      for (const name in pluginParams) {
        const params = pluginParams[name as PluginName];
        if (params === false) continue;
        const plugin = registeredPlugins[name as PluginName] as Plugin;
        if (plugin) plugin.call(this, params);
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
  // #region -- FS Actions

  // CONSIDER: Do more or less validation before passing FS actions to driver?

  #fs: FsTransactions<FT> = Object.freeze({
    add: async (
      to: string,
      params: {
        /** File data. */
        data?: unknown;
        /** Parent entry. */
        parent?: EntryOfId | null;
      } = {},
    ): Promise<Entry> => {
      const { data, parent } = params;
      const { files } = this;
      if (parent) {
        const { entry } = files.entry(parent);
        to = files.path(entry) + "/" + to;
      }
      const { id } = await this.#driver.add(
        "data" in params && typeof data !== "undefined"
          ? {
              to,
              data,
            }
          : {
              to,
            },
      );
      return files.get(id);
    },

    copy: async (
      entry: EntryOrPath,
      dest: EntryOrPath | null,
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
      const { id } = await this.#driver.copy({
        from,
        to,
      });
      return files.get(id);
    },

    get: async <T = unknown, D = T extends keyof FT ? FileDataType<FT, T> : T>(
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
      const result = await this.#driver.get({ from });
      return result as { entry: Entry; data: Readonly<D> };
    },

    move: async (
      entry: EntryOrPath,
      dest: EntryOrPath | null,
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
      const { id } = await this.#driver.move({
        from,
        to,
      });
      return files.get(id);
    },

    patch: async (
      entry: EntryOrPath,
      params: {
        /** ctime used to check if the original changed, before patching. */
        ctime: number;
        patches: MutativePatches;
        undo?: MutativePatches;
      },
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
      const { id } = await this.#driver.write({
        to,
        data,
        patch: {
          ctime,
          patches,
          undo,
        },
      });
      return files.get(id);
    },

    remove: async (entry: EntryOrPath): Promise<Entry> => {
      const { files } = this;
      const { path: from } = files.entry(entry);
      const { id } = await this.#driver.remove({
        from,
      });
      return files.get(id);
    },

    rename: async (entry: EntryOrPath, name: string): Promise<Entry> => {
      const { files } = this;
      const { path: from, entry: fromEntry } = files.entry(entry);
      let to: string;
      const pId = fromEntry.pId;
      if (!pId) {
        to = name;
      } else {
        to = files.parentPath(fromEntry) + "/" + name;
      }
      const { id } = await this.#driver.move({
        from,
        to,
      });
      return files.get(id);
    },
    write: async <
      T = unknown,
      D = T extends keyof FT ? FileDataType<FT, T> : T,
    >(
      entry: EntryOrPath,
      writerOrData:
        | ((data: D) => D | Promise<D> | void | Promise<void>)
        | Readonly<D>,
    ): Promise<Entry> => {
      const { files } = this;
      const { path: to, entry: toEntry, data } = files.fileEntry(entry);
      let origData = data as D | undefined;
      if (typeof origData === "undefined") {
        origData = (await this.fs.get<T, D>(toEntry)).data;
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
        const { id } = await this.#driver.write({
          to,
          data,
          patch: {
            ctime: toEntry.ctime,
            patches,
            undo,
          },
        });
        return files.get(id);
      }
      const { id } = await this.#driver.write({
        to,
        data: writerOrData,
      });
      return files.get(id);
    },
  });

  get fs(): FsTransactions<FT> {
    return this.#fs;
  }
  // #endregion
  // #region -- Queries

  async findTypes<K extends keyof FT & string>(
    type: K,
  ): Promise<
    Array<{
      node: NodeInfo;
      data: Readonly<FileDataType<FT, K>> | undefined;
    }>
  > {
    const results: Array<{
      node: NodeInfo;
      data: Readonly<FileDataType<FT, K>> | undefined;
    }> = [];
    const fileType = this.#fileTypes.get(type);
    if (!fileType) {
      return [];
    }
    const { files } = this;
    const fileTypeEnding = fileType.end;
    files.forEach(null, (node /* , i, siblings */) => {
      if (!node.isDir && node.name.endsWith(fileTypeEnding)) {
        const data = files.data<FileDataType<FT, K>>(node.id);
        results.push({
          node,
          data,
        });
      }
    });
    return results;
  }
  // #endregion
  // #region -- Commands
  async exec<CN extends CommandName | (string & Omit<string, CommandName>)>(
    commandName: CN,
    ...params: undefined extends CommandParams<CN>
      ? [params?: CommandParams<CN>]
      : [params: CommandParams<CN>]
  ): Promise<CommandResult<CN>> {
    return this.#driver.exec<CommandResult<CN>>(commandName, params);
  }
  // #endregion
}
// #region -- Diagnostics

// Set object name for the default `toString` implementation.
(Repository as any)[Symbol.toStringTag] = "Repository";

// #endregion
// #region -- Options

/** Options to create a {@link Repository}. */
export interface RepositoryOptions<FT> {
  /** Name of the driver type to use. */
  driver: keyof DriverTypes;
  fileTypes: FileTypeProvider<FT>;
  /** Provide a unique short id generator to create node ids. */
  createShortId?: CreateShortIdFunction;

  plugins?: { [P in PluginName]?: Plugins[P]["params"] };
}
// #endregion
// #region -- Drivers

/** Map of registered driver factory functions. */
const driverFactories: Record<string, DriverFactory> = {};

export function getDriverFactory(driverType: keyof DriverTypes & string) {
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

const registeredPlugins = {} as {
  [P in PluginName]?: Plugin<Plugins[P]["params"]>;
};

/**
 * Registers a plugin to initialize in the {@link Repository} constructor
 * when enabled in the given {@link RepositoryOptions}.
 * @param name Name of the plugin to register.
 * @param plugin Plugin initialization function.
 */
export function registerPlugin<N extends PluginName>(
  name: N,
  plugin: Plugin<Plugins[N]["params"]>,
): Plugin<Plugins[N]["params"]> {
  registeredPlugins[name] = plugin as never;
  return plugin;
}
// #endregion

export interface FsTransactions<FT> {
  add(
    to: string,
    params?: {
      /** File data. */
      data?: unknown;
      /** Parent entry. */
      parent?: EntryOfId | null;
    },
  ): Promise<Entry>;
  copy(entry: EntryOrPath, dest: EntryOrPath | null): Promise<Entry>;
  get<T = unknown, D = T extends keyof FT ? FileDataType<FT, T> : T>(
    target: EntryOrPath,
  ): Promise<{
    entry: Entry;
    data: Readonly<D>;
  }>;
  move(entry: EntryOrPath, dest: EntryOrPath | null): Promise<Entry>;
  patch(
    entry: EntryOrPath,
    params: {
      /** ctime used to check if the original changed, before patching. */
      ctime: number;
      patches: MutativePatches;
      undo?: MutativePatches;
    },
  ): Promise<Entry>;
  remove(entry: EntryOrPath): Promise<Entry>;
  rename(entry: EntryOrPath, name: string): Promise<Entry>;
  /**
   * Writes to an existing file with your `writer` function.
   * @template T File type `(keyof FT)` OR the concrete `data` type to write.
   */
  write<T = unknown, D = T extends keyof FT ? FileDataType<FT, T> : T>(
    entry: EntryOrPath,
    writer: (data: D) => D | Promise<D> | void | Promise<void>,
  ): Promise<Entry>;
  /**
   * Overwrites an existing file with the given `data`.
   * @template T File type `(keyof FT)` OR the concrete `data` type to write.
   */
  write<T = unknown, D = T extends keyof FT ? FileDataType<FT, T> : T>(
    entry: EntryOrPath,
    data: Readonly<D>,
  ): Promise<Entry>;
}
