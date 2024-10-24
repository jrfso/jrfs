import { ProjectFileTypes } from "demo-shared/platform/project";
import { createShortId } from "demo-shared/jrfs/nanoid";
import "demo-shared/jrfs/git";
// Local
import { createWebClient, Repository } from "@jrfs/web";
import { TypeboxFileTypes } from "@jrfs/typebox";
import { createFileCache } from "@jrfs/idb";

const client = createWebClient({
  ws: "ws://localhost:40141/sockets/v1/project/repo/fs",
});

export { ProjectFileTypes };

export class ProjectRepo extends Repository<ProjectFileTypes> {
  constructor() {
    super({
      createShortId,
      driver: "web",
      web: {
        client,
        fileCache: createFileCache(),
      },
      fileTypes: new TypeboxFileTypes<ProjectFileTypes>().set(ProjectFileTypes),
      plugins: {
        git: true,
      },
    });
    (this as any)[Symbol.toStringTag] = `ProjectRepo("/project/repo/")`;
  }
}
