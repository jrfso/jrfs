import { customAlphabet } from "nanoid";
import { Repository } from "@jrfs/node";
import { TypeboxFileTypes } from "@jrfs/typebox";
import { ProjectFileTypes } from "demo-shared/platform/project";

const createShortId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 9);

export class ProjectRepo extends Repository<ProjectFileTypes, "fs"> {
  // readonly server: Server<ProjectFileTypes>;

  constructor(configFilePath: string) {
    super({
      createShortId,
      driver: "fs",
      fs: configFilePath,
      fileTypes: new TypeboxFileTypes(),
    });
    (this as any)[Symbol.toStringTag] = `ProjectRepo("${configFilePath}")`;
    this.fileTypes.set(ProjectFileTypes);
    // this.server = new Server<ProjectFileTypes>(this);
  }
}
