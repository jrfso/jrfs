import type { FastifyPluginOptions, FastifyPluginCallback } from "fastify";
// Local
import type { WebApi } from "../services/webServer";

// Convenience exports, things needed by most/all api controllers.
export type {
  FastifyPluginOptions,
  // Local
  WebApi,
};
export * from "./schemas";

export type ApiControllerCallback = (
  api: WebApi,
  options: FastifyPluginOptions,
) => Promise<void> | void;

/**
 * A convenient way to register an api controller; saves you from having to
 * import 3-4 types at the top of every controller.
 * @param callback Function to populate the controller with plugins and endpoints.
 * @example
 *  export default apiController(function myApi(api, options) {
 *    api.get("/", {...});
 *  });
 */
export function apiController(callback: ApiControllerCallback) {
  return function createApiController(
    api: WebApi,
    options: FastifyPluginOptions,
    done: Parameters<FastifyPluginCallback>[2],
  ) {
    const maybePromise = callback(api, options);
    if (maybePromise) {
      maybePromise
        .then(function apiControllerCreated() {
          done();
        })
        .catch(done);
    } else {
      done();
    }
  };
}
