// Local
import { Maybe, Tags, Type, Static, apiController, define } from "@/common/api";
import { Entry } from "@jrfs/node";
import { projectService } from "@/platform";

async function transaction(
  run: (repo: projectService["repo"]) => Promise<Entry>,
): Promise<FsApi.TxResult> {
  const { repo } = projectService;
  const { id } = await run(repo);
  return { id };
}

export default apiController(function projectRepoFsApi(api, options) {
  api.addSchema(FsApi.TxResult);
  api.addSchema(FsApi.Add);
  api.addSchema(FsApi.GetJsonData);
  api.addSchema(FsApi.GetJsonDataResult);
  api.addSchema(FsApi.Move);
  api.addSchema(FsApi.Remove);
  api.addSchema(FsApi.Patch);
  api.addSchema(FsApi.Write);
  // /add
  api.post(
    "/add",
    {
      schema: {
        body: Type.Ref(FsApi.Add),
        tags: [Tags.ProjectRepoFs],
        operationId: "ProjectRepoFsAdd",
        description: "Add file/directory to repo fs.",
        summary: "Add file/directory.",
        response: TxResponses,
      },
    },
    async function fsAdd({ body }, rep) {
      const res = await transaction((repo) =>
        repo.fs.add(body.to, "data" in body ? { data: body.data } : {}),
      );
      rep.status(200).send(res);
    },
  );
  // /data/json
  api.post(
    "/data/json",
    {
      schema: {
        body: Type.Ref(FsApi.GetJsonData),
        tags: [Tags.ProjectRepoFs],
        operationId: "ProjectRepoFsGetJson",
        description: "Get file JSON data from repo fs.",
        summary: "Get file JSON data.",
        response: {
          200: Type.Ref(FsApi.GetJsonDataResult),
        },
      },
    },
    async function fsGetJsonData({ body }, rep) {
      const { repo } = projectService;
      const { from } = body;
      const entry = repo.files.findPathEntry(from)!;
      // TODO: Respond with a 404 if (!entry)...
      const data = repo.files.data(entry);
      // CONSIDER: Should we compare client `ctime` to signal no-change here?
      rep.status(200).send({ id: entry.id, data });
    },
  );
  // /move
  api.post(
    "/move",
    {
      schema: {
        body: Type.Ref(FsApi.Move),
        tags: [Tags.ProjectRepoFs],
        operationId: "ProjectRepoFsMove",
        description: "Move a file/directory into existing or new path.",
        summary: "Move file/directory.",
        response: TxResponses,
      },
    },
    async function fsMove({ body }, rep) {
      const res = await transaction((repo) => repo.fs.move(body.from, body.to));
      rep.status(200).send(res);
    },
  );
  // /remove
  api.post(
    "/remove",
    {
      schema: {
        body: Type.Ref(FsApi.Remove),
        tags: [Tags.ProjectRepoFs],
        operationId: "ProjectRepoFsRemove",
        description: "Remove file/directory from repo fs.",
        summary: "Remove file/directory.",
        response: TxResponses,
      },
    },
    async function fsRemove({ body }, rep) {
      const res = await transaction((repo) => repo.fs.remove(body.from));
      rep.status(200).send(res);
    },
  );
  // /write
  api.post(
    "/write",
    {
      schema: {
        body: Type.Ref(FsApi.Write),
        tags: [Tags.ProjectRepoFs],
        operationId: "ProjectRepoFsWrite",
        description: "Write file data patches to repo fs.",
        summary: "Write file data patches.",
        response: TxResponses,
      },
    },
    async function fsWrite({ body }, rep) {
      const res = await transaction(async (repo) => {
        // await repo.write(body.to, (data) => {});
        let entry = repo.files.findPathEntry(body.to);
        if (!entry) {
          throw new Error(`Entry not found "${body.to}".`);
        }
        if ("patches" in body) {
          if (!body.patches || !body.undo) {
            throw new Error(`Need data or patches to write to "${body.to}".`);
          }
          entry = await repo.fs.patch(entry, {
            ctime: body.ctime!,
            patches: body.patches,
            undo: body.undo,
          });
          return entry;
        } else if (typeof body.data === "undefined") {
          throw new Error(`Need data or patches to write to "${body.to}".`);
        } else {
          entry = await repo.fs.write(entry, body.data);
          return entry;
        }
      });
      rep.status(200).send(res);
    },
  );
});

export namespace FsApi {
  export const Add = Type.Object(
    {
      to: Type.String(),
      data: Maybe(Type.Any()),
    },
    define("FsAdd"),
  );
  export type Add = Static<typeof Add>;

  export const GetJsonData = Type.Object(
    {
      from: Type.String(),
    },
    define("FsGetJsonData"),
  );
  export type GetJsonData = Static<typeof GetJsonData>;

  export const GetJsonDataResult = Type.Object(
    {
      id: Type.String(),
      data: Maybe(Type.Any()),
    },
    define("GetJsonDataResult"),
  );
  export type GetJsonDataResult = Static<typeof GetJsonDataResult>;

  export const Move = Type.Object(
    {
      from: Type.String(),
      to: Type.String(),
    },
    define("FsMove"),
  );
  export type Move = Static<typeof Move>;

  export const Remove = Type.Object(
    {
      from: Type.String(),
    },
    define("FsRemove"),
  );
  export type Remove = Static<typeof Remove>;

  export const Patch = Type.Object(
    {
      op: Type.Union([
        Type.Literal("replace"),
        Type.Literal("remove"),
        Type.Literal("add"),
      ]),
      path: Type.Array(Type.Union([Type.String(), Type.Number()])),
      value: Maybe(Type.Any()),
    },
    define("FsPatch"),
  );
  export type Patch = Static<typeof Patch>;

  export const TxResult = Type.Object(
    {
      id: Type.String(),
    },
    define("FsTxResult"),
  );
  export type TxResult = Static<typeof TxResult>;

  export const Write = Type.Object(
    {
      to: Type.String(),
      data: Maybe(Type.Any()),
      patches: Maybe(Type.Array(Type.Ref(Patch))),
      undo: Maybe(Type.Array(Type.Ref(Patch))),
      ctime: Maybe(Type.Number()),
    },
    define("FsWrite"),
  );
  export type Write = Static<typeof Write>;
}

const TxResponses = {
  200: Type.Ref(FsApi.TxResult),
};
