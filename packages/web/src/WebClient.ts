import {
  type FileTypes,
  type TransactionParams,
  type WritableFileTree,
  // logFileTreeChange,
} from "@jrfs/core";
import type {
  AnyRequest,
  AnyResponse,
  BaseRequest,
  DataResult,
  MethodInfo,
  Requesting,
  ServerMessage,
  TransactionResult,
} from "@jrfs/core/web/types";

const REQUEST_TIMEOUT_MS = 30000;

/** `[resolve, reject]` */
type PromiseCallbacks = [(result?: any) => void, (reason?: any) => void];
/** `[resolved, rejected]` */
type PromiseResults = [any, any];

export interface WebClient<FT extends FileTypes<FT> = any> {
  open(fileTree: WritableFileTree): Promise<void>;
  close(): Promise<void>;

  add(params: WebClientParams["add"]): Promise<TransactionResult>;
  get(params: WebClientParams["get"]): Promise<DataResult>;
  copy(params: WebClientParams["copy"]): Promise<TransactionResult>;
  move(params: WebClientParams["move"]): Promise<TransactionResult>;
  remove(params: WebClientParams["remove"]): Promise<TransactionResult>;
  write(params: WebClientParams["write"]): Promise<TransactionResult>;
}

export interface WebClientError extends Error {
  code?: string;
  statusCode?: number;
}

export interface WebClientParams extends TransactionParams {
  // Reserved for WebClient methods that aren't in TransactionParams...
}

function connect(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    if (ws.readyState === ws.OPEN) {
      resolve();
      return;
    }
    ws.addEventListener("error", onError);
    ws.addEventListener("open", onOpen);

    function cleanup() {
      ws.removeEventListener("error", onError);
      ws.removeEventListener("open", onOpen);
    }
    function onError() {
      cleanup();
      reject();
    }
    function onOpen() {
      cleanup();
      resolve();
    }
  });
}

export function createWebClient<FT extends FileTypes<FT> = any>(opt: {
  logging?: boolean;
  /** WebSocket URL e.g. `ws://localhost:40141/sockets/v1/t/repo/fs` */
  ws: string;
}): WebClient<FT> {
  let closeCalled = false;
  let ws: WebSocket | undefined;
  let tree = null! as WritableFileTree;
  let waitingForOpen: PromiseCallbacks | undefined;
  let requestNumber = 0;
  const requests = new Map<number, PromiseCallbacks>();
  const responded = new Map<number, PromiseResults>();

  async function onMessage(this: WebSocket, e: MessageEvent<string>) {
    const { data } = e;
    const msg = JSON.parse(data) as ServerMessage;
    // Response?
    if (isResponse(msg)) {
      const { rx, to: type } = msg;
      console.log("[WS] RX END", rx);
      const waiting = requests.get(rx);
      if (type === "ok") {
        if (waiting) waiting[0](msg.of);
        else responded.set(rx, [msg.of, undefined]);
      } else {
        if (waiting) waiting[1](msg.of);
        else responded.set(rx, [undefined, msg.of]);
      }
      return;
    }
    // Notice (event)
    if (msg.to === "change") {
      const { id, op, tx, a: added, c: changed, r: removed, p: patch } = msg.of;
      console.log("[WS] onChange", id);
      tree.sync({
        id,
        op,
        tx,
        added,
        changed,
        removed,
        patch: patch ? { ctime: patch.c, patches: patch.p } : undefined,
      });
      printAfterChange();
    } else if (msg.to === "open") {
      const open = msg.of;
      console.log("[WS] OPENING...");
      tree.open({ entries: open.a, rid: open.rid, tx: open.tx });
      if (waitingForOpen) {
        console.log("[WS] OPEN");
        const resolveOpen = waitingForOpen[0];
        waitingForOpen = undefined;
        resolveOpen();
        printAfterChange();
      }
    } else if (msg.to === "close") {
      console.log("[WS] CLOSE");
      this.close();
    }
  }

  function printAfterChange() {
    if (opt.logging === false) return;
    if (delayed_printAfterChange) clearTimeout(delayed_printAfterChange);
    delayed_printAfterChange = window.setTimeout(async () => {
      await tree.printDirectory();
    }, 1000);
  }
  let delayed_printAfterChange: number | undefined;

  function reconnect() {
    console.log("// TODO: Attempt to reconnect without reloading fileTree...");
  }

  function rx() {
    return (requestNumber += 1);
  }

  function sendAndReceive(req: AnyRequest) {
    const payload = JSON.stringify(req);
    ws!.send(payload);
    return waitForResponse(req.rx);
  }
  /** Waits for the last "open" message. */
  function waitForOpen(): Promise<void> {
    // CONSIDER: If we don't guard calls to this function, do it here by
    // storing the promise itself as well and returning that after creation...
    return new Promise<void>((resolve, reject) => {
      waitingForOpen = [resolve, reject];
    });
  }

  function waitForResponse(rx: number): Promise<any> {
    const result = responded.get(rx);
    if (result) {
      responded.delete(rx);
      if (result[1]) return Promise.reject(result[1]);
      else return Promise.resolve(result[0]);
    }
    return new Promise<any>((resolve, reject) => {
      requests.set(rx, [
        (result?: any) => {
          clearTimeout(timeout);
          requests.delete(rx);
          resolve(result);
        },
        (reason?: any) => {
          clearTimeout(timeout);
          requests.delete(rx);
          reject(reason);
        },
      ]);
      const timeout = window.setTimeout(function onTimeout() {
        requests.delete(rx);
        console.error(`Timeout waiting for rx ${rx}.`);
        reject(`Timeout waiting for rx ${rx}.`);
      }, REQUEST_TIMEOUT_MS);
    });
  }

  const client: WebClient<FT> = {
    async open(fileTree) {
      if (tree) return;
      tree = fileTree;
      ws = new WebSocket(opt.ws);
      ws.addEventListener("message", onMessage);
      await connect(ws);
      ws.addEventListener("close", (e) => {
        console.log("[WS] close", {
          code: e.code,
          reason: e.reason,
          wasClean: e.wasClean,
        });
        if (!closeCalled) {
          setTimeout(reconnect, 3000);
        }
      });
      ws.addEventListener("error", function onErr(e) {
        console.log("[WS] error", { closed: this.CLOSED === this.readyState });
      });
      await waitForOpen();
      console.log("[WS] STARTED");
    },
    async close() {
      closeCalled = true;
      if (ws) {
        ws.close();
        ws = undefined;
      }
      tree = null!;
    },

    async add(body) {
      return sendAndReceive(
        requestTo("add", rx(), { to: body.to, data: body.data }),
      );
    },
    async copy(body) {
      return sendAndReceive(
        requestTo("copy", rx(), { from: body.from, to: body.to }),
      );
    },
    async get(body) {
      return sendAndReceive(requestTo("get", rx(), { from: body.from }));
    },
    async move(body) {
      return sendAndReceive(
        requestTo("move", rx(), { from: body.from, to: body.to }),
      );
    },
    async remove(body) {
      return sendAndReceive(requestTo("remove", rx(), { from: body.from }));
    },
    async write(body) {
      let req: ReturnType<typeof requestTo<"write">>;
      const { to, patch } = body;
      if (patch) {
        req = requestTo("write", rx(), { to, patch });
      } else {
        req = requestTo("write", rx(), { to, data: body.data });
      }
      return sendAndReceive(req);
    },
  };
  return client;
}

export function isResponse(msg: ServerMessage): msg is AnyResponse {
  return "rx" in msg;
}
export function requestTo<
  T extends Requesting,
  O extends MethodInfo[T]["request"]["of"] = MethodInfo[T]["request"]["of"],
>(method: T, rx: number, params: O): BaseRequest<T, O> {
  return {
    rx,
    to: method,
    of: params,
  };
}
