// Local
import { ProjectRepo } from "./ProjectRepo";

export async function openRepo() {
  console.log("openRepo");

  const repo = new ProjectRepo();
  // Let the developer play.
  (window as any).repo = repo;

  await repo.open();

  setTimeout(async () => {
    console.log("TESTING WRITE FILE");
    await repo.write<"db">("backend/db/main/_.db.json", (data) => {
      data.db.name = "maing";
      data.db.dialect = "sqlite";
      // delete data.db.mysql;
    });
  }, 3000);

  setTimeout(async () => {
    console.log("TESTING READ FILE");
    const { data } = await repo.get("backend/db/main/_.db.json");
    console.log("DATA", data);
  }, 6000);

  // setTimeout(async () => {
  //   console.log("Testing find db...");
  //   const nodes = await repo.findTypes("db");
  //   for (const { data, node } of nodes) {
  //     console.log("FOUND", node, data);
  //   }
  // }, 3000);

  // setTimeout(async () => {
  //   console.log("TESTING RENAME...");
  //   const targetPath = "backend/db/main/_.db.json";
  //   const target = repo.findPathEntry(targetPath);
  //   if (target) {
  //     await repo.rename(targetPath, "my.db.json");
  //   } else {
  //     console.error("NO TEST TARGET TO RENAME!");
  //   }
  // }, 6000);

  // setTimeout(async () => {
  //   console.log("TESTING COPY...");
  //   const targetPath = "backend/db/main";
  //   const target = repo.findPathEntry(targetPath);
  //   if (target) {
  //     await repo.copy(targetPath, "backend/db/backup");
  //   } else {
  //     console.error("NO TEST TARGET TO COPY!");
  //   }
  // }, 12000);

  // setTimeout(async () => {
  //   console.log("TESTING COPY FILE...");
  //   const targetPath = "backend/db/main/_.db.json";
  //   const target = repo.findPathEntry(targetPath);
  //   if (target) {
  //     await repo.copy(targetPath, "backend/db/main/my.db.json");
  //   } else {
  //     console.error("NO TEST TARGET TO COPY!");
  //   }
  // }, 12000);

  return repo;
}
