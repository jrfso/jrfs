import { Repository } from "@jrfs/node";
import { TypeboxFileTypes } from "@jrfs/typebox";
import { ProjectFileTypes } from "demo-shared/platform/project";
import { createShortId } from "demo-shared/jrfs/nanoid";
import "demo-shared/jrfs/git";

export class ProjectRepo extends Repository<ProjectFileTypes> {
  // readonly server: Server<ProjectFileTypes>;

  constructor(configFilePath: string) {
    super({
      createShortId,
      driver: "fs",
      fs: configFilePath,
      fileTypes: new TypeboxFileTypes<ProjectFileTypes>().set(ProjectFileTypes),
      plugins: {
        // git: true,
      },
    });
    (this as any)[Symbol.toStringTag] = `ProjectRepo("${configFilePath}")`;
    // this.server = new Server<ProjectFileTypes>(this);
  }
}
