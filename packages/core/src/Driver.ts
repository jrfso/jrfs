// Local
import type {
  Entry,
  FileTree,
  FileTypeProvider,
  MutativePatches,
} from "@/index";
import { type CreateShortIdFunction } from "@/helpers";
import { INTERNAL } from "@/internal/types";
import { WritableFileTree } from "@/WritableFileTree";

/** Base JRFS driver class. */
export abstract class Driver {
  #createShortId: CreateShortIdFunction;
  #files = null! as WritableFileTree;
  #fileTypes: FileTypeProvider<any>;
  /** `true` if {@link open}, `false` if {@link close}d */
  #opened = false;

  constructor(props: DriverProps) {
    this.#createShortId = props.createShortId;
    this.#fileTypes = props.fileTypes;
  }

  // #region -- Props

  protected get files() {
    return this.#files;
  }

  protected get fileTypes() {
    return this.#fileTypes;
  }

  get opened() {
    return this.#opened;
  }

  get rootPath() {
    return "";
  }
  // #endregion
  // #region -- Lifecycle

  async close() {
    const opened = this.#opened;
    if (!opened) {
      return;
    }
    // Set `opened` to false immediately until a time if/when we have interim
    // states such as `closing` or `opening`...
    this.#opened = false;
    // Save state.
    await this.onClose();
    // Clear nodes.
    this.#files.reset();
  }
  /** Handles closing the repo. */
  protected abstract onClose(): Promise<void>;
  /** Handles opening the repo. */
  protected abstract onOpen(): Promise<void>;

  async open(files: FileTree) {
    const opened = this.#opened;
    if (opened) {
      throw new Error(`Driver has already opened ${this}`);
    }
    this.#files = WritableFileTree[INTERNAL].create(files, this.#createShortId);
    await this.onOpen();
    // Save state.
    this.#opened = true;
  }
  // #endregion
  // #region -- Transactions

  /** Add a directory or a file with data. */
  abstract add(
    params: TransactionParams["add"],
    out?: TransactionOutParams,
  ): Promise<Entry>;
  /** Copy a file/directory.  */
  abstract copy(
    params: TransactionParams["copy"],
    out?: TransactionOutParams,
  ): Promise<Entry>;
  /** Get a file's contents.  */
  abstract get(
    params: TransactionParams["get"] /*,  
      out?: TransactionOutParams,
    */,
  ): Promise<{ entry: Entry; data: unknown }>;
  /** Move or rename a file/directory.  */
  abstract move(
    params: TransactionParams["move"],
    out?: TransactionOutParams,
  ): Promise<Entry>;
  /** Remove a file/directory. */
  abstract remove(
    params: TransactionParams["remove"],
    out?: TransactionOutParams,
  ): Promise<Entry>;
  /** Write to a file. */
  abstract write(
    params: TransactionParams["write"],
    out?: TransactionOutParams,
  ): Promise<Entry>;

  // #endregion

  async exec(commandName: string, params: unknown): Promise<any> {
    // //

    // // CommandOf[C]["result"]> {
    // // TODO: Validate command.
    // const validate = null! as any; // CommandOf[C]["validate"];
    // const files = this.files;
    // let result = validate.call(
    //   null,
    //   {
    //     files,
    //     fileTypes: this.fileTypes,
    //   },
    //   params,
    // );
    // if (result instanceof Promise) {
    //   result = await result;
    // }
    // TODO: Run command via driver.
    console.log(`TODO: Run ${commandName}`, params);
    return null! as any; // Promise<CommandOf[C]["result"]>;
  }
}

export interface TransactionOutParams {
  /** Transaction number. */
  tx: number;
}

/** Parameter types for mutation transactions. */
export interface TransactionParams {
  add: {
    /** Path to file/directory. */
    to: string;
    /** File data. Required for adding a file. */
    data?: unknown;
  };
  copy: {
    /** Source path. */
    from: string;

    fromEntry: Entry;
    /** Destination path. */
    to: string;
  };
  get: {
    /** Source path. */
    from: string;
    fromEntry: Entry;
  };
  move: {
    /** Source path. */
    from: string;

    fromEntry: Entry;
    /** Destination path. */
    to: string;
  };
  remove: {
    /** Path of file/directory to remove. */
    from: string;

    fromEntry: Entry;
  };
  write: {
    to: string;
    toEntry: Entry;
    /** We always expect data so the driver can choose to use data or patch. */
    data: unknown;
    patch?: {
      ctime: number;
      patches: MutativePatches;
      undo?: MutativePatches;
    };
  };
}

/** Callback to create a driver. */
export type DriverFactory = (props: DriverProps, options: any) => Driver;

export interface DriverProps {
  createShortId: CreateShortIdFunction;
  fileTypes: FileTypeProvider<any>;
}
/**
 * Interface to declare a driver options types onto.
 * @example
 * declare module "@jrfs/core" {
 *   interface DriverTypeOptions {
 *     fs: FsDriverOptions;
 *   }
 * }
 */
export interface DriverTypeOptions {
  // e.g. ["fs"]: FsDriverOptions;
}
/** Interface to declare driver types onto. */
export interface DriverTypes {
  // e.g. ["fs"]: FsDriver;
}
