import dotenv from "dotenv";

dotenv.config();

export type ConfigEnv = "development" | "staging" | "production";

const {
  // Standard
  NODE_ENV: node_env = "development",
  LOG_LEVEL = "debug",
  TZ,

  // API
  HOST = "0.0.0.0",
  PORT: port = "40140",
} = process.env;

const NODE_ENV: ConfigEnv = node_env as ConfigEnv;
const __DEV__ = NODE_ENV === "development";

const PORT = parseInt(port);

export {
  // Standard
  __DEV__,
  NODE_ENV,
  LOG_LEVEL,
  TZ,

  // API
  HOST,
  PORT,
};
