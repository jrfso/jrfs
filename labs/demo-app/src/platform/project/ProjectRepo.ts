import { ProjectFileTypes } from "demo-shared/platform/project";
import { customAlphabet } from "nanoid";
// Local
import { createWebClient, Repository } from "@jrfs/web";
import { TypeboxFileTypes } from "@jrfs/typebox";

const client = createWebClient<ProjectFileTypes>({
  ws: "ws://localhost:40141/sockets/v1/project/repo/fs",
});

const createShortId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 9);

export { ProjectFileTypes };

export class ProjectRepo extends Repository<ProjectFileTypes, "web"> {
  constructor() {
    super({
      createShortId,
      driver: "web",
      web: { client },
      fileTypes: new TypeboxFileTypes(),
    });
    (this as any)[Symbol.toStringTag] = `ProjectRepo("/project/repo/")`;
    this.fileTypes.set(ProjectFileTypes);
  }
}
