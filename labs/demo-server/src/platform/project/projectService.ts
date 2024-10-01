import Path from "node:path";
import { createWsServer } from "@jrfs/ws";
// Local
import { __DEV__ } from "@/config";
import { ProjectRepo } from "@/platform";
import { sockets } from "@/services";

/** NOTE: WITHOUT leading slash! @see registerSockets */
const BASE_PATH = "sockets/v1/project";
// const BASE_PATH_LENGTH = BASE_PATH.length;

let repo: ProjectRepo | null = null;
let server = null! as ReturnType<typeof createWsServer>;

export const projectService = {
  get repo(): ProjectRepo {
    assertOpen();
    return repo!;
  },

  async closeRepo() {
    if (!repo) {
      return;
    }
    await repo.close();
    repo = null;
  },
  /** Opens a file-system repo that is configured for {@link ProjectRepo}. */
  async openRepo(configFilePath: string) {
    if (!configFilePath) {
      throw new Error(`Invalid configFilePath, "${configFilePath}"`);
    }
    const absoluteConfigFilePath = Path.isAbsolute(configFilePath)
      ? configFilePath
      : Path.resolve(configFilePath);

    console.log(`Opening repo:`, absoluteConfigFilePath);
    repo = new ProjectRepo(absoluteConfigFilePath);
    await repo.open();

    registerSockets(repo);

    // setTimeout(async () => {
    //   await repo!.rename("backend/db/main/_.db.json", "my.db.json");
    // }, 12000);

    // setTimeout(async () => {
    //   await repo!.remove("backend/db/main");
    // }, 24000);
  },
} as const;

(projectService as any)[Symbol.toStringTag] = "projectService";

export type projectService = typeof projectService;

function assertOpen() {
  if (!repo) {
    throw new Error(`projectService.openRepo not called!`);
  }
}

function dispose() {
  if (server) {
    server.stop();
  }
}

function registerSockets(repo: projectService["repo"]) {
  server = createWsServer({ repo });
  server.start();
  sockets.register({
    name: "projectRepo",
    heartbeat: 12000,
    dispose,
    // NOTE: Adding the required leading slash here!
    path: new RegExp("^" + "/" + BASE_PATH),
    wss: server.wss,
  });
}
