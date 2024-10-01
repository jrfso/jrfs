/// <reference types="fastify" />

type FastRequest<
  TRequest extends
    import("fastify").RouteGenericInterface = import("fastify").RouteGenericInterface,
> = import("fastify").FastifyRequest<
  TRequest,
  import("http").Server,
  import("http").IncomingMessage
>;

type FastReply<
  TRequest extends
    import("fastify").RouteGenericInterface = import("fastify").RouteGenericInterface,
> = import("fastify").FastifyReply<
  import("http").Server,
  import("http").IncomingMessage,
  import("http").ServerResponse,
  TRequest
>;

/** A parsed JSON value. */
declare type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A JSON stringify-able value. */
declare type Jsonable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Jsonable[]
  | { [key: string]: Jsonable }
  | { toJSON(): Jsonable };
