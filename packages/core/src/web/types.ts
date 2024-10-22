import type { FileTreeChange, MutativePatches } from "@/index";

// -- Notifications

/** Event types that can be notified. */
export type Notifying = keyof NotificationParams;

export interface NotificationParams {
  change: ChangeNotification;
  close: undefined;
  open: OpenNotification;
}

// -- Requests + Responses

/** Type of request. */
export type Requesting = keyof RequestParams;

export interface RequestParams {
  /** Add */
  add: { to: string; data?: unknown };
  /** Copy */
  copy: { from: string; to: string };
  /** Get Json Data */
  get: { from: string };
  /** Move */
  move: { from: string; to: string };
  /** Remove */
  remove: { from: string };
  /** Write */
  write:
    | {
        to: string;
        data: unknown;
        patch?: never;
      }
    | {
        to: string;
        data?: never;
        patch: {
          ctime: number;
          patches: MutativePatches;
          undo?: MutativePatches;
        };
      };
}

export interface ResponseValues {
  add: TransactionResult;
  copy: TransactionResult;
  get: DataResult;
  move: TransactionResult;
  remove: TransactionResult;
  write: TransactionResult;
}

// #region -- Message Bodies

/** A serialized {@link FileTreeChange} */
export interface ChangeNotification {
  /** The entry id which was the target of the change. */
  id: FileTreeChange["id"];
  /** The transaction type. */
  op: FileTreeChange["op"];
  /** The transaction number that caused the change. */
  tx: FileTreeChange["tx"];

  /** Added */
  a?: FileTreeChange["added"];
  /** Changed */
  c?: FileTreeChange["changed"];
  /** Removed */
  r?: FileTreeChange["removed"];

  /** Write patch. */
  p?: {
    /** ctime */
    c: number;
    /** patches */
    p: MutativePatches;
  };
}

export interface DataResult {
  /** Entry id. */
  id: string;
  /** Complete data. */
  data?: unknown;
}

export interface OpenNotification {
  /** Add entries. */
  a: NonNullable<FileTreeChange["added"]>;
  /** Resource id, a unique id for the file tree resource in an application. */
  rid: string;
  /** Initial transaction number, set when Init is complete. */
  tx: number;
}

export interface TransactionResult {
  /** Id of the entry affected by the completed transaction. */
  id: string;
}
// #endregion
// #region -- Core

/** Any message type sent from `[Server]->[Client]`. */
export type ServerMessage = AnyResponse | AnyNotification;

// #region -- Notifications

export type AnyNotification = Notifications[Notifying];

/** Base notification message from `[Server]->[Client]`. */
export interface Notice<T extends Notifying = Notifying, O = unknown> {
  /** Type of event *to notice*. */
  to: T;
  /** The event *of note*. */
  of: O;
}

export type Notifications = {
  [K in Notifying]: Notice<K, NotificationParams[K]>;
};
// #endregion
// #region -- Methods `[Request] + [Response]`

export type AnyRequest = MethodInfo[Requesting]["request"];
export type AnyResponse = MethodInfo[Requesting]["response"];

/** Base request message from `[Client]->[Server]`. */
export interface BaseRequest<T extends Requesting = Requesting, O = unknown> {
  /** Unique request number to respond with. */
  rx: number;
  /** Method name or other resource *to request*. */
  to: T;
  /** Method params or other content *of the request*. */
  of: O;
}
/** Response message from `[Server]->[Client]`. */
export interface BaseResponse<T extends Responding = Responding, O = unknown> {
  /** Unique request number from the matching request. */
  rx: number;
  /** The base archetype *to respond* with (e.g. success/fail/error). */
  to: T;
  /** Contents *of the response*. */
  of: O;
}

export type ErrorResponse = BaseResponse<"error", string>;

export type MethodInfo = {
  [K in Requesting]: {
    request: BaseRequest<K, RequestParams[K]>;
    response: BaseResponse<"ok", ResponseValues[K]> | ErrorResponse;
  };
};

/** Response archetype. */
export type Responding = "ok" | "error";

// #endregion
// #endregion
