import {
  Driver,
  Entry,
  FileTypes,
  // Node,
  TransactionParams,
  DriverProps,
  registerDriver,
  TransactionOutParams,
} from "@/core";
// Local
import type { WebClient } from "./WebClient";

declare module "@/core" {
  interface DriverTypeOptions {
    web: WebDriverConfig;
  }
  interface DriverTypes<FT extends FileTypes<FT>> {
    web: WebDriver<FT>;
  }
}

// TODO: Send ctime + patches for write json data to server.

export class WebDriver<FT extends FileTypes<FT>> extends Driver<FT> {
  /** The repo configuration. */
  #client: WebClient;

  constructor(props: DriverProps<FT>, config: WebDriverConfig) {
    super(props);
    // Set object name for the default `toString` implementation.
    (this as any)[Symbol.toStringTag] = `WebDriver`;
    this.#client = config.client;
  }

  // #region -- Lifecycle

  /** Handles closing the repo. */
  override async onClose() {
    console.log("WebDriver onClose");
    const client = this.#client;
    await client.close();
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
    // const { id, nodes, total } = await client.connect();
    // while (total > nodes.length) {
    //   const load = await client.load(id);
    //   nodes.push(...load.nodes);
    // }
    // // Fill our nodes...
    // for (const { id, name, pId, ctime } of nodes) {
    //   const stats = { ctime };
    //   files.add(name, { id, pId, stats });
    // }
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
    const result = await this.#client.get(params);
    const entry = fileTree.getEntry(result.id);
    if (!entry) {
      throw new Error(`Entry not found "${result.id}".`);
    }
    // Update our data cache.
    fileTree.setData(entry, result.data);
    // CONSIDER: Update our data cache in the WebClient instead?
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
    return fsAction(this.fileTree, this.#client.write(params), out);
  }
  // #endregion
}
/** Configuration data for WebDriver. */
export interface WebDriverConfig {
  client: WebClient;
}

// Set object name for the default `toString` implementation.
(WebDriver as any)[Symbol.toStringTag] = "WebDriver";

function createWebDriver<FT extends FileTypes<FT>>(
  props: DriverProps<FT>,
  config: WebDriverConfig,
): WebDriver<FT> {
  return new WebDriver<FT>(props, config);
}
registerDriver("web", createWebDriver);

async function fsAction(
  tree: DriverProps<any>["fileTree"],
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
