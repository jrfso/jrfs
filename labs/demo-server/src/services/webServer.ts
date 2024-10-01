// import type Net from "net";
// import Http from "http";
import OS from "os";
import Path from "path";
import chalk from "chalk";
import Fastify from "fastify";
// import type * as Fast from "fastify";
// import Fastify, { FastifyServerOptions } from "fastify";
import fastLogger from "@mgcrea/fastify-request-logger";
import fastStatic from "@fastify/static";
import fastSwagger from "@fastify/swagger";
import fastSwaggerUI from "@fastify/swagger-ui";
import {
  TypeBoxTypeProvider,
  // TODO: Test fastify with .setValidatorCompiler(TypeBoxValidatorCompiler).
  // TypeBoxValidatorCompiler,
} from "@fastify/type-provider-typebox";
// Local
import {
  // Config
  __DEV__,
  HOST,
  PORT,
  PKG_DIR,
  PKG_VER,
} from "../config";
import commonSchemas, { ServerError, Type } from "../common/schemas";
// Routes
import setupApiRoutes from "../api";
import sockets from "./sockets";

const api = Fastify({
  logger: {
    // level: "debug", // | "info", etc.
    // hooks: {
    //   // Hook to print log-method args instead of interpolating them.
    //   // - https://github.com/pinojs/pino/blob/main/docs/api.md#interpolationvalues-any
    //   logMethod(args, method) {
    //     if (args.length === 2) args[0] = `${args[0]} %j`;
    //     method.apply(this, args);
    //   },
    // },
    transport: __DEV__
      ? {
          target: "@mgcrea/pino-pretty-compact",
          // DEVS: Use "pino-print" to see all logging fields.
          // target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,plugin,reqId",
          },
        }
      : undefined,
  },
  disableRequestLogging: true,
})
  // .setValidatorCompiler(TypeBoxValidatorCompiler)
  .withTypeProvider<TypeBoxTypeProvider>();

// #region Ambient types
// - Add a `FastifyInstance` field for every Fastify api decorator in ./api/...
//   - These become part of the `api` instance and `WebApi` type alias...
//   - See how `WebApi` is used in apiController() from ./common/api.ts.
declare module "fastify" {
  // export interface FastifyInstance {
  //   // verifyAdmin: FastifyAuthFunction;
  //   // noAdminUser: FastifyAuthFunction;
  //   // verifyAdminUser: FastifyAuthFunction;
  // }
  // export interface FastifyRequest {
  //   // adminJwtVerify: FastifyRequest["jwtVerify"];
  //   // adminUser: { id: number; sr: number[]; iat: number };
  // }
  export interface FastifyReply {
    /** Send a 400 with the given error */
    sendBadRequest: (error: any) => void;
    /** Send a 500 with the given error */
    sendError: (error: any) => void;
    /** Send a 403 */
    sendForbidden: () => void;
    /** Send a 401 */
    sendUnauthorized: () => void;
  }
}
// #endregion

export type WebApi = typeof api;

// #region Fastify configuration

api.register(fastLogger);
/** Use the Fastify logger as our logging interface. */
export const logger = api.log;

const staticRoot = Path.resolve(PKG_DIR, "public");
api.register(fastStatic, {
  prefix: "/",
  root: staticRoot,
});

api.register(sockets);

// #region Swagger

api.register(fastSwagger, {
  // stripBasePath: true,
  openapi: {
    info: {
      title: "JRFS Demo Server",
      description:
        "API for the JRFS Demo Server." +
        (__DEV__
          ? "\n\nDevelopers, see also [Fastify reference](https://www.fastify.io/docs/latest/Reference/)."
          : ""),
      version: PKG_VER,
    },
    // servers: [{ url: `http://localhost:${PORT}` }],
    externalDocs: {
      url: "https://github.com/jrfs/jrfs",
      description: "About JRFS",
    },
    tags: commonSchemas.tags,
    // components: {
    //   securitySchemes: {
    //     otherJwt: { type: "apiKey", in: "cookie", name: "gau" },
    //   },
    // },
    // security: [{ otherJwt: [] }],
    servers: [
      {
        url: `http://localhost:${PORT}/api/v1`,
      },
    ],
  },
  // swagger: {
  //   // basePath: "/api/v1",
  //   info: {
  //     title: "JRFS Demo Server",
  //     description:
  //       "API for the JRFS Demo Server." +
  //       (__DEV__
  //         ? "\n\nDevelopers, see also [Fastify reference](https://www.fastify.io/docs/latest/Reference/)."
  //         : ""),
  //     version: PKG_VER,
  //   },
  //   tags: commonSchemas.tags,
  //   securityDefinitions: {
  //     otherJwt: { type: "apiKey", in: "cookie", name: "gau" },
  //   },
  //   security: [{ otherJwt: [] }],
  // },
  refResolver: {
    // See https://github.com/fastify/fastify-swagger/blob/ffde179acb12a1d53573fab31362025bd648a7fa/README.md#managing-your-refs
    buildLocalReference(json: any, baseUri: any, fragment: any, i: number) {
      return json.$id || `def-${i}`;
    },
  },
  // hideUntagged: false,
});

api.register(fastSwaggerUI, {
  routePrefix: "/api/v1/docs",
  // staticCSP: true,
  // transformStaticCSP: (header) => header,
  uiConfig: {
    // See https://github.com/swagger-api/swagger-ui/blob/master/docs/usage/configuration.md#display
    docExpansion: "none",
    deepLinking: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
    layout: "BaseLayout",
    filter: true,
  },
  // uiHooks: {
  //   onRequest: function (request, reply, next) {
  //     next();
  //   },
  //   preHandler: function (request, reply, next) {
  //     next();
  //   },
  // },
});
// #endregion

commonSchemas.init(api);

// #endregion

// #region Routing

api.setNotFoundHandler((req, rep) => {
  if (!__DEV__) {
    if (!req.url.startsWith("/api") && !req.url.endsWith("favicon.ico")) {
      rep.sendFile("index.html");
      return;
    }
  }
  rep.code(404).send({
    statusCode: 404,
    code: 404,
    message: "Not found",
    error: "Not found",
  });
});

api.addHook("onRoute", (routeOpt) => {
  // Modify all routes to include 400, 401 and 500 error responses if necessary.
  const {
    // method,
    schema,
    // path,
  } = routeOpt;
  if (!schema) {
    return;
  }
  if (!schema.operationId) {
    const parts = routeOpt.routePath.split("/");
    // console.log("PATH", parts);
    // let operationId = parts[parts.length - 1];
    // if (operationId === ???) {
    //   operationId = (Array.isArray(method) ? method[0] : method)?.toLowerCase();
    // }
    // schema.operationId = operationId;
    schema.operationId = parts[parts.length - 1];
  }
  const response: any = schema.response;
  if (response) {
    // #region // Declare specific 4xx handlers
    // const security = schema.security;
    // if (!response["400"]) {
    //   response["400"] = Type.Ref(ServerError, { description: "Bad Request" });
    // }
    // if (security && security.length > 0) {
    //   if (!response["401"]) {
    //     response["401"] = Type.Ref(ServerError, { description: "Unauthorized" });
    //   }
    // }
    // if (!response["404"] && path.includes(":")) {
    //   response["404"] = Type.Ref(ServerError, { description: "Not Found" });
    // }
    // #endregion
    // ...or...
    // Declare a general 4xx handler
    response["4xx"] = Type.Ref(ServerError, { description: "Bad Request" });
    // Declare a general error handler
    if (!response["5xx"]) {
      response["5xx"] = Type.Ref(ServerError, { description: "Server Error" });
    }
  }
});

api.after(function setupRoutes(err) {
  if (err) {
    logger.debug("Exiting due to API configuration error.", "" + err);
  }
  setupApiRoutes(api);
});

// #endregion

export const webServer = {
  get api() {
    return api;
  },

  async start() {
    await api.listen({ port: PORT, host: HOST });
    if (__DEV__) {
      printStartupMessage();
    }
    // CONSIDER: Here is how to get the swagger doc, to publish...
    // await api.ready();
    // const swaggerDoc = await api.swagger();
    // console.log("SWAGGER", swaggerDoc);
  },

  async stop() {
    await api.close();
  },
};
(webServer as any)[Symbol.toStringTag] = "webServer";

function printStartupMessage() {
  const onYourNetwork = "On Your Network";
  if (HOST !== "0.0.0.0") {
    console.log(
      `\n${chalk.green.bold("Server running")}
            
    ${chalk.bold(onYourNetwork)}  http://${HOST}:${PORT}\n`,
    );
    return;
  }
  /** Padding length from longest label, plus surrounding space */
  const padLen = onYourNetwork.length + 6;
  const netInfs = Object.values({ ...OS.networkInterfaces() })
    .flat()
    .filter(
      (it) => it !== undefined && !it.internal && it.family === "IPv4",
    ) as OS.NetworkInterfaceInfo[];
  const fullPadding = " ".repeat(padLen);
  const urls = netInfs
    .map((it) => `http://${it.address}:${PORT}`)
    .join(`\n${fullPadding}`);
  console.log(
    `\n${chalk.green.bold("Server running")}

              ${chalk.bold("Local")}  http://localhost:${PORT}
${fullPadding}http://127.0.0.1:${PORT}

           ${chalk.bold("API Root")}  http://localhost:${PORT}/api/v1
           ${chalk.bold("API Docs")}  http://localhost:${PORT}/api/v1/docs
${fullPadding}http://localhost:${PORT}/api/v1/docs/json

    ${chalk.bold(onYourNetwork)}  ${urls}\n\n`,
  );
}
