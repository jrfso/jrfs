// Local
import type { FileTypes } from "@/types";
import type {
  Driver,
  DriverFactory,
  DriverTypeOptions,
  DriverTypes,
} from "@/Driver";
import { FileSystem } from "@/FileSystem";
import { FileTypeProvider } from "@/FileTypeProvider";
import {
  type CreateShortIdFunction,
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
 * corresponding `FileTypeInfo` should be set via {@link FileTypeProvider} in
 * your `Repository` sub-class' constructor.
 *
 * @template DK Driver key used in constructor option.
 *
 * @template DT Driver type from `DriverTypes[DK]` else `Driver`.
 */
export class Repository<FT extends FileTypes<FT>> {
  #driver: Driver;
  #fs: FileSystem<FT>;
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
    const fs = new FileSystem<FT>({
      driver,
      fileTypes,
    });
    this.#driver = driver;
    this.#fs = fs;
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
  protected get driver() {
    return this.#driver;
  }

  get fs() {
    return this.#fs;
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
    return this.#driver.open(this.#fs);
  }
  // #endregion
  // #region -- Diagnostics

  toString() {
    return (this as any)[Symbol.toStringTag];
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
