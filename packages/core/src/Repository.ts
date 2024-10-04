// Local
import type { FileTypes } from "@/types";
import { INTERNAL } from "@/internal/types";
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

/**
 * Provides access to a JSON repo/file system from client or server.
 * @template FT File Types interface, to map file type names to TS types.
 * Each key should be registered via {@link FileTypeProvider} later.
 * Each value must be in the shape of a `FileOf<Instance, Meta?>` type.
 * @template DK Driver key used in constructor option.
 * @template DT Driver type from `DriverTypes<FT>[DK]` else `Driver<FT>`.
 */
export class Repository<
  FT extends FileTypes<FT>,
  DK extends keyof DriverTypes<FT> & string = keyof DriverTypes<FT>,
  DT extends Driver<FT> = DriverTypes<FT>[DK] extends Driver<FT>
    ? DriverTypes<FT>[DK]
    : Driver<FT>,
> {
  #driver: Driver<FT>;
  #fs: FileSystem<FT, DK>;

  constructor(
    options: RepositoryOptions<FT, DK> & Partial<Pick<DriverTypeOptions, DK>>,
  ) {
    const {
      driver: driverType,
      fileTypes,
      createShortId = defaultCreateShortId,
    } = options;
    const callbacks = {} as { setDriver(value: Driver<FT>): void };
    const fs = FileSystem[INTERNAL].create<FT, DK>({
      fileTypes,
      callbacks,
    });
    const driverFactory = getDriverFactory(driverType);
    const driverOptions = options[driverType];
    const driver = driverFactory<FT>(
      {
        createShortId,
        fileTree: fs,
        fileTypes,
      },
      driverOptions,
    );
    callbacks.setDriver(driver);
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
    return this.#driver.open();
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
  DK extends keyof DriverTypes<FT> & string = keyof DriverTypes<FT>,
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
  driverType: keyof DriverTypes<FT> & string,
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
export function registerDriver<K extends string = keyof DriverTypes<any>>(
  name: K,
  factory: DriverFactory,
) {
  driverFactories[name] = factory;
}
