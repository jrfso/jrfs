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

// TODO: Add a method to register new websocket message (and send/receive fn).
// - Method can be middleware in @jrfs/(web|ws) with module augmentation.
// - Needs middleware expando interface and expando property in Repository.
// - New middleware options can be passed to constructor.

/**
 * Provides access to a JSON repo/file system from client or server.
 * @template FT File Types interface, to map file type names to TS types.
 * Each key should be registered via {@link FileTypeProvider} later.
 * Each value must be in the shape of a `FileOf<Instance, Meta?>` type.
 * @template DK Driver key used in constructor option.
 * @template DT Driver type from `DriverTypes[DK]` else `Driver`.
 */
export class Repository<
  FT extends FileTypes<FT>,
  DK extends keyof DriverTypes & string = keyof DriverTypes,
  DT extends Driver = DriverTypes[DK] extends Driver ? DriverTypes[DK] : Driver,
> {
  #driver: Driver;
  #fs: FileSystem<FT>;

  constructor(
    options: RepositoryOptions<FT, DK> & Partial<Pick<DriverTypeOptions, DK>>,
  ) {
    const {
      driver: driverType,
      fileTypes,
      createShortId = defaultCreateShortId,
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
  }
  // #region -- Props
  /** The driver interface of the configured implementation. */
  get driver(): DT {
    return this.#driver as DT;
  }

  get fs() {
    return this.#fs;
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
// Set object name for the default `toString` implementation.
(Repository as any)[Symbol.toStringTag] = "Repository";

/** Options to create a {@link Repository}. */
export interface RepositoryOptions<
  FT extends FileTypes<FT>,
  DK extends keyof DriverTypes & string = keyof DriverTypes,
> {
  /** Name of the driver type to use. */
  driver: DK;
  fileTypes: FileTypeProvider<FT>;
  /** Provide a unique short id generator to create node ids. */
  createShortId?: CreateShortIdFunction;
}

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
