import { apply } from "mutative";
// Local
import { type CreateShortIdFunction, deepFreeze } from "@/helpers";
import {
  Node,
  INTERNAL,
  createRoot,
  sortChildren,
  isDirectoryNode,
  isFileNode,
  NoChildren,
  DirectoryNode,
  NodeNotFoundError,
  FileNode,
  FileTreeRoot,
  FileTreeInternal,
  FileTreeNodes,
  hasFileData,
} from "@/internal/types";
import {
  Entry,
  EntryOrId,
  FileTreeChange,
  MutativePatches,
  NodeBuilder,
  NodeEntry,
  NodeOptions,
  getCtimeOption,
  isDirectoryId,
} from "@/types";
import type { TransactionOutParams } from "./Driver";
import { FileTree } from "./FileTree";

export interface FileTreeChangeParams {
  /** FS node stats. */
  stats: NodeOptions["stats"];
}

export type FileTreeChangeResult = FileTreeChange & {
  target: Entry;
  tx: number;
};

export interface FileTreeAddParams extends FileTreeChangeParams {
  /** File data. Required for adding a file. */
  data?: unknown;
}

export interface FileTreeWriteParams extends FileTreeChangeParams {
  data: unknown;
  patch?: {
    ctime: number;
    patches: MutativePatches;
    undo?: MutativePatches;
  };
}

export class WritableFileTree extends FileTree {
  /** Base file tree interface to forward state changes to. */
  #base: FileTreeInternal;
  #createShortId: CreateShortIdFunction;
  #target: FileTree;

  /** Use `WritableFileTree[INTERNAL].create` to create an instance. */
  private constructor(
    baseTree: FileTree,
    createShortId: CreateShortIdFunction,
  ) {
    // Our WritableFileTree MUST share state (nodes,root,tx) with the base tree.
    // The `super` constructor will copy the initial references and values.
    super(baseTree);
    // We MUST forward state changes to #base. See setRootNode, setTx, etc.
    this.#base = baseTree[INTERNAL];
    console.assert(this.cache === baseTree.cache, "Cache should match.");
    console.assert(this.nodes === this.#base.nodes, "Nodes should match.");
    console.assert(this.root === this.#base.root, "Root should match.");
    this.#createShortId = createShortId;
    this.#target = baseTree;
  }

  /** Gets the target {@link FileTree} that is being written to. */
  get target() {
    return this.#target;
  }

  // #region -- Internal
  static #internal = {
    /** Creates a new WritableFileTree. */
    create(baseTree: FileTree, createShortId: CreateShortIdFunction) {
      const writable = new WritableFileTree(baseTree, createShortId);
      return writable;
    },
  };
  static get [INTERNAL]() {
    return WritableFileTree.#internal;
  }
  // #endregion
  // #region -- Core

  #addEntry(
    entry: Entry,
    isDir: boolean,
    parentNode?: DirectoryNode,
    data?: unknown,
  ): Node {
    const { nodes } = this;
    const { id } = entry;
    // Create
    const node: Node = isDir
      ? {
          entry,
          children: NoChildren,
        }
      : {
          entry,
          data: deepFreeze(data),
        };
    nodes.set(id, Object.freeze(node));
    // Add to parent
    this.#addToParent(entry, parentNode);
    return node;
  }

  #addToParent(entry: EntryOrId, parent?: DirectoryNode) {
    const { nodes, root } = this;
    const id = typeof entry === "string" ? entry : entry.id;
    // Add to parent
    if (parent) {
      return this.#set(parent, {
        children: [...parent.children, id],
        // Children will be sorted by this.#set()
      });
    } else {
      const { children } = root;
      this.setRootNode(
        createRoot(
          children
            ? sortChildren([...children, id], nodes)
            : Object.freeze([id]),
        ),
      );
      return undefined;
    }
  }

  /** Adds node to the tree. */
  #create(name: string, options: NodeOptions): Node {
    const { data, isDir = false, pId, stats } = options ?? {};
    const id = createNodeId(isDir ? "d" : "f", this.nodes, this.#createShortId);
    const entry: Entry = {
      id,
      name,
      ctime: getCtimeOption(stats),
      ...(pId ? { pId } : undefined),
    };
    Object.freeze(entry);
    const { parentNode } = this.#validateNewEntry(entry);
    return this.#addEntry(entry, isDir, parentNode, data);
  }
  /** Disconnect node from parent. */
  #disconnect({ entry: { id, pId } }: Node): Node | undefined {
    let parentNode = this.#getDirectory(pId);
    const children = parentNode?.children ?? this.root.children;
    // console.log("DISCONNECT", id, "FROM", pId);

    const i = children.indexOf(id);
    // console.log("DISCONNECTING", i);
    if (i > -1) {
      const newChildren = [...children];
      newChildren.splice(i, 1);
      // console.log("NEW CHILDREN", newChildren);
      if (parentNode) {
        parentNode = this.#set(parentNode, {
          children: newChildren,
        }) as DirectoryNode;
      } else {
        this.setRootNode(createRoot(Object.freeze(newChildren)));
      }
    }
    return parentNode;
  }

  #getDirectory(
    entry: EntryOrId | null | undefined,
  ): DirectoryNode | undefined {
    const id = typeof entry === "string" ? entry : entry?.id;
    if (!id) {
      return undefined;
    }
    if (!isDirectoryId(id)) {
      throw new Error(`Expected directory id.`);
    }
    const node = this.nodes.get(id) as DirectoryNode;
    if (!node) {
      throw new NodeNotFoundError(id);
    }
    return node;
  }

  #getNode(entry: EntryOrId): Node | undefined {
    return this.nodes.get(typeof entry === "string" ? entry : entry.id);
  }

  #nextTx() {
    return this.setTx(this.tx + 1);
  }
  /** Set node props. @returns A new immutable node. */
  #set(
    orig: Node,
    props: {
      entry?: Partial<NodeEntry>;
      children?: string[] | readonly string[];
      data?: unknown;
    },
  ): Node {
    const { cache, nodes } = this;
    const { entry, children, data } = props;
    const id = orig.entry.id;
    const dataChanging = "data" in props;
    const node: Node = Object.freeze(
      Object.assign(
        {
          entry: entry
            ? Object.freeze({ ...orig.entry, ...entry })
            : orig.entry,
        },
        isDirectoryNode(orig)
          ? {
              children: children
                ? children.length > 0
                  ? sortChildren(children, nodes)
                  : Object.freeze(children)
                : orig.children,
            }
          : isFileNode(orig)
            ? { data: dataChanging ? deepFreeze(data) : orig.data }
            : undefined,
      ),
    );
    nodes.set(id, node);
    /**
     * Manage effects
     *
     * We're NOT WAITING for any FileCacheProvider promises here since we don't
     * want to make this an async function.
     *
     * Therefore, all FileCacheProvider implementations MUST block readers
     * while writing.
     */
    if (dataChanging && cache) {
      if (typeof data !== "undefined") {
        console.log("[FT] Caching", node.entry.id, (node as FileNode).data);
        cache.set(node.entry, (node as FileNode).data);
      } else {
        console.log("[FT] Uncaching", node.entry.id);
        cache.delete(node.entry);
      }
    }
    if (entry) {
      const entry = node.entry;
      if (orig.entry.pId !== entry.pId) {
        // Remove from old parent.
        this.#disconnect(orig);
        // Add to new parent.
        const parentNode = this.#getDirectory(entry.pId);
        this.#addToParent(entry, parentNode);
      } else if (orig.entry.name !== entry.name) {
        // Sort parent's children.
        this.#sortSiblings(node);
      }
    }
    return node;
  }
  /** Sort node parent children. */
  #sortSiblings(node: Node) {
    const { nodes, root } = this;
    const { pId } = node.entry;
    if (!pId) {
      this.setRootNode(createRoot(sortChildren(root.children!, nodes)));
      return node;
    } else {
      const parentNode = nodes.get(pId)! as DirectoryNode;
      return this.#set(parentNode, {
        children: parentNode.children,
      });
    }
  }

  #validateNewEntry(entry: Entry) {
    const { id, name, pId } = entry;
    const node = this.getNode(id);
    if (node) {
      throw new Error(`Node already exists with id "${id}".`);
    }
    const parentNode = this.getDirectory(pId);
    const siblings = (parentNode ?? this.root).children;
    if (this.nameExists(name, siblings)) {
      throw new Error(`Node "${name}" already exists in ${pId ?? "root"}.`);
    }
    return { parentNode, siblings };
  }
  /** Sets the cached data for a given node. */
  setData(entry: EntryOrId, data?: unknown) {
    const node = this.getNode(entry)!;
    return this.#set(node, { data }).entry;
  }

  protected override setRootNode(value: Readonly<FileTreeRoot>) {
    // Forward to super so this tree works and to #base so that tree works.
    // We don't have to do this with nodes because the nodes never change.
    super.setRootNode(value);
    this.#base.root = value;
  }

  protected override setTx(value: number): number {
    // Forward to super so this tree works and to #base so that tree works.
    // We don't have to do this with nodes because the nodes never change.
    super.setTx(value);
    this.#base.tx = value;
    return value;
  }
  // #endregion
  // #region -- Node Transactions

  /**
   * Adds a directory or file by name or path.
   * @returns An array of all entries that were created for the given path,
   * starting with the last created entry.
   * @example
   * // Add a single file node.
   * const [id] = tree.add("file.json", { data, pId: parent.id });
   * // Add a file node and possibly a tmp/folder path.
   * const [id, ...parentIds] = tree.add("tmp/folder/file.json", { data });
   */
  add(
    path: string,
    params: FileTreeAddParams,
    out?: TransactionOutParams,
  ): Entry {
    console.log("ADDING TO", path);
    const pathSegments = path.split("/");
    const {
      exists,
      entry: existingNode,
      index: existingNodeIdx,
    } = this.maxPathMatch(pathSegments);
    if (exists) {
      throw new Error(
        `Cannot overwrite node "${existingNode?.id}" at "${path}".`,
      );
    }
    const pathDepth = pathSegments.length;
    // TODO: Better isDir/isFile detection!
    const isDir = !("data" in params);
    const data = params.data;
    if (pathDepth === 1) {
      // Create single file OR directory at root
      const node = this.#create(path, {
        data,
        isDir,
        pId: undefined,
        stats: params.stats,
      });
      const change: FileTreeChange = {
        op: "add",
        id: node.entry.id,
        added: [node.entry],
        tx: this.#nextTx(),
      };
      if (out) {
        out.tx = change.tx!;
      }
      this.#base.onChange(change);
      return node.entry;
    }
    // Create each segment of the path. If it's a file path, add that last.
    let nextParentId: string | undefined = existingNode?.id;
    const fileName = !isDir ? pathSegments.pop() : undefined;
    const { length } = pathSegments;
    const added: Entry[] = [];

    // Create each destination folder segment.
    for (let i = existingNodeIdx + 1; i < length; i++) {
      const { entry } = this.#create(pathSegments[i]!, {
        isDir: true,
        pId: nextParentId,
        // NOTE: Sharing the stats of the target with the path nodes...
        stats: params.stats,
      });
      added.push(entry);
      nextParentId = entry.id;
    }
    // Create the file segment, if any.
    if (fileName) {
      const node = this.#create(fileName, {
        data,
        isDir: false,
        pId: nextParentId,
        stats: params.stats,
      });
      added.push(node.entry);
    }
    const entry = added[added.length - 1]!;
    const change: FileTreeChange = {
      op: "add",
      id: entry.id,
      added,
      tx: this.#nextTx(),
    };
    if (out) {
      out.tx = change.tx!;
    }
    this.#base.onChange(change);
    return entry;
  }
  /** Copies a file/directory. */
  copy(
    src: EntryOrId,
    to: string,
    params: FileTreeChangeParams,
    out?: TransactionOutParams,
  ): Entry {
    // Find existing destination parent, if any.

    const pathSegments = to.split("/");
    const match = this.maxPathMatch(pathSegments);
    let parentNode = match.entry
      ? (this.#getNode(match.entry) as DirectoryNode)
      : undefined;
    const parentPathIndex = match.index;
    console.log("[FT] EXIST", match.exists, match.entry?.id, parentPathIndex);

    // Pop the target name off the path.

    const name = pathSegments.pop()!;
    const pathDepth = pathSegments.length;
    const added: Entry[] = [];

    // Create target path? (Get target parentNode.)

    if (pathDepth > 0) {
      let nextParentId: string | undefined = parentNode?.entry.id;
      for (let i = parentPathIndex + 1; i < pathDepth; i++) {
        // Create a folder node.
        const { entry } = this.#create(pathSegments[i]!, {
          isDir: true,
          pId: nextParentId,
          // NOTE: Sharing the stats of the target with the path nodes...
          stats: params.stats,
        });
        added.push(entry);
        nextParentId = entry.id;
      }
      if (nextParentId && nextParentId !== parentNode?.entry.id) {
        parentNode = this.#getNode(nextParentId) as DirectoryNode;
      }
    }
    // Create target entry [name], [pId]

    const srcNode = this.#getNode(src)!;
    const isDir = isDirectoryNode(srcNode);

    const newNode = this.#create(name, {
      isDir,
      pId: parentNode?.entry.id,
      stats: {
        ctime: getCtimeOption(params.stats),
      },
      ...(!isDir ? { data: srcNode.data } : undefined),
    });
    const newEntry = newNode.entry;
    added.push(newEntry);

    // Copy children of srcNode into newNode, if any.

    if (isDir) {
      /** Maps srcNode directory nodes to newly created directory nodes... */
      const newDirBySrcDir = new Map<Node, Node>([[srcNode, newNode]]);
      // Copy descendants from srcNode to newNode.
      this.eachNode(srcNode, (childNode, { parent }) => {
        const isDir = isDirectoryNode(childNode);
        const orig = childNode.entry;
        const newParent = newDirBySrcDir.get(parent!)!;
        const newChildNode = this.#create(orig.name, {
          isDir,
          pId: newParent.entry.id,
          stats: {
            ctime: orig.ctime,
          },
          ...(!isDir ? { data: childNode.data } : undefined),
        });
        added.push(newChildNode.entry);
        if (isDir) {
          newDirBySrcDir.set(childNode, newChildNode);
        }
      });
    }

    const change: FileTreeChange = {
      op: "copy",
      id: newEntry.id,
      added,
      tx: this.#nextTx(),
    };
    if (out) {
      out.tx = change.tx!;
    }
    this.#base.onChange(change);
    return newEntry;
  }
  /** Moves or renames a file/directory. */
  move(
    src: EntryOrId,
    to: string,
    params: FileTreeChangeParams,
    out?: TransactionOutParams,
  ): Entry {
    const node = this.#getNode(src)!;

    // Find existing destination parent, if any.

    const pathSegments = to.split("/");
    const match = this.maxPathMatch(pathSegments);
    let parentNode = match.entry
      ? (this.#getNode(match.entry) as DirectoryNode)
      : undefined;
    const parentPathIndex = match.index;
    console.log("[FT] EXIST", match.exists, match.entry?.id, parentPathIndex);

    // Pop the target name off the path.

    const name = pathSegments.pop();
    const pathDepth = pathSegments.length;
    const added: Entry[] = [];

    // Create target path? (Get final parentNode.)

    if (pathDepth > 0) {
      let nextParentId: string | undefined = parentNode?.entry.id;
      for (let i = parentPathIndex + 1; i < pathDepth; i++) {
        // Create a folder node.
        const { entry } = this.#create(pathSegments[i]!, {
          isDir: true,
          pId: nextParentId,
          // NOTE: Sharing the stats of the target with the path nodes...
          stats: params.stats,
        });
        added.push(entry);
        nextParentId = entry.id;
      }
      if (nextParentId && nextParentId !== parentNode?.entry.id) {
        parentNode = this.#getNode(nextParentId) as DirectoryNode;
      }
    }
    // Update entry [name], [pId]

    const entry = this.#set(node, {
      entry: {
        name,
        pId: parentNode?.entry.id,
        ctime: getCtimeOption(params.stats),
      },
    }).entry;
    const change: FileTreeChange = {
      op: "move",
      id: entry.id,
      added: added.length ? added : undefined,
      changed: [entry],
      tx: this.#nextTx(),
    };
    if (out) {
      out.tx = change.tx!;
    }
    this.#base.onChange(change);
    return entry;
  }
  /** Removes the given node entry from the tree. */
  remove(entry: EntryOrId, out?: TransactionOutParams): Entry {
    return this.#removeEntry(entry, undefined, out)!;
  }

  #removeEntry(
    entry: EntryOrId,
    sync?: { tx: number; removed: string[] },
    out?: TransactionOutParams,
  ): Entry | undefined {
    // console.log("DELETE", entry);
    const node = this.#getNode(entry);
    if (!node) {
      if (!sync) {
        throw new NodeNotFoundError(entry);
      }
      if (out) {
        out.tx = sync.tx;
      }
      // NOTE: When the sync method calls it doesn't use the return value.
      return undefined;
    }
    const id = node.entry.id;
    // Delete node children.
    const { nodes } = this;
    /** Removal entries in order from children to parents. */
    const removals: Entry[] = isDirectoryNode(node)
      ? this.descendants(node.entry).reverse()
      : [];
    for (const child of removals) {
      // console.log("DELETING", childId, child.name);
      nodes.delete(child.id);
    }
    // Delete node.
    // console.log("DELETING", id, node.name);
    this.#disconnect(node);
    nodes.delete(id);
    removals.push(node.entry);
    const change: FileTreeChange = {
      op: "remove",
      id,
      removed: removals.map((it) => it.id),
      tx: sync?.tx ?? this.#nextTx(),
    };
    if (sync) {
      if (
        sync.removed.length !== change.removed!.length ||
        !sync.removed.every((el, i) => el === change.removed![i])
      ) {
        console.error("INVALID REMOVAL ON SYNC");
        console.dir({ sync, change });
      }
    }
    this.#base.onChange(change);
    // NOTE: When the sync method calls it doesn't use the return value.
    return node.entry;
  }
  /** Renames a file/directory. @deprecated Use {@link move} */
  rename(entry: EntryOrId, name: string, out?: TransactionOutParams): Entry {
    let node = this.#getNode(entry)!;
    // Update our node entry
    node = this.#set(node, {
      entry: { name },
    });
    const change: FileTreeChange = {
      op: "move",
      id: node.entry.id,
      changed: [node.entry],
      tx: this.#nextTx(),
    };
    if (out) {
      out.tx = change.tx!;
    }
    this.#base.onChange(change);
    return node.entry;
  }
  /** Applies a node entry change from another tree. */
  sync(change: FileTreeChange): void {
    const { id: targetId, op, tx, added, changed, removed, patch } = change;
    // Set the tx BEFORE calling #base.onChange like other transactions.
    this.setTx(tx);
    if (op === "remove") {
      this.#removeEntry(targetId, { tx, removed: removed! });
      // NOTE: this.#base.onChange is called by this.#removeEntry.
    } else {
      let additions: Entry[] | undefined;
      if (added) {
        additions = [];
        for (const entry of added) {
          const { parentNode } = this.#validateNewEntry(entry);
          additions.push(
            this.#addEntry(entry, isDirectoryId(entry.id), parentNode).entry,
          );
        }
      }
      let changes: Entry[] | undefined;
      if (changed) {
        changes = [];
        const { nodes } = this;
        for (const { id, ctime, name, pId } of changed) {
          const node = nodes.get(id)!;
          let dataProps: { data?: unknown } | undefined;
          if (patch && id === targetId && hasFileData(node)) {
            // We are patching this node's cached data if it's in sync.
            if (patch.ctime !== node.entry.ctime) {
              // REMOVE out of sync data!
              console.error(`Removing out of sync data on "${name}"!`);
              dataProps = { data: undefined };
            } else {
              // Patch away since the original patch ctime matches our ctime.
              dataProps = {
                data: apply(node.data, patch.patches),
              };
            }
          }
          // Update the node's entry
          changes.push(
            this.#set(node, {
              entry: {
                ctime: ctime,
                name: name,
                pId: pId,
              },
              ...dataProps,
            }).entry,
          );
        }
      }
      this.#base.onChange({
        id: targetId,
        op,
        tx,
        added: additions,
        changed: changes,
        patch,
      });
    }
  }
  /** Writes to an existing file. */
  write(
    entry: EntryOrId,
    params: FileTreeWriteParams,
    out?: TransactionOutParams,
  ): Entry {
    const { data, patch, stats } = params;
    let node = this.#getNode(entry);
    if (!node) {
      // TODO: Use a node getter that just does this automatically...
      throw new NodeNotFoundError(entry);
    }
    node = this.#set(node, {
      data,
      entry: { ctime: getCtimeOption(stats) },
    });
    const change: FileTreeChange = {
      op: "write",
      id: node.entry.id,
      changed: [node.entry],
      patch,
      tx: this.#nextTx(),
    };
    if (out) {
      out.tx = change.tx!;
    }
    this.#base.onChange(change);
    return node.entry;
  }
  // #endregion
  // #region -- Tree Actions
  /** Builds the tree from source. */
  async build<T>(cb: (builder: FileTreeBuilder) => Promise<T>): Promise<T> {
    const nodes = this.nodes;
    if (nodes.size > 0) {
      throw new Error(`The FileTree is not empty!`);
    }
    const items = new Map<string, NodeBuilder>();
    const rootItems: string[] = [];
    const { builder } = createFileTreeBuilder(
      items,
      rootItems,
      this.#createShortId,
    );
    const cbResult = await cb(builder);
    for (const [id, item] of items.entries()) {
      // Map to Node
      const entry = Object.freeze(item.entry);
      const node = Object.freeze(
        isDirectoryId(id)
          ? {
              entry,
              children: item.children
                ? item.children.length > 0
                  ? sortChildren(item.children, items as FileTreeNodes)
                  : NoChildren
                : NoChildren,
            }
          : {
              entry,
              data: deepFreeze(item.data),
            },
      );
      // Add
      nodes.set(id, node);
    }
    const rootChildren = sortChildren(rootItems, items as FileTreeNodes);
    this.setRootNode(createRoot(rootChildren));
    this.setTx(builder.tx);
    return cbResult;
  }

  // CONSIDER: Merge build and open methods, they do the same thing...

  open(params: { entries: Entry[]; tx: number }) {
    const { entries, tx } = params;

    // DO NOT call #base.onChange UNLIKE normal Node Transactions.
    this.setTx(tx);

    // ASSUMPTION: None of the calls ahead will trigger FileTree.onChange.

    // CONSIDER: Same code pattern as sync({op:"add"}) here...
    const additions: Entry[] = [];
    for (const entry of entries) {
      const { parentNode } = this.#validateNewEntry(entry);
      additions.push(
        this.#addEntry(entry, isDirectoryId(entry.id), parentNode).entry,
      );
    }
  }
  /** Clears all nodes and resets the root node. */
  reset() {
    this.nodes.clear();
    this.setRootNode(createRoot());
  }

  override toString() {
    return `Writable(${this.#target})`;
  }
  // #endregion
}

interface DirBuilder extends NodeBuilder {
  children: string[];
}

interface FileTreeBuilder {
  tx: number;
  add(name: string, info: NodeOptions): NodeEntry;
}
/**
 * @param nodes Nodes by id.
 * @param roots Root node ids.
 */
function createFileTreeBuilder(
  nodes: Map<string, NodeBuilder>,
  roots: string[],
  createShortId: CreateShortIdFunction,
) {
  const builder: FileTreeBuilder = {
    tx: 0,
    add(
      name: string,
      {
        id,
        data,
        isDir = id ? isDirectoryId(id) : false,
        pId,
        stats,
      }: NodeOptions,
    ): NodeEntry {
      if (!id) {
        id = createNodeId(
          isDir ? "d" : "f",
          nodes as FileTreeNodes,
          createShortId,
        );
      } else if (nodes.has(id)) {
        throw new Error(`Node already exists "${id}"`);
      }
      const entry: NodeEntry = {
        id,
        name,
        ctime: getCtimeOption(stats),
      };
      if (pId) {
        entry.pId = pId;
      }
      const node: NodeBuilder = isDir
        ? {
            entry,
            children: [],
          }
        : {
            entry,
            data,
          };
      nodes.set(id, node);
      if (pId) {
        if (!isDirectoryId(pId)) {
          throw new Error(`Parent must be a directory (${pId}).`);
        }
        const parentNode = nodes.get(pId) as DirBuilder;
        if (!parentNode) {
          throw new Error(`Parent not found (${pId}).`);
        }
        parentNode.children.push(id);
      } else {
        roots.push(id);
      }
      return entry;
    },
  };

  return {
    builder,
  };
}

function createNodeId(
  type: "d" | "f",
  nodes: FileTreeNodes,
  createShortId: CreateShortIdFunction,
) {
  let id = type + createShortId();
  while (nodes.has(id)) {
    id = type + createShortId();
  }
  return id;
}
