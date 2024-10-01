// Local
import {
  type Entry,
  type EntryOrId,
  type EntryOrPath,
  type FileTreeChange,
  type FileTreeChangeHandler,
  type NodeInfo,
  type NodeMapper,
  type NodeVisitResult,
  type NodeVisitor,
  isDirectoryId,
  logFileTreeChange,
} from "@/types";
import {
  type DirectoryNode,
  type FileNode,
  type FileTreeInternal,
  type FileTreeNodes,
  type FileTreeRoot,
  type Node,
  type PathMap,
  INTERNAL,
  NodeNotFoundError,
  asEntry,
  asNode,
  asNodeInfo,
  createRoot,
  isDirectoryNode,
  isFileNode,
} from "@/internal/types";
import { FileCacheProvider } from "@/FileCacheProvider";

export class FileTree {
  #cache?: FileCacheProvider;
  #nodes: FileTreeNodes;
  #root: Readonly<FileTreeRoot>;
  #rootPath: string;
  #tx: number;

  constructor(options?: {
    cache?: FileCacheProvider;
    rootPath?: string;
    [INTERNAL]?: FileTreeInternal;
  }) {
    const { cache, rootPath, [INTERNAL]: internal } = options ?? {};
    this.#cache = cache;
    this.#rootPath = rootPath ?? "";
    this.#nodes = internal?.nodes ?? new Map<string, Node>();
    this.#root = internal?.root ?? createRoot();
    this.#tx = internal?.tx ?? 0;
  }

  // #region -- Internal

  readonly #internal = Object.defineProperties({} as FileTreeInternal, {
    nodes: {
      enumerable: true,
      get: () => this.#nodes,
    },
    root: {
      enumerable: true,
      get: () => this.#root,
      set: (value: FileTreeRoot) => {
        this.setRootNode(value);
      },
    },
    tx: {
      enumerable: true,
      get: () => this.#tx,
      set: (value: number) => {
        this.setTx(value);
      },
    },
    onChange: {
      value: (change: FileTreeChange) => {
        // const { tx } = change;
        // if (tx) this.#tx = tx;
        this.#onChange(change);
      },
    },
  });

  /** Get the {@link FileTreeInternal} interface. */
  get [INTERNAL](): FileTreeInternal {
    return this.#internal;
  }
  // #endregion
  // #region -- Events

  readonly #onChangeHandlers = new Set<FileTreeChangeHandler>();

  #onChange(change: FileTreeChange) {
    const onChangeHandlers = this.#onChangeHandlers;
    console.log(
      "[FT] ON CHANGE",
      logFileTreeChange(change),
      "listeners:" + onChangeHandlers.size,
      "tx:" + this.#tx,
    );
    callEventHandlers(change, onChangeHandlers);
  }

  onChange(handler: FileTreeChangeHandler) {
    const onChangeHandlers = this.#onChangeHandlers;
    onChangeHandlers.add(handler);
    /** Function to unsubscribe from {@link onChange} events. */
    function unsubscribe() {
      onChangeHandlers.delete(handler);
    }
    return unsubscribe;
  }
  // #endregion
  // #region -- Core

  get cache() {
    return this.#cache;
  }

  protected get nodes() {
    return this.#nodes;
  }

  protected get root() {
    return this.#root;
  }

  get rootPath() {
    return this.#rootPath;
  }

  protected set rootPath(value: string) {
    this.#rootPath = value;
  }
  /** Current transaction number set by the driver. */
  get tx() {
    return this.#tx;
  }

  protected eachNode<T = Node>(
    ofParent: DirectoryNode | null | undefined,
    visitor: NodeVisitor<T>,
    mapNode: NodeMapper<Node, T> = asNode as NodeMapper<Node, T>,
  ): void {
    //
    // The basic algorithm used here is documented at
    // https://www.geeksforgeeks.org/preorder-traversal-of-n-ary-tree-without-recursion/
    // Ours is slightly different since we have many root nodes, we allow the
    // caller to specify an alternative parent to get root nodes (ofParent) and
    // we allow the caller to map the nodes to a different structure before
    // calling visitor...
    //
    const children = this.getChildren(ofParent);
    if (!children) {
      // CONSIDER: Throw an error if a certain option is set.
      // throw new Error(`Expected a directory node (${ofParent.entry.id}).`);
      return;
    } else if (children.length < 1) {
      return;
    }
    const nodes = this.nodes;
    /** Top node index */
    let i = 0;
    /** Overall index */
    let index = -1;
    const parent = ofParent ? mapNode(ofParent) : undefined;
    const nodesMapped = children.map(mapNode);
    for (const child of children) {
      /** The stack for descending into the current root node... */
      const stack = [
        {
          /** The node mapped how the caller wants it. */
          mapped: nodesMapped[i] as T,
          /** The un-mapped node. */
          node: child,
          /** Depth of the tree starting from the parent. */
          depth: 0,
          /** Order within the siblings. */
          order: i,
          /** The parent node (mapped), if any. */
          parent,
          /** Siblings of this node. */
          siblings: nodesMapped,
        },
      ];
      /** The value returned by calling the last visitor. */
      let returned: NodeVisitResult;
      while (stack.length > 0) {
        // We MUST pop last item off stack here. If we shift first item off,
        // we would reach a node's siblings before it's childrens.
        const { mapped, node, depth, order, parent, siblings } = stack.pop()!;
        index += 1;
        returned = visitor(mapped, { depth, index, order, parent, siblings });
        if (returned === true) {
          // Stop reading nodes.
          return;
        } else if (returned === false) {
          // Don't read this node's children.
          continue;
        }
        /** Current node after visitor might have altered children... */
        const visitedNode = nodes.get(node.entry.id);
        // Add children to stack in REVERSE since they're popped off the stack.
        if (
          visitedNode &&
          isDirectoryNode(visitedNode) &&
          visitedNode.children.length > 0
        ) {
          const children = this.getChildren(visitedNode);
          const childDepth = depth + 1;
          const childrenMapped = children.map(mapNode);
          stack.push(
            ...children
              .map((it, j) => ({
                mapped: childrenMapped[j] as T,
                node: it,
                depth: childDepth,
                order: j,
                parent: mapped,
                siblings: childrenMapped,
              }))
              .reverse(),
          );
        }
      }
      i += 1;
    }
  }

  protected getChildByName(
    name: string,
    inNode: DirectoryNode | null | undefined,
  ): Node | undefined {
    const children = inNode ? inNode.children : this.root.children;
    console.log(
      "[FT] GET CHILD BY NAME",
      name,
      children,
      children?.map((id) => this.nodes.get(id)?.entry.name),
    );
    if (children) {
      const { nodes } = this;
      for (const id of children) {
        const node = nodes.get(id)!;
        if (name === node.entry.name) {
          return node;
        }
      }
    }
    return undefined;
  }

  protected getChildren<T = Node>(
    node: DirectoryNode | null | undefined,
    mapNode: NodeMapper<Node, T> = asNode as NodeMapper<Node, T>,
  ): T[] {
    const children = node ? node.children : this.root.children;
    return children.map((id) => mapNode(this.nodes.get(id)!));
  }

  protected getDirectory(
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

  protected getNode(entry: EntryOrId): Node | undefined {
    return this.nodes.get(typeof entry === "string" ? entry : entry.id);
  }

  protected getNodeByPath(path: string): Node | undefined {
    const parts = path.split("/");
    const { length } = parts;
    if (length < 1) {
      return undefined;
    }
    let node = this.getChildByName(parts[0]!, null);
    for (let i = 1; i < length; i++) {
      if (!node || !isDirectoryNode(node)) {
        node = undefined;
        break;
      }
      node = this.getChildByName(parts[i]!, node);
    }
    return node;
  }

  protected getNodeDepth(node: Node): number {
    const nodes = this.nodes;
    let { pId } = node.entry;
    if (!pId) {
      return 0;
    }
    let depth = 1;
    while (pId) {
      pId = nodes.get(pId)?.entry.pId;
      depth += 1;
    }
    return depth;
  }

  protected getNodePath(node: Node, cache?: PathMap): string {
    if (cache) {
      const cached = cache.get(node.entry.id);
      if (cached) {
        return cached;
      }
    }
    const { name, pId: parentId } = node.entry;
    if (!parentId) {
      if (cache) cache.set(node.entry.id, name);
      return name;
    }
    const nodes = this.nodes;
    const parts: string[] = [name];
    let pId: string | undefined = parentId;
    if (cache) {
      while (pId) {
        const parent: Entry | undefined = nodes.get(pId)?.entry;
        if (parent) {
          const cached = cache.get(parent.id);
          if (cached) {
            parts.unshift(cached);
            // We got the parent's entire path from cache so stop looping.
            break;
          }
          parts.unshift(parent.name);
          pId = parent.pId;
        } else {
          pId = undefined;
        }
      }
    } else {
      while (pId) {
        const parent: Entry | undefined = nodes.get(pId)?.entry;
        if (parent) {
          parts.unshift(parent.name);
          pId = parent.pId;
        } else {
          pId = undefined;
        }
      }
    }
    const path = parts.join("/");
    if (cache) cache.set(node.entry.id, path);
    return path;
  }

  protected setRootNode(value: Readonly<FileTreeRoot>) {
    this.#root = value;
  }

  protected setTx(value: number): number {
    this.#tx = value;
    return value;
  }

  protected toNodeInfo = (node: Node, cache?: PathMap): NodeInfo => {
    const { entry } = node;
    const isDir = isDirectoryNode(node);
    const path = this.getNodePath(node, cache);
    return {
      ...entry,
      isDir,
      path,
      children: isDir ? node.children.length : 0,
    };
  };
  // #endregion
  // #region -- Diagnostics

  /** Prints the directory and file nodes with `console.log`. */
  async printDirectory(opts: { details?: "ids" | "ctime" | "all" } = {}) {
    const formatDetails = {
      all(node: NodeInfo, depth: number, order: number, siblings: NodeInfo[]) {
        return (
          `depth:${depth} ord:${order} sibs:${siblings.length - 1} ` +
          `chldn:${node.children ?? 0} id:${node.id} ctime:${node.ctime}`
        );
      },
      ctime(
        node: NodeInfo,
        _depth: number,
        _order: number,
        _siblings: NodeInfo[],
      ) {
        return `id:${node.id} ctime:${node.ctime}`;
      },
      ids(
        node: NodeInfo,
        _depth: number,
        _order: number,
        _siblings: NodeInfo[],
      ) {
        return `id:${node.id}`;
      },
    };
    const formatDetailsFn = formatDetails[opts.details ?? "ctime"];
    // NOTE: No transaction needed since this is synchronous...
    let count = 0;
    let maxDepth = 0;
    let maxItemsOneParent = 0;
    console.log(`[FT] Nodes in ${this}`);
    console.time("Time to print directory");
    this.forEachFromRoot((node, { depth, index: _idx, order, siblings }) => {
      count += 1;
      maxDepth = Math.max(maxDepth, depth);
      maxItemsOneParent = Math.max(maxItemsOneParent, order + 1);
      const indent = ": ".repeat(depth) + "|";
      console.log(
        (indent + "- " + node.name + (node.isDir ? "/" : "")).padEnd(40) +
          node.path.padEnd(55) +
          formatDetailsFn(node, depth, order, siblings),
      );
    });
    console.log("");
    console.log("            Total nodes:", count);
    console.log("              Max depth:", maxDepth);
    console.log("Max nodes single parent:", maxItemsOneParent);
    console.timeEnd("Time to print directory");
    console.log("");
  }
  // #endregion
  // #region -- Get nodes

  getNodeInfo(id: string): NodeInfo | undefined {
    const node = this.getNode(id);
    if (!node) {
      return undefined;
    }
    return this.toNodeInfo(node);
  }

  getAllEntries<T = Entry>(
    ofParent?: EntryOrId | null | undefined,
    mapNode: NodeMapper<Entry, T> = asEntry as NodeMapper<Entry, T>,
  ): T[] {
    // CONSIDER: It would be nice to pre-size this array but we have no count!
    //           We could have a count if we remove the `ofParent` option. But,
    //           then Transaction would need to implement ChangeMap.size.
    const nodes: T[] = [];
    this.forEachEntry(
      ofParent,
      (node /* , i, siblings */) => {
        nodes.push(node);
      },
      mapNode,
    );
    return nodes;
  }

  getEntry(id: string): Entry | undefined {
    return this.getNode(id)?.entry;
  }
  // #endregion
  // #region -- Get nodes detail

  children(ofParent?: EntryOrId | null): Entry[] | undefined {
    const parent = this.getDirectory(ofParent);
    return this.getChildren(parent, function childEntry(child) {
      return child.entry;
    });
  }
  /** Returns every descendant entry of the given parent. */
  descendants(ofParent?: EntryOrId | null): Entry[] {
    const entries: Entry[] = [];
    const parent = this.getDirectory(ofParent);
    this.eachNode(parent, function getDescendant(child) {
      entries.push(child.entry);
    });
    return entries;
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }
  /**
   * Returns the id used to refer to the given path. The path be relative to
   * the repo root, e.g. `"my/folder/file.json"` or `"my/folder"`. Returns
   * `undefined` if path not found.
   */
  id(path: string): string | undefined {
    path = path.trim();
    if (path.endsWith("/")) path = path.substring(0, path.length - 1);
    const node = this.getNodeByPath(path);
    return node ? node.entry.id : undefined;
  }
  /** Returns the data for a given node entry. */
  data<T = unknown>(entry: EntryOrId): Readonly<T> | undefined {
    const node = this.getNode(entry) as FileNode<T>;
    return node?.data;
  }
  /** Returns the depth of the given node entry in the tree. */
  depth(entry: EntryOrId): number {
    const node = this.getNode(entry);
    if (!node) {
      return -1;
    }
    return this.getNodeDepth(node);
  }
  /** Gets the full path to the given `entry` or the root path if no `entry`. */
  fullPath(entry?: EntryOrId | null) {
    if (!entry) return this.rootPath;
    if (typeof entry === "string") {
      const node = this.getEntry(entry);
      if (!node) return this.rootPath;
      const nodePath = this.path(node) ?? "";
      return concatPath(this.rootPath, nodePath);
    } else {
      const nodePath = this.path(entry) ?? "";
      return concatPath(this.rootPath, nodePath);
    }
  }
  /**
   * Returns the path for the given node id and `undefined` if id not found.
   */
  path(entry: EntryOrId): string | undefined {
    const node = this.getNode(entry);
    if (!node) {
      return undefined;
    }
    return this.getNodePath(node);
  }
  // #endregion
  // #region -- Helpers

  protected fileEntry(param: EntryOrPath): { path: string; node: FileNode } {
    const { path, node } = this.entry(param);
    if (!isFileNode(node)) {
      throw new Error(`Expected file node at "${path}".`);
    }
    return {
      path,
      node,
    };
  }
  /** Entry parameter helper. */
  protected entry(param: EntryOrPath) {
    let path: string;
    let node: Node | undefined;
    if (typeof param === "string") {
      path = param;
      node = this.getNodeByPath(path);
      if (!node) {
        throw new NodeNotFoundError(path);
      }
    } else {
      node = this.getNode(param);
      if (!node) {
        throw new NodeNotFoundError(param);
      }
      path = this.getNodePath(node);
    }
    return {
      path,
      node,
    };
  }
  /** Destination parameter helper. */
  protected dest(param: EntryOrPath | null) {
    let path: string | null = null;
    let node: Node | undefined;
    if (typeof param === "string") {
      path = param;
      node = this.getNodeByPath(path);
      // NOTE: DO NOT throw since destination paths can be created on demand.
      // CONSIDER: Could use FileTree.maxPathMatch here, but no need atm.
    } else if (param) {
      node = this.getNode(param);
      // NOTE: We DO throw here since we were given a node entry id.
      if (!node) {
        throw new NodeNotFoundError(param);
      }
      path = this.getNodePath(node);
    }
    return {
      path,
      node,
    };
  }
  // #endregion
  // #region -- Iteration
  /**
   * Traverses the tree in depth-first order calling the given callback passing
   * the {@link NodeInfo} for each node.
   * @param ofParent The parent id or `null` for root nodes.
   * @param visitor The visitor callback to call for each node.
   * @param mapNode An optional function to transform nodes for {@link visitor}.
   * @example
   * tree.eachNode(null, (node, { depth, order }, _siblings) => {
   *   console.log(tree.getNodePath(node), `item #${order} @ level ${depth}`);
   * });
   */
  forEach<T = NodeInfo>(
    ofParent: EntryOrId | null | undefined,
    visitor: NodeVisitor<T>,
    mapNode: NodeMapper<NodeInfo, T> = asNodeInfo as NodeMapper<NodeInfo, T>,
  ): void {
    const parent = this.getDirectory(ofParent);
    // CONSIDER: Not sure if we really need to cache paths here...
    const cache: PathMap = new Map<string, string>();
    const toNodeInfo = this.toNodeInfo;
    this.eachNode(parent, visitor, function mapToNodeInfo(node) {
      return mapNode(toNodeInfo(node, cache));
    });
  }
  /**
   * Traverses the tree in depth-first order calling the given callback passing
   * the {@link Entry} entry of each node.
   * @param ofParent The parent id or `null` for root nodes.
   * @param visitor The visitor callback to call for each node.
   * @param mapNode An optional function to transform nodes for {@link visitor}.
   * @example
   * tree.eachNode(null, (node, { depth, order }, _siblings) => {
   *   console.log(tree.getNodePath(node), `item #${order} @ level ${depth}`);
   * });
   */
  forEachEntry<T = Entry>(
    ofParent: EntryOrId | null | undefined,
    visitor: NodeVisitor<T>,
    mapNode: NodeMapper<Entry, T> = asEntry as NodeMapper<Entry, T>,
  ): void {
    const parent = this.getDirectory(ofParent);
    this.eachNode(parent, visitor, function mapEntry(node) {
      return mapNode(node.entry);
    });
  }
  /**
   * Alias of `.forEachEntry(null, (node) => { ... })`;
   */
  forEachEntryFromRoot<T = Entry>(
    visitor: NodeVisitor<T>,
    mapNode?: NodeMapper<Entry, T>,
  ): void {
    return this.forEachEntry<T>(null, visitor, mapNode);
  }
  /**
   * Alias of `.forEach(null, (node) => { ... })`;
   */
  forEachFromRoot<T = NodeInfo>(
    visitor: NodeVisitor<T>,
    mapNode?: NodeMapper<NodeInfo, T>,
  ): void {
    return this.forEach<T>(null, visitor, mapNode);
  }
  /**
   * Returns an iterator for all node {@link Entry} entries in the order
   * that they were inserted.
   */
  *[Symbol.iterator](): IterableIterator<Entry> {
    const nodes = this.nodes.values();
    for (const node of nodes) {
      yield node.entry;
    }
  }
  // #endregion
  // #region -- Basic Queries

  childByName(name: string, inParent?: EntryOrId | null): Entry | undefined {
    const parent = this.getDirectory(inParent);
    return this.getChildByName(name, parent)?.entry;
  }

  childExists(name: string, inParent?: string) {
    const { nodes } = this;
    const parent = this.getDirectory(inParent);
    const children = parent ? parent.children : this.root.children;
    if (children) {
      for (const id of children) {
        if (name === nodes.get(id)?.entry?.name) {
          return true;
        }
      }
    }
    return false;
  }

  findPath(path: string): NodeInfo | undefined {
    const node = this.getNodeByPath(path);
    return !node ? undefined : this.toNodeInfo(node);
  }

  findPathEntry(path: string): Entry | undefined {
    const node = this.getNodeByPath(path);
    return node?.entry;
  }

  maxPathMatch(path: string[], inParent?: string) {
    const { length } = path;
    const last = length - 1;
    let depth = -1;
    let node = inParent ? this.getNode(inParent) : undefined;
    console.log("[FT] MATCH?", path, node);
    for (let i = 0; i < length; i++) {
      let child: Node | undefined;
      if (!node || isDirectoryNode(node)) {
        child = this.getChildByName(path[i]!, node);
      }
      if (!child) {
        break;
      }
      depth += 1;
      node = child;
    }
    return {
      /** If the full path exists. */
      exists: length > 0 && depth === last,
      /** The maximum existing entry. */
      entry: node?.entry,
      /** The maximum existing path segment, `-1` if none. */
      index: depth,
      /** The length of the path segments. */
      length,
    };
  }

  nameExists(name: string, inNodeIds?: string[] | ReadonlyArray<string>) {
    const { nodes } = this;
    const children = inNodeIds ?? this.root.children;
    if (children) {
      for (const id of children) {
        if (name === nodes.get(id)?.entry?.name) {
          return true;
        }
      }
    }
    return false;
  }
  // #endregion
}

type EventHandler<T> = (event: T) => any;
type ErrorHandler = (error: any) => any;

function callEventHandler<T>(
  event: T,
  handler: EventHandler<T>,
  onHandlerError?: ErrorHandler,
) {
  try {
    handler(event);
  } catch (ex: any) {
    if (onHandlerError) onHandlerError(ex);
    else console.error("" + ex + ex?.stack ? "\n" + ex?.stack : "");
  }
}

function callEventHandlers<T, H extends EventHandler<T>>(
  event: T,
  handlers: Iterable<H>,
  onHandlerError?: ErrorHandler,
) {
  for (const handler of handlers) {
    callEventHandler(event, handler, onHandlerError);
  }
}

function concatPath(a: string, b: string) {
  if (a.endsWith("/")) {
    return a + b;
  }
  return a + "/" + b;
}
