import {
  type CommandName,
  type CommandParams,
  type CommandResult,
  // type CommandsRunner,
  type DriverProps,
  type Entry,
  type EntryOfId,
  type FileTree,
  // type FsCommandName,
  // type FsCommands,
  // type RunCommand,
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
  // #region -- FS Actions

  // /** Add a directory or a file with data. */
  // async add(params: TransactionParams["add"]): Promise<Entry> {
  //   return fsAction(this.files, this.#client.add(params));
  // }
  // /** Get file data.  */
  // async get(params: CommandParams<"fs.get">): Promise<{
  //   id: EntryOfId["id"];
  //   data: unknown;
  // }> {
  //   const { files } = this;
  //   const { entry: currEntry } = files.fileEntry(params.from);
  //   // Cached?
  //   const cache = this.#cache;
  //   if (cache) {
  //     const data = await cache.getData(currEntry);
  //     if (typeof data !== "undefined") {
  //       // Update our in-memory data.
  //       const entry = files.setData(currEntry, data);
  //       return { id: entry.id, data };
  //     }
  //   }
  //   // Get from server.
  //   const result = await this.#client.get(params);
  //   const entry = files.getEntry(result.id);
  //   if (!entry) {
  //     throw new Error(`Entry not found "${result.id}".`);
  //   }
  //   // Update our in-memory data.
  //   files.setData(entry, result.data);
  //   return {
  //     id: entry.id,
  //     data: result.data,
  //   };
  // }
  // /** Move or rename a file/directory.  */
  // async copy(params: TransactionParams["copy"]): Promise<Entry> {
  //   return fsAction(this.files, this.#client.copy(params));
  // }
  // /** Move or rename a file/directory.  */
  // async move(params: TransactionParams["move"]): Promise<Entry> {
  //   return fsAction(this.files, this.#client.move(params));
  // }
  // /** Remove a file/directory. */
  // async remove(params: TransactionParams["remove"]): Promise<Entry> {
  //   const { files } = this;
  //   const entry = files.findPathEntry(params.from)!;
  //   const { id } = await this.#client.remove(params);

  //   if (files.getEntry(id)) {
  //     throw new Error(`Entry not removed "${id}".`);
  //   }
  //   return entry;
  // }
  // /** Write to a file. */
  // async write(params: TransactionParams["write"]): Promise<Entry> {
  //   // TODO: The driver can check before sending if patch?.ctime is out of date.
  //   // TODO: Even if no patch, we actually MUST pass ctime here too...
  //   return fsAction(this.files, this.#client.write(params));
  // }
  // #endregion

  async exec<CN extends CommandName | (string & Omit<string, CommandName>)>(
    commandName: CN,
    ...params: undefined extends CommandParams<CN>
      ? [params?: CommandParams<CN>]
      : [params: CommandParams<CN>]
  ): Promise<CommandResult<CN>> {
    console.log(`[FS] Run ${commandName}`, params);
    if (commandName === "fs.get") {
      return this.#getCachedFirst(params[0]!) as CommandResult<CN>;
    } else {
      // TODO: Get cmd from registered commands, to run here...
    }

    // TODO: Send command using WebClient...

    // return fsAction(this.files, this.#client)
    // return cmd(
    //   {
    //     // TODO: Get entries from caller...
    //     entries: {},
    //     files: this.files,
    //     fileTypes: this.fileTypes,
    //     hostPath: function dummyHostPath(s) {
    //       return s;
    //     },
    //   },
    //   params![0]!,
    // );
    return null!;
  }

  /** Get file data.  */
  async #getCachedFirst(params: CommandParams<"fs.get">): Promise<{
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
    const result = await this.#client.get(params);
    const entry = files.getEntry(result.id);
    if (!entry) {
      throw new Error(`Entry not found "${result.id}".`);
    }
    // Update our in-memory data.
    files.setData(entry, result.data);
    return {
      id: entry.id,
      data: result.data,
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

// async function fsAction(
//   tree: FileTree,
//   action: Promise<{ id: string }>,
// ): Promise<Entry> {
//   const { id } = await action;

//   const entry = tree.getEntry(id);
//   if (!entry) {
//     throw new Error(`Entry not found "${id}".`);
//   }
//   return entry;
// }
