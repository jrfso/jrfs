import {
  type CommandName,
  type CommandParams,
  type CommandResult,
  type DriverProps,
  type EntryOfId,
  type ExecCommandProps,
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
    await client.open(this.files);
    // Cache file data?
    const cache = this.#cache;
    if (cache) {
      await cache.open(this.files);
    }
  }
  // #endregion
  // #region -- Diagnostics

  override toString() {
    return (this as any)[Symbol.toStringTag];
  }
  // #endregion

  async exec<CN extends CommandName | (string & Omit<string, CommandName>)>(
    commandName: CN,
    params: CommandParams<CN>,
    props: ExecCommandProps,
  ): Promise<CommandResult<CN>> {
    console.log(`[FS] Run ${commandName}`, params);
    if (commandName === "fs.get") {
      return this.#getCached(params, props) as CommandResult<CN>;
    } else if (commandName === "fs.write") {
      if ("patch" in params && "data" in params) {
        // Don't send the data, just the patch.
        delete params.data;
      }
    }
    // Try to get commands registered in browser, to run right here.
    const cmd = this.commands.get(commandName);
    if (cmd) {
      return cmd(
        {
          config: props.config,
          files: this.files,
          fileTypes: this.fileTypes,
        },
        params,
      );
    }
    return this.#client.exec(commandName, params, props);
  }

  /** Get file data.  */
  async #getCached(
    params: CommandParams<"fs.get">,
    props: ExecCommandProps,
  ): Promise<{
    id: EntryOfId["id"];
    data: unknown;
  }> {
    const { files } = this;
    const { entry: currEntry } = files.fileEntry(params.from);
    // Cached?
    const cache = this.#cache;
    if (cache) {
      const data = await cache.getData(currEntry);
      if (typeof data !== "undefined") {
        // Update our in-memory data.
        const entry = files.setData(currEntry, data);
        return { id: entry.id, data };
      }
    }
    // Get from server.
    const { id, data } = await this.#client.exec("fs.get", params, props);
    const entry = files.getEntry(id);
    if (!entry) {
      throw new Error(`Entry not found "${id}".`);
    }
    // Update our in-memory data.
    files.setData(entry, data);
    return {
      id,
      data,
    };
  }
}
/** Configuration data for WebDriver. */
export interface WebDriverConfig {
  client: WebClient;
  fileCache?: FileCacheProvider;
}

// Set object name for the default `toString` implementation.
(WebDriver as any)[Symbol.toStringTag] = "WebDriver";

function createWebDriver(
  props: DriverProps,
  config: WebDriverConfig,
): WebDriver {
  return new WebDriver(props, config);
}
registerDriver("web", createWebDriver);
