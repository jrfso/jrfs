import type { OpenAPIV3_1 } from "openapi-types";
// Local
import type { WebApi } from "../services/webServer";
import { Maybe, Static, Type, define } from "@jrfs/typebox";

export * from "@jrfs/typebox";

// TODO: Replace our ServerError with @fastify/sensible

export const ServerError = Type.Object(
  {
    code: Maybe(Type.String()),
    message: Maybe(Type.String()),
    statusCode: Maybe(Type.Number()),
  },
  define("ServerError", { additionalProperties: true }),
);
export interface ServerError extends Static<typeof ServerError> {}

/**
 * For use with wildcard paths...
 * @example
 * api.get("/yada/*", {schema:{ params:WildcardParam }}
 * (req,rep)=>{ rep.send({ path: req.params["*"] })})
 */
export const WildcardParam = Type.Object({
  "*": Type.String(),
});
export interface WildcardParam extends Static<typeof WildcardParam> {}

// /** Security schemes defined in services/webServer `securityDefinitions`. */
// export type SecurityScheme = "adminJwt" | "otherJwt" | "none";

// /**
//  * Returns a security structure for the given security schemes. e.g.
//  * `security("adminJwt", "otherJwt") => [{ adminJwt: [] }, { otherJwt: [] }]`
//  *
//  * Use it in your routes with `schema:{ security:security("yada") },...`
//  */
// export function security(...keys: SecurityScheme[]) {
//   return keys.map((key) => (key === "none" ? {} : { [key]: [] }));
// }

const TagDefs = {
  Project: {
    name: "Project",
    description: "Project API.",
    externalDocs: {
      description: `Documentation`,
      url: "https://github.com/jrfs/jrfs",
    },
  },
  ProjectRepo: {
    name: "ProjectRepo",
    description: "Project Repo API.",
    externalDocs: {
      description: `Documentation`,
      url: "https://github.com/jrfs/jrfs",
    },
  },
  ProjectRepoFs: {
    name: "ProjectRepoFs",
    description: "Project Repo FS API.",
    externalDocs: {
      description: `Documentation`,
      url: "https://github.com/jrfs/jrfs",
    },
  },
} as const satisfies Record<string, OpenAPIV3_1.TagObject>;

export const Tags = Object.keys(TagDefs).reduce(
  (tags, key) => {
    (tags as any)[key] = (TagDefs as any)[key].name;
    return tags;
  },
  {} as Record<keyof typeof TagDefs, string>,
);

/** Items needed by webServer for setup. */
export default {
  tags: [TagDefs.Project],

  init(api: WebApi) {
    api.addSchema(ServerError);

    api.decorateReply("sendBadRequest", function sendBadRequest(error: any) {
      this.code(400).send({
        statusCode: 400,
        message: "" + error,
      } satisfies ServerError);
    });

    api.decorateReply("sendUnauthorized", function sendUnauthorized() {
      this.code(401).send({
        statusCode: 401,
        message: "Unauthorized",
      } satisfies ServerError);
    });

    api.decorateReply("sendForbidden", function sendForbidden() {
      this.code(403).send({
        statusCode: 403,
        message: "Unauthorized",
      } satisfies ServerError);
    });

    api.decorateReply("sendError", function sendError(error: any) {
      this.code(500).send({
        statusCode: 500,
        message: "" + error,
      } satisfies ServerError);
    });
  },
};
