import type { Persister, Persists } from "tinybase/persisters";
import {
  createWsServer,
  WsServer as TinyWsServer,
} from "tinybase/synchronizers/synchronizer-ws-server";
import { WebSocketServer } from "ws";
// Local
import { sockets } from "./sockets";

/** NOTE: WITHOUT leading slash! @see registerSockets */
const BASE_PATH = "sockets/v1/t/";
const BASE_PATH_LENGTH = BASE_PATH.length;

/** Persister type accepted by {@link tinyServer}. */
export type TinyPersister = Persister<
  Persists.MergeableStoreOnly | Persists.StoreOrMergeableStore
>;

const persisterByPathId = new Map<string, TinyPersister>();
let server: TinyWsServer | undefined;

export const tinyServer = {
  /**
   * @param pathId e.g. `"fs"` for `ws://localhost:40141/sockets/v1/t/fs`
   * @param persister e.g. `createFilePersister()` or `createMemoryPersister()`
   * @example
   * // See dev/tmp/jrfs-tinybase2/ and dev-server/tmp/jrfs-tinybase/
   * const { store: repoStore } = createFsStore();
   * store = repoStore;
   * storeServer = createTinyFsServer(store, repo);
   * await storeServer.start();
   * tinyServer.addStore("repo/fs", storeServer.persister);
   */
  addStore(pathId: string, persister: TinyPersister) {
    if (!server) {
      registerSockets();
    }
    persisterByPathId.set(pathId, persister);
  },
  removeStore(pathId: string) {
    persisterByPathId.delete(pathId);
  },
};

function dispose() {
  if (server) {
    server.destroy();
  }
}
/** @param pathId e.g. "sockets/v1/t/fs" (NOTE: No leading slash provided!) */
function getPersisterByPathId(pathId: string) {
  if (!pathId.startsWith(BASE_PATH)) {
    return undefined;
  }
  const findPathId = pathId.substring(BASE_PATH_LENGTH);
  console.log("TINY FIND", findPathId, pathId);
  const persister = persisterByPathId.get(findPathId);
  return persister;
}

function registerSockets() {
  const wss = new WebSocketServer({ noServer: true });
  server = createWsServer(wss, getPersisterByPathId);
  sockets.register({
    name: "tinyServer",
    heartbeat: 12000,
    dispose,
    // NOTE: Adding the required leading slash here!
    path: new RegExp("^" + "/" + BASE_PATH),
    wss,
  });
}
