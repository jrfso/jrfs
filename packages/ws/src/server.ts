import { WebSocket, WebSocketServer } from "ws";
import {
  type CommandName,
  type FileTree,
  type FileTreeChange,
  type Repository,
  logFileTreeChange,
} from "@jrfs/core";
import type {
  AnyRequest,
  BaseResponse,
  MethodInfo,
  Notice,
  NotificationParams,
  Notifying,
  Responding,
  ServerMessage,
} from "@jrfs/core/web";

interface ClientInfo {
  id: string;
}

export function createWsServer(params: {
  repo: Repository<any>;
  wss?: WebSocketServer;
}) {
  const {
    repo,
    wss = new WebSocketServer({
      noServer: true,
      // The maximum allowed message size **in bytes**. Defaults to 100 MiB.
      // maxPayload: 100 * 1024 * 1024, // 100 MiB (104857600 bytes)
    }),
  } = params;
  const clients = new WeakMap<WebSocket, ClientInfo>();

  function onTreeChange(changes: FileTreeChange) {
    const { id, tx, op, added, changed, removed, patched } = changes;
    console.log(`[WS] onTreeChange`, logFileTreeChange(changes));
    notifyAll("change", {
      id,
      op,
      tx,
      a: added,
      c: changed,
      r: removed,
      p: patched ? { c: patched.ctime, p: patched.patch } : undefined,
    });
  }
  let unsubFromTreeChanges: ReturnType<FileTree["onChange"]> | undefined;

  wss.on("connection", function onClientConnect(socket: WebSocket, request) {
    const id = request.headers["sec-websocket-key"];
    if (!id) return;
    const client: ClientInfo = { id };
    clients.set(socket, client);
    loadClient(socket, repo.files);
    socket.on("close", onClientClose);
    socket.on("message", onClientMsg);
  });

  function notifyAll<
    T extends Parameters<typeof notifyOf>[0],
    O extends Parameters<typeof notifyOf<T>>[1],
  >(type: T, event: O) {
    const message = notifyOf(type, event);
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload, logSendError);
      }
    }
  }

  function onClientClose(this: WebSocket) {
    const client = clients.get(this);
    console.log(`[WS] CLIENT`, client?.id, `CLOSED`);
  }

  function onClientMsg(this: WebSocket, data: Buffer | ArrayBuffer | Buffer[]) {
    const client = clients.get(this);
    if (!client) return;
    console.log(
      "[WS] CLIENT",
      client.id,
      "MSG",
      data.toString("utf8").slice(0, 25) + "...",
    );
    const json = data.toString("utf8");
    const msg = JSON.parse(json) as AnyRequest;

    // Execute action, send { rx, to: "ok", id } response...
    if (!handleRequest(this, repo, msg)) {
      // TODO: Respond with invalid request error.
      // TODO: Better error logging.
      console.error("[WS] Invalid request.");
      send(this, respondTo(msg.to, "error", msg.rx, "Invalid request."));
      return;
    }
  }

  return {
    start() {
      unsubFromTreeChanges = repo.files.onChange(onTreeChange);
    },
    stop() {
      if (unsubFromTreeChanges) {
        unsubFromTreeChanges();
        unsubFromTreeChanges = undefined;
      }
    },
    wss,
  };
}

function handleRequest(
  socket: WebSocket,
  repo: Repository<any>,
  request: AnyRequest,
): boolean {
  const { to: commandName, of: commandParams, rx } = request;

  // TODO: if (!commandName exists) return false;

  repo
    .exec(commandName, commandParams)
    .then((result) => {
      const response = respondTo(commandName, "ok", rx, result);
      send(socket, response);
    })
    .catch((ex) => {
      const response = respondTo(commandName, "error", rx, "" + ex);
      send(socket, response);
    });
  return true;
}

/** Loads initial tree data into the given socket. */
function loadClient(socket: WebSocket, tree: FileTree) {
  // #region // CONSIDER: To split the initial listing-only payload
  // - However, I think there's no reason since we can send 100Mb per message...

  // const initMsgPayloads = arraySlices(
  //   // Get all current tree items in insertion order.
  //   Array.from(tree),
  //   // Get 100 entries at a time.
  //   100,
  // ).map<string>((entries, i, all) =>
  //   // Map to a ChangeNotice payload.
  //   JSON.stringify(
  //     notifyOf("open", {
  //       a: entries,
  //       // End the 'open' notifications by setting tx on the last slice.
  //       tx: i + 1 < all.length ? undefined : tree.tx,
  //     }),
  //   ),
  // );
  // for (const payload of initMsgPayloads) {
  //   socket.send(payload);
  // }

  // #endregion
  const initPayload = JSON.stringify(
    notifyOf("open", {
      a: Array.from(tree),
      rid: tree.rid,
      tx: tree.tx,
    }),
  );
  socket.send(initPayload);
}

function logSendError(error?: Error) {
  if (error) {
    console.error(
      "[WS] send " + error + (error.stack ? "\n" + error.stack : ""),
    );
  }
}

export function notifyOf<T extends Notifying, O = NotificationParams[T]>(
  type: T,
  event: O,
): Notice<T, O> {
  return {
    to: type,
    of: event,
  };
}

export function respondTo<
  T extends CommandName,
  R extends Responding = "ok",
  O = MethodInfo[T]["response"]["of"] | undefined,
>(method: T, type: R, rx: number, content: O): BaseResponse<R, O> {
  return {
    rx,
    to: type,
    of: content,
  };
}

function send(socket: WebSocket, msg: ServerMessage) {
  const payload = JSON.stringify(msg);
  socket.send(payload, logSendError);
}
