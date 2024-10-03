import { apply, create as createDataProxy } from "mutative";
// Local
import {
  type Entry,
  type EntryOfId,
  type EntryOrPath,
  type FileTypes,
  type MutativePatches,
  type NodeInfo,
} from "@/types";
import { isDirectoryNode } from "@/internal/types";
import type {
  Driver,
  DriverFactory,
  DriverTypeOptions,
  DriverTypes,
  TransactionOutParams,
} from "@/Driver";
import { FileTree } from "@/FileTree";
import { FileTypeProvider } from "@/FileTypeProvider";
import { type CreateShortIdFunction, createShortId } from "@/helpers";

// TODO: Binary transactions...
// - Repository[upload & writeBinary] -> Driver[upload & writeBinary]
//   - needs FileReader.slice -> base64 -> WebSocket upload request(s)...
//   - also needs Repository[download & getBinary] method.
// CONSIDER: Misc transactions...
// - appendFile (could be good for letting client write a text log?)

// TODO: Add a `realpath` type method in the Repository class.
// - On the client, it should return the full real FS path from the server.
// - On the server, it should return the full real FS path.

/**
 * Provides access to a JSON repo/file system from client or server.
 * @template FT File Types interface, to map file type names to TS types.
 * Each key should be registered via {@link fileTypes} later.
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
> extends FileTree {
  #driver: Driver<FT>;
  #fileTypes: FileTypeProvider<FT>;

  constructor(
    options: RepositoryOptions<FT, DK> & Partial<Pick<DriverTypeOptions, DK>>,
  ) {
    super();
    this.#fileTypes = options.fileTypes;
    const driverType = options.driver;
    const driverFactory = driverFactories[driverType];
    if (!driverFactory) {
      throw new Error(`Driver factory not found - "${driverType}"`);
    }
    const driverOptions = options[driverType];
    const driver = driverFactory<FT>(
      {
        createShortId: options.createShortId ?? createShortId,
        fileTree: this,
        fileTypes: this.#fileTypes,
      },
      driverOptions,
    );
    this.#driver = driver;
    this.rootPath = driver.rootPath;
    // Set object name for the default `toString` implementation.
    (this as any)[Symbol.toStringTag] = `Repository(${driver})`;
  }
  // #region -- Props
  /** The driver interface of the configured implementation. */
  get driver(): DT {
    return this.#driver as DT;
  }

  get fileTypes() {
    return this.#fileTypes;
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

  override toString() {
    return (this as any)[Symbol.toStringTag];
  }
  // #endregion
  // #region -- FS Actions

  // TODO: Do more validation before passing FS actions to driver.

  async add(
    to: string,
    params: {
      /** File data. */
      data?: unknown;
      /** Parent entry. */
      parent?: EntryOfId | null;
    } = {},
    out?: TransactionOutParams,
  ): Promise<Entry> {
    const { data, parent } = params;
    if (parent) {
      const { node } = this.entry(parent);
      to = this.getNodePath(node) + "/" + to;
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
  }

  async copy(
    entry: EntryOrPath,
    dest: EntryOrPath | null,
    out?: TransactionOutParams,
  ): Promise<Entry> {
    const { path: from, node: fromNode } = this.entry(entry);
    const { path: into, node: intoNode } = this.dest(dest);
    let to: string;
    if (into) {
      if (intoNode) {
        // Found Node at destination.
        if (!isDirectoryNode(intoNode)) {
          throw new Error(`Destination already exists "${into}"`);
        }
        // Found DirectoryNode at destination. Move entry INTO it.
        to = (into.endsWith("/") ? into : into + "/") + fromNode.entry.name;
        // e.g. to = this.getNodePath(intoNode) + "/" + fromNode.entry.name;
      } else {
        to = into;
      }
    } else {
      // When dest is null, the `to` path is the root.
      // NOTE: All paths are relative to Repository root, so no leading "/".
      to = fromNode.entry.name;
    }
    return this.#driver.copy(
      {
        from,
        fromEntry: fromNode.entry,
        to,
      },
      out,
    );
  }

  async get(target: EntryOrPath) {
    const { path: from, node: fromNode } = this.fileEntry(target);
    const { entry } = fromNode;
    // In memory?
    if (typeof fromNode.data !== "undefined") {
      return {
        entry,
        data: fromNode.data,
      };
    }
    // Get from driver.
    const result = await this.driver.get({ from, fromEntry: entry });
    return result;
  }

  async move(
    entry: EntryOrPath,
    dest: EntryOrPath | null,
    out?: TransactionOutParams,
  ): Promise<Entry> {
    const { path: from, node: fromNode } = this.entry(entry);
    const { path: into, node: intoNode } = this.dest(dest);
    let to: string;
    if (into) {
      if (intoNode) {
        // Found Node at destination.
        if (!isDirectoryNode(intoNode)) {
          throw new Error(`Destination already exists "${into}"`);
        }
        // Found DirectoryNode at destination. Move entry INTO it.
        to = (into.endsWith("/") ? into : into + "/") + fromNode.entry.name;
        // e.g. to = this.getNodePath(intoNode) + "/" + fromNode.entry.name;
      } else {
        to = into;
      }
    } else {
      // When dest is null, the `to` path is the root.
      // NOTE: All paths are relative to Repository root, so no leading "/".
      to = fromNode.entry.name;
    }
    return this.#driver.move(
      {
        from,
        fromEntry: fromNode.entry,
        to,
      },
      out,
    );
  }

  patch(
    entry: EntryOrPath,
    params: {
      /** ctime used to check if the original changed, before patching. */
      ctime: number;
      patches: MutativePatches;
      undo?: MutativePatches;
    },
    out?: TransactionOutParams,
  ): Promise<Entry> {
    const { path: to, node: toNode } = this.fileEntry(entry);
    const origData = toNode.data;
    if (!origData) {
      throw new Error(`Entry has no data "${to}".`);
    }
    const { ctime, patches, undo } = params;
    if (ctime && ctime !== toNode.entry.ctime) {
      // TODO: Don't just throw an error here. Instead, figure out if the
      // patches are compatible and apply them OR throw a typed error so the
      // caller can handle it.
      throw new Error(`Entry cannot be patched "${to}".`);
    }
    const data = apply(origData, patches);
    return this.#driver.write(
      {
        to,
        toEntry: toNode.entry,
        data,
        patch: {
          ctime,
          patches,
          undo,
        },
      },
      out,
    );
  }

  async remove(entry: EntryOrPath, out?: TransactionOutParams): Promise<Entry> {
    const { path: from, node: fromNode } = this.entry(entry);
    return this.#driver.remove(
      {
        from,
        fromEntry: fromNode.entry,
      },
      out,
    );
  }

  async rename(
    entry: EntryOrPath,
    name: string,
    out?: TransactionOutParams,
  ): Promise<Entry> {
    const { path: from, node: fromNode } = this.entry(entry);
    let to: string;
    const pId = fromNode.entry.pId;
    if (!pId) {
      to = name;
    } else {
      const parent = this.getNode(pId)!;
      to = this.getNodePath(parent) + "/" + name;
    }
    return this.#driver.move(
      {
        from,
        fromEntry: fromNode.entry,
        to,
      },
      out,
    );
  }

  /**
   * Writes to an existing file with your `writer` function.
   * @template T `FileType` name OR the `data` type to write.
   */
  async write<T = unknown, D = T extends keyof FT ? FT[T]["data"] : T>(
    entry: EntryOrPath,
    writer: (data: D) => void | Promise<void>,
    out?: TransactionOutParams,
  ): Promise<Entry>;
  /**
   * Overwrites an existing file with the given `data`.
   * @template T `FileType` name OR the `data` type to write.
   */
  async write<T = unknown, D = T extends keyof FT ? FT[T]["data"] : T>(
    entry: EntryOrPath,
    data: Readonly<D>,
    out?: TransactionOutParams,
  ): Promise<Entry>;
  async write<T = unknown, D = T extends keyof FT ? FT[T]["data"] : T>(
    entry: EntryOrPath,
    writerOrData: ((data: D) => void | Promise<void>) | Readonly<D>,
    out?: TransactionOutParams,
  ): Promise<Entry> {
    const { path: to, node: toNode } = this.fileEntry(entry);
    const toEntry = toNode.entry;
    let origData = toNode.data as D | undefined;
    if (typeof origData === "undefined") {
      origData = (await this.get(toEntry)).data as D;
    }
    if (typeof writerOrData === "function") {
      const writer = writerOrData;
      const [draft, finalizeDraft] = createDataProxy(origData, {
        enablePatches: true,
      });
      // CONSIDER: We can also let the writer return the whole data to write.
      const dataOrPromise = writer(draft as D);
      if (dataOrPromise && typeof dataOrPromise.then === "function") {
        await dataOrPromise;
      }
      // Get whole data and patches for driver to decide which to send/write...
      const [data, patches, undo] = finalizeDraft();
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
        toEntry: toNode.entry,
        data: writerOrData,
      },
      out,
    );
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
    const fileTypeEnding = fileType.end;
    this.forEach(null, (node /* , i, siblings */) => {
      if (!node.isDir && node.name.endsWith(fileTypeEnding)) {
        const data = this.data(node.id);
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
