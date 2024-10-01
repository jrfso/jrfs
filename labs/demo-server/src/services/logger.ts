// NOTE: We're just re-exporting the Pino logger instance managed by Fastify so
//       we don't have to change imports everywhere in case we change loggers
//
// Any code that doesn't want to import from `services` should import
// `logger` from here. (So, code inside of `services/`)
//
export { logger } from "./webServer";
