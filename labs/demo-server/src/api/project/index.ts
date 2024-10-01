import { Tags, Type, apiController } from "@/common/api";

import projectRepoApi from "./repo";

export default apiController(function projectApi(api, options) {
  // api.addSchema();

  api.post(
    "/build",
    {
      schema: {
        body: Type.Object({}),
        tags: [Tags.Project],
        operationId: "ProjectBuild",
        description: "Build project.",
        summary: "Builds the project.",
        response: {
          200: Type.Object({}, { additionalProperties: true }),
        },
      },
    },
    async function projectBuild({ body }, rep) {
      rep.status(200).send({
        message: "Not implemented.",
      });
    },
  );

  api.register(projectRepoApi, { prefix: "repo" });
});
