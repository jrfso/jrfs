import { ProjectFileTypes } from "demo-shared/platform/project";
import { createShortId } from "demo-shared/jrfs";
// Local
import { createWebClient, Repository } from "@jrfs/web";
import { TypeboxFileTypes } from "@jrfs/typebox";
import { createFileCache } from "@jrfs/idb";

const client = createWebClient<ProjectFileTypes>({
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
      fileTypes: new TypeboxFileTypes().set(ProjectFileTypes),
    });
    (this as any)[Symbol.toStringTag] = `ProjectRepo("/project/repo/")`;
  }
}
