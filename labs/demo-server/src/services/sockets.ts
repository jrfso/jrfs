// import { rm } from "node:fs/promises";
import type { Duplex } from "node:stream";
import type { IncomingMessage } from "node:http";
import fp from "fastify-plugin";
import { WebSocket, WebSocketServer } from "ws";
// Local
import type { WebApi } from "./webServer";

export interface SocketController {
  /** Name of the controller for logs. */
  name: string;
  dispose?: () => void;
  /** Heartbeat time in milliseconds. */
  heartbeat?: number;
  /** Heartbeat interval timer (used internally by sockets service). */
  heartbeatTimer?: NodeJS.Timeout;
  /** e.g. `/\/sockets\/v1\/whatever\//` */
  path: string | RegExp;
  preDispose?: () => void;
  wss: WebSocketServer;
}

const controllers = new Set<SocketController>();

export const sockets = {
  register(ctrl: SocketController) {
    controllers.add(ctrl);
    initController(ctrl);
  },
};

const plugin = fp(function socketsPlugin(api: WebApi, opts, done) {
  console.log("SOCKETS INIT");

  function upgradeWSS(rawReq: IncomingMessage, socket: Duplex, head: Buffer) {
    console.log("SOCKET UP", { host: rawReq.headers.host, url: rawReq.url });
    const { heartbeatTimer, wss } = getController(rawReq);
    if (!wss) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(rawReq, socket, head, (sock) => {
      api.log.info("SOCKET UPGRADE");
      wss.emit("connection", sock, rawReq);
      if (heartbeatTimer) {
        sock.on("pong", pong);
      }
      sock.on("error", (error) => {
        api.log.error("SOCKET ERROR " + error);
      });
    });
  }
  api.server.on("upgrade", upgradeWSS);

  api.addHook("preClose", (done) => {
    api.log.info("SOCKETS PRECLOSE");
    // Pre-Dispose
    for (const ctrl of controllers) {
      const { heartbeatTimer, preDispose, wss } = ctrl;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        ctrl.heartbeatTimer = undefined;
      }
      if (preDispose) {
        preDispose();
      } else {
        defaultWssPreDispose(wss);
      }
    }
    // Hangup
    api.server.removeListener("upgrade", upgradeWSS);
    // Dispose
    for (const ctrl of controllers) {
      const { dispose, wss } = ctrl;
      if (!dispose) {
        wss.close();
      } else {
        dispose();
      }
    }
    // [/SOCKETS PRECLOSE]
    done();
  });
  // [/SOCKETS INIT]
  done();
});
export default plugin;

function defaultWssPreDispose(wss: WebSocketServer) {
  if (wss.clients) {
    for (const client of wss.clients) {
      client.close();
    }
  }
}

function getController(rawReq: IncomingMessage) {
  const {
    // headers: { host },
    url,
  } = rawReq;
  if (url) {
    console.log("SOCKETS FIND", url); // e.g. "/sockets/v1/t/fs?test=1"
    for (const ctrl of controllers) {
      if (url === ctrl.path || url.match(ctrl.path)) {
        return ctrl;
      }
    }
  }
  return {} as Partial<SocketController>;
}

function initController(ctrl: SocketController) {
  const { heartbeat, heartbeatTimer, wss } = ctrl;
  if (!heartbeat || heartbeatTimer) {
    return;
  }
  ctrl.heartbeatTimer = setInterval(function ping() {
    for (const client of wss.clients) {
      if ((client as any).isAlive === false) {
        console.log(`TERMINATING unresponsive ${ctrl.name} client.`);
        client.terminate();
      } else {
        (client as any).isAlive = false;
        client.ping();
      }
    }
  }, heartbeat);
}

function pong(this: WebSocket, ...args: any[]) {
  (this as any).isAlive = true;
}
