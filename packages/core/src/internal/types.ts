// Local
import {
  type Entry,
  type EntryOrId,
  type FileDataChange,
  type FileTreeChange,
  type NodeInfo,
  isDirectoryId,
  isFileId,
} from "@/types";

/** Internal `Symbol` to access an internal interface. */
export const INTERNAL = Symbol("__JRFS_INTERNAL__");

export type Children = ReadonlyArray<string>;

/** Type of Map used for `FileTree` nodes. */
export type FileTreeNodes = Map<string, Node>;

export const NoChildren = Object.freeze<string[]>([]);

/** Map of node id to path. */
export type PathMap = Map<string, string>;

export interface BaseNode {
  /** The basic node details. Readonly since it's directly exposed. */
  readonly entry: Entry;
}

export interface DirectoryNode extends BaseNode {
  /** Child node ids. Not exposed directly. */
  readonly children: Children;
}

export interface FileNode<D = unknown> extends BaseNode {
  /** The file data, if any. Readonly since it's directly exposed. */
  readonly data?: Readonly<D>;
  // deltaId?: number;
  // futures?: NodeChange[];
  // history?: NodeChange[];
}

export interface FileTreeInternal {
  readonly nodes: FileTreeNodes;
  rid: string;
  root: Readonly<FileTreeRoot>;
  tx: number;
  onDataChange(change: FileDataChange): void;
  onChange(change: FileTreeChange): void;
}

export interface FileTreeRoot {
  /** Child node ids. Not exposed directly. */
  readonly children: Children;
}

export type Node<D = unknown> = DirectoryNode | FileNode<D>;

export function asEntry(node: Entry): Entry {
  return node;
}

export function asNode(node: Node): Node {
  return node;
}

export function asNodeInfo(node: NodeInfo): NodeInfo {
  return node;
}

export function createRoot(children: Children = NoChildren) {
  return Object.freeze({
    children,
  } as FileTreeRoot);
}

export function hasFileData(
  node: Node,
): node is FileNode & { data: Readonly<unknown> } {
  return (
    isFileId(node.entry.id) && typeof (node as FileNode).data !== "undefined"
  );
}

export function isDirectoryNode(node?: Node): node is DirectoryNode {
  return !!node && isDirectoryId(node.entry.id);
}

export function isFileNode(node: Node): node is FileNode {
  return isFileId(node.entry.id);
}

export function sortChildren(
  children: string[] | readonly string[],
  nodes: FileTreeNodes,
) {
  // function orderByNodeName(idA: string, idB: string) {
  //   const { entry: entryA } = _nodes.get(idA)!;
  //   const { entry: entryB } = _nodes.get(idB)!;
  //   const a = entryA.name;
  //   const b = entryB.name;
  //   return a > b ? 1 : b > a ? -1 : 0;
  // }
  function orderByDirectoryAndNodeName(idA: string, idB: string) {
    const { entry: entryA } = nodes.get(idA)!;
    const { entry: entryB } = nodes.get(idB)!;
    // NOTE: Entry id starts with 'd' (directory) or 'f' (file).
    const a = entryA.id.charAt(0) + entryA.name;
    const b = entryB.id.charAt(0) + entryB.name;
    return a > b ? 1 : b > a ? -1 : 0;
  }
  const newChildren = [...children];
  newChildren.sort(orderByDirectoryAndNodeName);
  return Object.freeze(newChildren);
}

export class NodeNotFoundError extends Error {
  constructor(entry: EntryOrId) {
    const id = typeof entry === "string" ? entry : entry.id;
    super(`Node not found (${id}).`);
  }
}
