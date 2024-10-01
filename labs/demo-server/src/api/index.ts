import type { WebApi } from "@/services";

import projectApi from "./project";

export default function setupApiRoutes(api: WebApi) {
  // NOTE: `@fastify/autoload` was previously used to load these, e.g.
  //
  // api.register(fastLoad, { dir: Path.join(__dirname, "../api"),
  //   options: { prefix: "/api/v1" } });
  //
  // However, we weren't using any of it's features aside from the loading which
  // we're simply doing here here...
  //
  api.register(projectApi, {
    prefix: `/api/v1/project`,
  });
}
