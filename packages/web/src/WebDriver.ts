import {
  type DriverProps,
  type Entry,
  type FileTree,
  type FileTypes,
  type TransactionOutParams,
  type TransactionParams,
  Driver,
  registerDriver,
} from "@jrfs/core";
import { FileCacheProvider } from "@jrfs/core/cache";
// Local
import type { WebClient } from "./WebClient";

declare module "@jrfs/core" {
  interface DriverTypeOptions {
    web: WebDriverConfig;
  }
  interface DriverTypes {
    web: WebDriver;
  }
}

export class WebDriver extends Driver {
  /** The repo configuration. */
  #client: WebClient;
  #cache: FileCacheProvider | undefined;

  constructor(props: DriverProps, config: WebDriverConfig) {
    super(props);
    // Set object name for the default `toString` implementation.
    (this as any)[Symbol.toStringTag] = `WebDriver`;
    this.#client = config.client;
    this.#cache = config.fileCache;
  }

  // #region -- Lifecycle

  /** Handles closing the repo. */
  override async onClose() {
    console.log("WebDriver onClose");
    const client = this.#client;
    await client.close();
    const cache = this.#cache;
    if (cache) {
      await cache.close();
    }
  }
  /**
   * Loads all directories and files within the root path using cached ids
   * from the {@link Config.ids} file, if any.
   */
  override async onOpen() {
    console.log("WebDriver onOpen");
    // Get project file listing from server...
    const client = this.#client;
    await client.open(this.fileTree);
    // Cache file data?
    const cache = this.#cache;
    if (cache) {
      await cache.open(this.fileTree);
    }
  }
  // #endregion
  // #region -- Diagnostics

  override toString() {
    return (this as any)[Symbol.toStringTag];
  }
  // #endregion
  // #region -- FS Actions

  /** Add a directory or a file with data. */
  async add(
    params: TransactionParams["add"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    return fsAction(this.fileTree, this.#client.add(params), out);
  }
  /** Get file data.  */
  async get(params: TransactionParams["get"]): Promise<{
    entry: Entry;
    data: unknown;
  }> {
    const { fileTree } = this;
    // Cached?
    const cache = this.#cache;
    if (cache) {
      const entry = params.fromEntry;
      const data = await cache.getData(entry);
      if (typeof data !== "undefined") {
        return { entry, data };
      }
    }
    // Get from server.
    const result = await this.#client.get(params);
    const entry = fileTree.getEntry(result.id);
    if (!entry) {
      throw new Error(`Entry not found "${result.id}".`);
    }
    // Update our in-memory data.
    fileTree.setData(entry, result.data);
    return {
      entry,
      data: result.data,
    };
  }
  /** Move or rename a file/directory.  */
  async copy(
    params: TransactionParams["copy"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    return fsAction(this.fileTree, this.#client.copy(params), out);
  }
  /** Move or rename a file/directory.  */
  async move(
    params: TransactionParams["move"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    return fsAction(this.fileTree, this.#client.move(params), out);
  }
  /** Remove a file/directory. */
  async remove(
    params: TransactionParams["remove"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    const { fileTree } = this;
    const entry = fileTree.findPathEntry(params.from)!;
    const { id, tx } = await this.#client.remove(params);
    if (out) {
      out.tx = tx;
    }
    if (fileTree.getEntry(id)) {
      throw new Error(`Entry not removed "${id}".`);
    }
    return entry;
  }
  /** Write to a file. */
  async write(
    params: TransactionParams["write"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    // TODO: The driver can check before sending if patch?.ctime is out of date.
    // TODO: Even if no patch, we actually MUST pass ctime here too...
    return fsAction(this.fileTree, this.#client.write(params), out);
  }
  // #endregion
}
/** Configuration data for WebDriver. */
export interface WebDriverConfig {
  client: WebClient;
  fileCache?: FileCacheProvider;
}

// Set object name for the default `toString` implementation.
(WebDriver as any)[Symbol.toStringTag] = "WebDriver";

function createWebDriver<FT extends FileTypes<FT>>(
  props: DriverProps,
  config: WebDriverConfig,
): WebDriver {
  return new WebDriver(props, config);
}
registerDriver("web", createWebDriver);

async function fsAction(
  tree: FileTree,
  action: Promise<{ id: string; tx: number }>,
  out?: TransactionOutParams,
): Promise<Entry> {
  const { id, tx } = await action;
  if (out) {
    out.tx = tx;
  }
  const entry = tree.getEntry(id);
  if (!entry) {
    throw new Error(`Entry not found "${id}".`);
  }
  return entry;
}
