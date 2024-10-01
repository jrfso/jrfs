// Local
import { Tags, Type, apiController } from "@/common/api";
import projectRepoFsApi from "./fs";

export default apiController(function projectRepoApi(api, options) {
  api.post(
    "/reload",
    {
      schema: {
        body: Type.Object({}),
        tags: [Tags.ProjectRepo],
        operationId: "ProjectRepoReload",
        description: "Reload project repo.",
        summary: "Reloads the project repo.",
        response: {
          200: Type.Object({}, { additionalProperties: true }),
        },
      },
    },
    async function reloadRepo({ body }, rep) {
      rep.status(200).send({
        message: "Not implemented.",
      });
    },
  );

  api.register(projectRepoFsApi, { prefix: "fs" });
});
