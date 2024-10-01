import { WebSocket, WebSocketServer } from "ws";
import {
  type Entry,
  type FileTree,
  type FileTreeChange,
  type Repository,
  type TransactionOutParams,
  logFileTreeChange,
} from "@jrfs/core";
import {
  type AnyRequest,
  type Requesting,
  type RequestParams,
  type ServerMessage,
  notifyOf,
  respondTo,
} from "@jrfs/web/types";

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
    const { id, tx, op, added, changed, removed, patch } = changes;
    console.log(`[WS] onTreeChange`, logFileTreeChange(changes));
    notifyAll("change", {
      id,
      op,
      tx,
      a: added,
      c: changed,
      r: removed,
      p: patch ? { c: patch.ctime, p: patch.patches } : undefined,
    });
  }
  let unsubFromTreeChanges: ReturnType<FileTree["onChange"]> | undefined;

  wss.on("connection", function onClientConnect(socket: WebSocket, request) {
    const id = request.headers["sec-websocket-key"];
    if (!id) return;
    const client: ClientInfo = { id };
    clients.set(socket, client);
    loadClient(socket, repo);
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

    // Execute action, send { rx, to: "ok", id, tx } response...
    if (!handleRequest(this, repo, msg)) {
      // TODO: Respond with invalid request error.
      // TODO: Better error logging.
      console.error("[WS] Invalid request.");
      return;
    }
  }

  return {
    start() {
      unsubFromTreeChanges = repo.onChange(onTreeChange);
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

type RequestHandler<P = unknown> = (
  socket: WebSocket,
  repo: Repository<any>,
  rx: number,
  params: P,
) => void;

type RequestHandlers = {
  [K in Requesting]: RequestHandler<RequestParams[K]>;
};

const requestHandlers: RequestHandlers = {
  add(socket, repo, rx, p) {
    transaction("add", socket, rx, (out) =>
      repo.add(p.to, "data" in p ? { data: p.data } : {}, out),
    );
  },
  copy(socket, repo, rx, p) {
    transaction("copy", socket, rx, (out) => repo.copy(p.from, p.to, out));
  },
  get(socket, repo, rx, p) {
    const { from } = p;
    try {
      const entry = repo.findPathEntry(from)!;
      // TODO: Respond with a 404 if (!entry)...
      const data = repo.data(entry);
      // CONSIDER: Should we compare client `ctime` to signal a change here?
      send(socket, respondTo("get", "ok", rx, { id: entry.id, data }));
    } catch (ex) {
      send(socket, respondTo("get", "error", rx, "" + ex));
    }
  },
  move(socket, repo, rx, p) {
    transaction("move", socket, rx, (out) => repo.move(p.from, p.to, out));
  },
  remove(socket, repo, rx, p) {
    transaction("remove", socket, rx, (out) => repo.remove(p.from, out));
  },
  async write(socket, repo, rx, p) {
    transaction("write", socket, rx, async (out) => {
      const { data, patch } = p;
      if (patch) {
        return repo.patch(p.to, patch, out);
      } else if ("data" in p && typeof data !== "undefined") {
        return repo.write(p.to, data!, out);
      } else {
        throw new Error(`[WS] Need data or patch to write to "${p.to}".`);
      }
    });
  },
};

function handleRequest(
  socket: WebSocket,
  repo: Repository<any>,
  request: AnyRequest,
): boolean {
  const handler = requestHandlers[request.to] as RequestHandler;
  if (handler) {
    handler(socket, repo, request.rx, request.of);
    return true;
  }
  return false;
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

function send(socket: WebSocket, msg: ServerMessage) {
  const payload = JSON.stringify(msg);
  socket.send(payload, logSendError);
}

async function transaction(
  op: FileTreeChange["op"],
  socket: WebSocket,
  rx: number,
  run: (out: TransactionOutParams) => Promise<Entry>,
): Promise<void> {
  /** Object passed to get params out from run->repo->driver->writer. */
  const out = { tx: 0 } as TransactionOutParams;
  try {
    const { id } = await run(out);
    // CONSIDER: We could get different response types from run based on out...
    const response = respondTo(op, "ok", rx, { id, tx: out.tx });
    send(socket, response);
  } catch (ex) {
    const response = respondTo(op, "error", rx, "" + ex);
    send(socket, response);
  }
}
