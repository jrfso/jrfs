import type {
  CommandName,
  CommandParams,
  CommandResult,
  FileTreeChange,
  MutativePatches,
} from "@/types";

// -- Notifications

/** Notification type names. */
export type Notifying = keyof NotificationParams;

/** Notification parameter type declarations. */
export interface NotificationParams {
  change: ChangeNotification;
  close: undefined;
  open: OpenNotification;
}

// -- Message Bodies

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

/** Initial client notification. */
export interface OpenNotification {
  /** Add entries. */
  a: NonNullable<FileTreeChange["added"]>;
  /** Resource id, a unique id for the file tree resource in an application. */
  rid: string;
  /** Initial transaction number, set when Init is complete. */
  tx: number;
}

// -- Core

/** Any message type sent from `[Server]->[Client]`. */
export type ServerMessage = AnyResponse | AnyNotification;

// POSSIBLE: A type called AnyEvent, sent from client to server. e.g.
// export type AnyEvent = EventParams[EventName]["message"]

/** Any message type sent from `[Client]->[Server]` */
export type ClientMessage = AnyRequest; // | AnyEvent;

export type AnyRequest = MethodInfo[CommandName]["request"];
export type AnyResponse = MethodInfo[CommandName]["response"];

// #region -- Notifications

export type AnyNotification = Notifications[Notifying];

/** Base notification message from `[Server]->[Client]`. */
export interface Notice<T extends Notifying = Notifying, O = unknown> {
  /** Notification type name to notify the client of. */
  to: T;
  /** Parameters of the notification. */
  of: O;
}
/** Notification type names mapped to message type. */
export type Notifications = {
  [K in Notifying]: Notice<K, NotificationParams[K]>;
};
// #endregion
// #region -- Methods (derived from `Commands`)

/** Command names mapped to request and response types. */
export type MethodInfo = {
  [K in CommandName]: {
    request: BaseRequest<K, CommandParams<K>>;
    response: BaseResponse<"ok", CommandResult<K>> | ErrorResponse;
  };
};
/** Base request message from `[Client]->[Server]`. */
export interface BaseRequest<T extends CommandName = CommandName, O = unknown> {
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
  /** The archetype to respond with (e.g. success/fail/error). */
  to: T;
  /** Contents of the response. */
  of: O;
}
/** Common error response type. */
export type ErrorResponse = BaseResponse<"error", string>;
/** Response archetype *e.g. fail|succeed|etc*. */
export type Responding = "ok" | "error";

// #endregion
