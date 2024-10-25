// #region FIRST: MUST IMPORT THESE FIRST, IN THIS ORDER
import { __DEV__, NODE_ENV, PORT, PKG_NAME, PKG_VER } from "@/config";
// #endregion
import chalk from "chalk";
// Common Feature modules
import "demo-shared/features/db";
// Local
import listenForShutdown from "@/services/shutdown";
import { projectService } from "@/platform";
import { webServer } from "@/services";

export async function main() {
  console.log(
    `Starting ${PKG_NAME} ` +
      `(version: ${PKG_VER}, env: ${NODE_ENV}, port: ${PORT})...`,
  );
  if (__DEV__) {
    console.log(`${chalk.greenBright("JrFS Demo Server")} - Welcome!`);
  }
  // TODO: Better CLI options parsing...
  await projectService.openRepo(process.argv[2] ?? "");
  await webServer.start();
}

async function onFinalShutdown() {
  await webServer.stop();
  await projectService.closeRepo();
}

listenForShutdown(onFinalShutdown, {
  shutdownOnUncaughtException: false,
});

main();

// #region Tests

// setTimeout(async () => {
//   await Promise.reject("TEST_UNHANDLED_REJECTION");
// }, 1000);

// setTimeout(async () => {
//   throw new Error("TEST_UNCAUGHT_EXCEPTION");
// }, 1000);

// setTimeout(async () => {
//   console.log("Testing dynamic import...");
//   const path = "../designer-files/design/jrfs.config.ts";
//   const { default: config } = await import(path);
//   console.log("CONFIG", config);
//   const result = await config.doMe();
//   console.log(result);
// }, 1000);

// #endregion
