// Local
import type {
  CommandName,
  CommandParams,
  CommandRegistry,
  CommandResult,
  FileTree,
  FileTypeProvider,
  RunCommand,
} from "@/index";
import { type CreateShortIdFunction } from "@/helpers";
import { INTERNAL } from "@/internal/types";
import { WritableFileTree } from "@/WritableFileTree";

/** Base JRFS driver class. */
export abstract class Driver {
  #commands: CommandRegistry;
  #createShortId: CreateShortIdFunction;
  #files = null! as WritableFileTree;
  #fileTypes: FileTypeProvider<any>;
  /** `true` if {@link open}, `false` if {@link close}d */
  #opened = false;

  constructor(props: DriverProps) {
    this.#commands = props.commands;
    this.#createShortId = props.createShortId;
    this.#fileTypes = props.fileTypes;
  }

  // #region -- Props

  protected get commands() {
    return this.#commands;
  }

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

  /** Gets a command runner if registered with this driver. */
  command<CN extends CommandName | Omit<string, CommandName>>(
    commandName: CN,
  ): RunCommand<CN> | undefined {
    return null!;
  }

  abstract exec<CN extends CommandName | (string & Omit<string, CommandName>)>(
    commandName: CN,
    params: CommandParams<CN>,
  ): Promise<CommandResult<CN>>;
}

/** Callback to create a driver. */
export type DriverFactory = (props: DriverProps, options: any) => Driver;

export interface DriverProps {
  commands: CommandRegistry;
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
