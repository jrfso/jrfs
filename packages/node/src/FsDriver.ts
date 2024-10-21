import Path from "node:path";
import FS from "node:fs";
import FSP from "node:fs/promises";
// import * as JsonPatch from "fast-json-patch";
import { glob } from "glob";
import {
  NodeOptions,
  Driver,
  DriverProps,
  Entry,
  FileTypes,
  NodeEntry,
  TransactionOutParams,
  TransactionParams,
  registerDriver,
} from "@jrfs/core";
// Local
import { FsConfig, FsIndexData, FsIndexDefaultFileExtension } from "./types";

declare module "@jrfs/core" {
  interface DriverTypes {
    fs: FsDriver;
  }
  interface DriverTypeOptions {
    /** An absolute config file path or fs config options. */
    fs: string | FsDriverOptions;
  }
}

export interface FsDriverOptions extends Partial<FsConfig> {
  /** Path to read or save the config file. */
  config?: string;
}

// CONSIDER: Save tx in order to sync between restarts! Apply it inside onOpen
// in the files.build() block by setting files.tx = txFromFile;

export class FsDriver extends Driver {
  /** The repo configuration. */
  #config: FsConfig;
  /** Full path to the config file, if any. */
  #configFile: string | undefined;
  /** Full path to an index file, if any. */
  #indexFile: string | undefined;
  /** Depth of the root children in the absolute fs {@link #rootPath}. */
  #rootChildDepth = 0;
  /** Full root file-system path. */
  #rootPath = "";

  #transactions: Transactions = { queue: [] };

  constructor(
    props: DriverProps,
    optionsOrConfigPath: string | FsDriverOptions,
  ) {
    const { config, configFile, rootPath, indexFile } =
      openConfig(optionsOrConfigPath);
    super(props);

    // Set object name for the default `toString` implementation.
    (this as any)[Symbol.toStringTag] = `FsDriver("${rootPath}")`;
    this.#rootChildDepth = rootPath.split(Path.sep).length;
    this.#rootPath = rootPath;
    this.#config = config;
    this.#configFile = configFile;
    if (indexFile) {
      this.#indexFile = indexFile;
    }
  }

  override get rootPath() {
    return this.#rootPath;
  }

  // #region -- Lifecycle

  async #loadIndexFile(): Promise<FsIndexData | undefined> {
    const indexFile = this.#indexFile;
    if (!indexFile) {
      return undefined;
    }
    if (!FS.existsSync(indexFile)) {
      return undefined;
    }
    const json = (await FSP.readFile(indexFile)).toString();
    const indexFileData = JSON.parse(json) as FsIndexData;
    return indexFileData;
  }
  /** Handles closing the repo. */
  override async onClose() {
    await this.#writeIndexIfSet();
  }
  /**
   * Loads all directories and files within the root path using cached ids
   * from the {@link Config.ids} file, if any.
   */
  override async onOpen() {
    await this.files.build(async (files) => {
      const rootChildDepth = this.#rootChildDepth;
      const rootPath = this.#rootPath;
      const fileTypes = this.fileTypes;
      // Make sure the path exists and that it's a directory.
      await FSP.mkdir(rootPath, { recursive: true }).catch(
        (err: NodeJS.ErrnoException) => {
          if (err.code === "EEXIST") {
            throw new Error(`Expected FsDriver path to be a directory.`);
          }
        },
      );
      await this.#writeConfigFileIfNew();
      const indexFileData = await this.#loadIndexFile();
      // Load any existing ids so we can assign stable ids to srcNodes.
      const srcIds = indexFileData?.node;
      /** Source file-system nodes read via `glob`. */
      const srcNodes = (
        await glob(
          // CONSIDER: Use patterns like "**/*{/,+(.json|.jsonc)}" to match all
          // directories but only some files...
          "**/*",
          {
            cwd: rootPath,
            dot: true,
            // ignore: ["node_modules/**"],
            stat: true,
            withFileTypes: true,
          },
        )
      ).sort((a, b) => {
        // IMPORTANT: Sort by path so that parents come before their children and
        // the children are sorted alphabetically.
        const p1 = a.relative(),
          p2 = b.relative();
        return p1 > p2 ? 1 : p2 > p1 ? -1 : 0;
      });
      /** Paths for any directory nodes that we've already read. */
      const dirsByPath = new Map<string, NodeEntry>();

      // Map each srcNode into _nodes and assign parent/child references.
      for (const srcNode of srcNodes) {
        const type = srcNode.getType();
        if (type !== "Directory" && type !== "File") {
          continue;
        }
        const { name } = srcNode;
        const depth = srcNode.depth();
        const isDirectory = srcNode.isDirectory();
        const isRootDepth = depth === rootChildDepth;
        const pathFromRoot = srcNode.relativePosix();
        const nodeOptions: NodeOptions = {
          id: srcIds?.[pathFromRoot],
          isDir: isDirectory,
          stats: {
            ctime: srcNode.ctime ?? new Date(),
          },
        };
        let parentNode: NodeEntry | undefined;
        if (!isRootDepth) {
          // Set the parent id. We sorted srcNodes, so parents should always
          // appear before their children. Children should all also be sorted.
          const parentPathFromRoot = srcNode.parent!.relativePosix();
          parentNode = dirsByPath.get(parentPathFromRoot)!;
          nodeOptions.pId = parentNode.id;
        }
        if (!isDirectory && name.endsWith(".json")) {
          // Read only registered types by default.
          //
          // CONSIDER: Optionally, don't read ANY files immediately.
          //
          const fileType = fileTypes.fromPath(name);
          if (fileType) {
            console.log("READING", pathFromRoot);
            const jsonText = (
              await FSP.readFile(srcNode.fullpath())
            ).toString();
            const jsonData = JSON.parse(jsonText);
            //
            // CONSIDER: if (fileType?.schema) validate the data.
            //
            nodeOptions.data = jsonData;
          }
        }
        const node = files.add(name, nodeOptions);
        if (isDirectory) {
          dirsByPath.set(pathFromRoot, node);
        }
      }
      files.rid = indexFileData?.rid ?? this.files.createShortId(16);
    });
  }

  async #writeConfigFileIfNew() {
    const config = this.#config;
    const configFile = this.#configFile;
    if (configFile) {
      if (!FS.existsSync(configFile)) {
        await FSP.writeFile(configFile, JSON.stringify(config));
      }
    }
  }

  async #writeIndexIfSet() {
    const { files } = this;
    const indexFile = this.#indexFile;
    if (!indexFile) {
      return;
    }
    const nodeIds: FsIndexData["node"] = {};
    const indexFileData: FsIndexData = {
      rid: files.rid,
      node: nodeIds,
    };
    for (const node of files) {
      const path = files.path(node)!;
      nodeIds[path] = node.id;
    }
    const json = JSON.stringify(indexFileData, undefined, 2);
    await FSP.writeFile(indexFile, json);
  }
  // #endregion
  // #region -- Core

  /** Returns the full native path to the given relative node path. */
  #fullPath(nodePath: string) {
    return Path.join(this.#rootPath, nodePath);
  }
  /** Creates a transaction to prevent overlapped calls on the same driver. */
  #transaction<T>(cb: TransactionCallback<T>): Promise<T> {
    let onReject: (reason?: any) => void;
    let onResolve: (value: T | PromiseLike<T>) => void;
    const completed = new Promise<T>((resolve, reject) => {
      onResolve = resolve;
      onReject = reject;
    });
    const transaction = async () => {
      let err: any | undefined;
      let result: any | undefined;
      try {
        result = cb();
      } catch (ex) {
        err = ex;
      }
      if (result && typeof result.then === "function") {
        result.then(onResolve).catch(onReject);
      } else if (err) {
        onReject(err);
      } else {
        onResolve(result);
      }
    };
    const transactions = this.#transactions;
    transactions.queue.push(transaction);
    if (!transactions.running) {
      runTransactions(transactions);
    }
    return completed;
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
    return this.#transaction(async () => {
      const { to, data } = params;
      // CONSIDER: Do we need isDir/isFile signaling for the caller here?
      const isDir = !("data" in params);
      const toPath = this.#fullPath(to);
      console.log("[FS] add", to);
      if (isDir) {
        // Add directory
        await FSP.mkdir(toPath, { recursive: true });
      } else {
        const toPathParent = Path.dirname(toPath);
        await FSP.mkdir(toPathParent, { recursive: true });
        // Add file
        const json = JSON.stringify(data, undefined, 2);
        await FSP.writeFile(toPath, json);
      }
      const stats = await FSP.stat(toPath);
      const target = this.files.add(
        to,
        isDir ? { stats } : { data, stats },
        out,
      );
      return target;
    });
  }
  /** Move or rename a file/directory.  */
  async copy(
    { from, fromEntry, to }: TransactionParams["copy"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    return this.#transaction(async () => {
      const fromPath = this.#fullPath(from);
      const toPath = this.#fullPath(to);
      console.log("[FS] cp", from, to);
      await FSP.cp(fromPath, toPath, {
        preserveTimestamps: true,
        recursive: true,
      });
      const stats = await FSP.stat(toPath);
      const target = this.files.copy(fromEntry, to, { stats }, out);
      return target;
    });
  }
  /** Move or rename a file/directory.  */
  async get(
    { from, fromEntry }: TransactionParams["get"],
    // out?: TransactionOutParams,
  ): Promise<{ entry: Entry; data: unknown }> {
    return this.#transaction(async () => {
      const fromPath = this.#fullPath(from);
      const stats = await FSP.stat(fromPath);
      if (fromEntry.ctime !== stats.ctime.getTime()) {
        console.warn(`Error: The ctime in memory != fs "${fromPath}".`);
        // CONSIDER: Trigger FsWatcher change when FsWatcher feature exists.
        // - We would also have to return an updated entry.
      }
      console.log("READING", fromPath);
      const jsonText = (await FSP.readFile(fromPath)).toString();
      const jsonData = JSON.parse(jsonText);
      this.files.setData(fromEntry, jsonData);
      return {
        entry: fromEntry,
        data: jsonData,
      };
    });
  }
  /** Move or rename a file/directory.  */
  async move(
    { from, fromEntry, to }: TransactionParams["move"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    return this.#transaction(async () => {
      const fromPath = this.#fullPath(from);
      const toPath = this.#fullPath(to);
      const toPathParent = Path.dirname(toPath);
      console.log("[FS] mv", from, to);
      await FSP.mkdir(toPathParent, { recursive: true });
      await FSP.rename(fromPath, toPath);
      const stats = await FSP.stat(toPath);
      const target = this.files.move(fromEntry, to, { stats }, out);
      return target;
    });
  }
  /** Remove a file/directory. */
  async remove(
    { from, fromEntry }: TransactionParams["remove"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    return this.#transaction(async () => {
      const fullPath = this.#fullPath(from);
      console.log("[FS] rm", from);
      await FSP.rm(fullPath, { recursive: true });
      const target = this.files.remove(fromEntry, out);
      return target;
    });
  }
  /** Write to a file. */
  async write(
    { data, to, toEntry, patch }: TransactionParams["write"],
    out?: TransactionOutParams,
  ): Promise<Entry> {
    return this.#transaction(async () => {
      const json = JSON.stringify(data, undefined, 2);
      const fullPath = this.#fullPath(to);
      console.log("[FS] write", to);
      await FSP.writeFile(fullPath, json);
      const stats = await FSP.stat(fullPath);
      const target = this.files.write(toEntry, { data, stats, patch }, out);
      return target;
    });
  }
  // #endregion
}

// Set object name for the default `toString` implementation.
(FsDriver as any)[Symbol.toStringTag] = "FsDriver";

function createFsDriver<FT extends FileTypes<FT>>(
  props: DriverProps,
  optionsOrConfigPath: string | FsDriverOptions,
): FsDriver {
  return new FsDriver(props, optionsOrConfigPath);
}
registerDriver("fs", createFsDriver);

function openConfig(optionsOrConfigPath: string | FsDriverOptions) {
  const options =
    typeof optionsOrConfigPath === "string"
      ? { config: optionsOrConfigPath }
      : optionsOrConfigPath;
  const { config: configPath, ...configDefaults } = options;
  // Resolve paths.
  const configFile = configPath ? Path.resolve(configPath) : undefined;
  const configDir = configFile ? Path.dirname(configFile) : undefined;
  // Get or create config.
  let config: FsConfig = {
    root: "./data",
    ...configDefaults,
  };
  let indexFile = config?.index;
  if (configFile && configDir) {
    if (FS.existsSync(configFile)) {
      const configJson = FS.readFileSync(configFile).toString();
      config = JSON.parse(configJson) as FsConfig;
      indexFile = config.index;
    }
    if (!indexFile && indexFile !== false) {
      const configExt = Path.extname(configFile);
      // Create e.g. "projectDb.idx.json" for config file "projectDb.json"
      indexFile =
        Path.basename(configFile, configExt) + FsIndexDefaultFileExtension;
    }
    if (indexFile) {
      indexFile = Path.resolve(configDir, indexFile);
    }
  } else if (indexFile) {
    indexFile = Path.resolve(indexFile);
  }
  // Get the main data path, ensure it exists.
  const rootPath = configDir
    ? Path.join(configDir, config.root)
    : Path.resolve(config.root);
  return {
    /** The loaded {@link FsConfig}. */
    config,
    /** Full path to the directory containing the config file, if any. */
    configDir,
    /** Full path to the config file, if any. */
    configFile,
    /** Full path to the configured index file, if any. */
    indexFile,
    /** Full path to the root data directory. */
    rootPath,
  };
}

async function runTransactions(transactions: Transactions) {
  transactions.running = true;
  const { queue } = transactions;
  while (queue.length > 0) {
    const transaction = queue.shift()!;
    await transaction();
  }
  transactions.running = false;
}

type TransactionCallback<T = any> = () => Promise<T>;

interface Transactions {
  running?: boolean;
  queue: TransactionCallback[];
}
