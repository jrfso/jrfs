import Path from "node:path";
import { describe, expect, test } from "vitest";
// Local
// Common Feature modules
import "demo-shared/features/db";
import { ProjectRepo } from "@/platform";

const REPO_PATH = Path.join(
  import.meta.dirname,
  "../../../designer-files/design/.jrfs/projectDb.json",
);

describe.sequential("Starter lab", () => {
  let repo = null! as ProjectRepo;
  let addedDir = null! as Awaited<ReturnType<ProjectRepo["fs"]["add"]>>;
  let addedFile = null! as Awaited<ReturnType<ProjectRepo["fs"]["add"]>>;

  test("Open repo", async () => {
    console.log(`OPENING repo`, REPO_PATH);

    repo = new ProjectRepo(REPO_PATH);
    await repo.open();

    await repo.files.printDirectory();
  });
  test("Finding db models", async () => {
    console.log("FINDING db models...");

    const nodes = await repo.findTypes("db");
    expect(nodes.length).toBeGreaterThanOrEqual(1);

    console.log("FOUND", nodes.length, "nodes");
    for (const { node, data } of nodes) {
      console.log("FOUND", node.name, "{ id:", [node.id], "} =", data);
    }
  });
  test("Adding directory", async () => {
    console.log("ADDING DIRECTORY...");
    addedDir = await repo.fs.add("tests");
    console.log("ADDED DIRECTORY", addedDir.id, addedDir.name);
  });
  test("Adding file", async () => {
    console.log("ADDING FILE...");
    addedFile = await repo.fs.add("my.db.json", {
      parent: addedDir,
      data: {
        a: { name: "a" },
        b: { name: "b" },
        c: { name: "c" },
      },
    });
    console.log("ADDED FILE", addedFile.id, addedFile.name, addedFile.pId);
    await repo.files.printDirectory();
  });
  test("Moving directory", async () => {
    // await timeoutAsync(500);
    console.log("MOVING DIRECTORY...", addedDir.id);
    addedDir = await repo.fs.move(addedDir, "backend/things/tests");
    console.log("MOVED DIRECTORY", addedDir.id, "to", addedDir.pId);
    await repo.files.printDirectory();
  });
  test("Renaming directory", async () => {
    // await timeoutAsync(500);
    console.log("RENAMING DIRECTORY...", addedDir.id);
    addedDir = await repo.fs.rename(addedDir, "testing");
    console.log("RENAMED DIRECTORY...", addedDir.id, addedDir.name);
    await repo.files.printDirectory();
  });
  test("Writing file", async () => {
    // await timeoutAsync(500);
    console.log("WRITING TO FILE", addedFile.name, addedFile.ctime);
    addedFile = await repo.fs.write(
      addedFile,
      (data: Record<"a" | "b" | "c", { name: string }>) => {
        data.a.name = "A";
        data.b.name = "B";
        data.c.name = "C";
      },
    );
    console.log("WROTE TO FILE", addedFile.name, addedFile.ctime);
    await repo.files.printDirectory();
  });
  test("Removing directory", async () => {
    console.log("REMOVING DIRECTORY...", addedDir.id, addedDir.name);
    addedDir = await repo.fs.remove("backend/things");
    console.log("REMOVED DIRECTORY...", addedDir.id, addedDir.name);
    await repo.files.printDirectory();
  });
  test("Add and remove deep directory", async () => {
    console.log("TRY MKDIR...");
    const deepDir = await repo.fs.add("frontend/app1/foo/bar");
    await repo.files.printDirectory();
    console.log("REMOVING MKDIR...");
    await repo.fs.remove({ id: deepDir.pId! });
    await repo.files.printDirectory();
  });
  test("Closing db", async () => {
    console.log("CLOSING repo", REPO_PATH);

    await repo.close();
    // TODO: Make sure starting and ending ids in ids-file are now the same.
    expect(true);
  });
});
