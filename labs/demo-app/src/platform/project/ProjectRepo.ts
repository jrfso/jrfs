import { ProjectFileTypes } from "demo-shared/platform/project";
// Local
import { Repository } from "jrfs/core";
import { createWebClient } from "jrfs/web";
import { TypeboxFileTypes } from "jrfs/typebox";

const client = createWebClient<ProjectFileTypes>({
  ws: "ws://localhost:40141/sockets/v1/project/repo/fs",
});

export { ProjectFileTypes };

export class ProjectRepo extends Repository<ProjectFileTypes, "web"> {
  constructor() {
    super({
      driver: "web",
      web: { client },
      fileTypes: new TypeboxFileTypes(),
    });
    (this as any)[Symbol.toStringTag] = `ProjectRepo("/project/repo/")`;
    this.fileTypes.set(ProjectFileTypes);
  }
}
