import Path from "node:path";
import FS from "node:fs";
import FSP from "node:fs/promises";
// import * as JsonPatch from "fast-json-patch";
import { glob } from "glob";
import {
  type CommandName,
  type CommandParams,
  type CommandResult,
  type ExecCommandProps,
  type NodeOptions,
  type DriverProps,
  // type EntryOfId,
  type NodeEntry,
  Driver,
  applyPatch,
  command,
  registerDriver,
} from "@jrfs/core";
// Local
import { FsConfig, FsIndexData, FsIndexDefaultFileExtension } from "@/types";
import { hostDataPath } from "@/helpers";

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
  /** Full file-system path to the data directory. */
  #dataPath = "";
  /** Full path to an index file, if any. */
  #indexFile: string | undefined;
  /** Depth of the root children in the absolute fs {@link #dataPath}. */
  #rootChildDepth = 0;

  #transactions: Transactions = { queue: [] };

  constructor(
    props: DriverProps,
    optionsOrConfigPath: string | FsDriverOptions,
  ) {
    const { config, configFile, dataPath, indexFile } =
      openConfig(optionsOrConfigPath);
    super(props);

    const { config: repoConfig } = props;
    repoConfig.host.dataPath = dataPath;

    // Set object name for the default `toString` implementation.
    (this as any)[Symbol.toStringTag] = `FsDriver("${dataPath}")`;

    this.#config = config;
    this.#configFile = configFile;
    this.#dataPath = dataPath;
    if (indexFile) {
      this.#indexFile = indexFile;
    }
    this.#rootChildDepth = dataPath.split(Path.sep).length;
    this.commands.register(fsCommands);
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
      const dataPath = this.#dataPath;
      const fileTypes = this.fileTypes;
      // Make sure the path exists and that it's a directory.
      await FSP.mkdir(dataPath, { recursive: true }).catch(
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
            cwd: dataPath,
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

  async exec<CN extends CommandName | (string & Omit<string, CommandName>)>(
    commandName: CN,
    params: CommandParams<CN>,
    props: ExecCommandProps,
  ): Promise<CommandResult<CN>> {
    console.log(`[FS] Exec ${commandName}`, params);
    return this.#transaction(async () => {
      const cmd = this.commands.get(commandName);
      if (!cmd) {
        throw new Error(`Command not found "${commandName}".`);
      }
      return cmd(
        {
          config: props.config,
          files: this.files,
          fileTypes: this.fileTypes,
        },
        params,
      );
    });
  }
}
// #region -- Diagnostics

// Set object name for the default `toString` implementation.
(FsDriver as any)[Symbol.toStringTag] = "FsDriver";

// #endregion
// #region -- Driver Factory

function createFsDriver(
  props: DriverProps,
  optionsOrConfigPath: string | FsDriverOptions,
): FsDriver {
  return new FsDriver(props, optionsOrConfigPath);
}
registerDriver("fs", createFsDriver);

// #endregion
// #region -- Config

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
    data: "./data",
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
  const dataPath = configDir
    ? Path.join(configDir, config.data)
    : Path.resolve(config.data);
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
    dataPath,
  };
}
// #endregion
// #region -- Transactions

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
// #endregion

const fsCommands = [
  command("fs.add", async function fsAdd({ config, files }, params) {
    const { to, data } = params;
    // CONSIDER: Do we need isDir/isFile signaling for the caller here?
    const isDir = !("data" in params);
    const toPath = hostDataPath(config, to);
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
    const target = files.add(to, isDir ? { stats } : { data, stats });
    return { id: target.id };
  }),
  command("fs.copy", async function fsCopy({ config, files }, { from, to }) {
    const { entry: fromEntry } = files.entry(from);
    const fromPath = hostDataPath(config, from);
    const toPath = hostDataPath(config, to);
    console.log("[FS] cp", from, to);
    await FSP.cp(fromPath, toPath, {
      preserveTimestamps: true,
      recursive: true,
    });
    const stats = await FSP.stat(toPath);
    const target = files.copy(fromEntry, to, { stats });
    return { id: target.id };
  }),
  command("fs.get", async function fsGet({ config, files }, { from }) {
    const { entry: fromEntry } = files.entry(from);
    const fromPath = hostDataPath(config, from);
    const stats = await FSP.stat(fromPath);
    if (fromEntry.ctime !== stats.ctime.getTime()) {
      console.warn(`Error: The ctime in memory != fs "${fromPath}".`);
      // CONSIDER: Trigger FsWatcher change when FsWatcher feature exists.
      // - We would also have to return an updated entry.
    }
    console.log("READING", fromPath);
    const jsonText = (await FSP.readFile(fromPath)).toString();
    const jsonData = JSON.parse(jsonText);
    files.setData(fromEntry, jsonData);
    return {
      id: fromEntry.id,
      data: jsonData,
    };
  }),
  command("fs.move", async function fsMove({ config, files }, { from, to }) {
    const { entry: fromEntry } = files.entry(from);
    const fromPath = hostDataPath(config, from);
    const toPath = hostDataPath(config, to);
    const toPathParent = Path.dirname(toPath);
    console.log("[FS] mv", from, to);
    await FSP.mkdir(toPathParent, { recursive: true });
    await FSP.rename(fromPath, toPath);
    const stats = await FSP.stat(toPath);
    const target = files.move(fromEntry, to, { stats });
    return { id: target.id };
  }),
  command("fs.remove", async function fsRemove({ config, files }, { from }) {
    const { entry: fromEntry } = files.entry(from);
    const fullPath = hostDataPath(config, from);
    console.log("[FS] rm", from);
    await FSP.rm(fullPath, { recursive: true });
    const target = files.remove(fromEntry);
    return { id: target.id };
  }),
  command(
    "fs.write",
    async function fsWrite({ config, files }, { to, data, ctime, patch }) {
      const { entry: toEntry, data: origData } = files.fileEntry(to);
      // Apply patch?
      if (patch && typeof data === "undefined") {
        console.log("[FS] Applying patch...");
        if (typeof origData === "undefined") {
          // CONSIDER: Just try and read the file here? Probably a bad idea...
          throw new Error(`Entry missing data, cannot patch "${to}".`);
        }
        if (ctime !== toEntry.ctime) {
          // TODO: Don't JUST throw an error here. Instead, figure out if the
          // patches are compatible and apply them OR throw a typed error so the
          // caller can handle it.
          throw new Error(`Entry out-of-sync, cannot patch "${to}".`);
        }
        // CONSIDER: origData could be null...
        data = applyPatch(origData!, patch);
      }
      // Overwriting?
      if (!patch) {
        if (ctime !== toEntry.ctime) {
          throw new Error(`Entry out-of-sync, cannot overwrite "${to}".`);
        }
      }
      // Write data
      const json = JSON.stringify(data, undefined, 2);
      const fullPath = hostDataPath(config, to);
      console.log("[FS] write", to);
      await FSP.writeFile(fullPath, json);
      const stats = await FSP.stat(fullPath);
      const target = files.write(toEntry, {
        data,
        stats,
        ...(ctime && patch
          ? {
              patch: { ctime, patches: patch },
            }
          : undefined),
      });
      return { id: target.id };
    },
  ),
];
