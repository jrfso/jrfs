import OS from "node:os";
import { __DEV__ } from "../config";

/** Function to remove an `onShutdown` event handler. */
export type ShutdownRemover = () => void;
/** Function to handle an `onShutdown` event. */
export type ShutdownHandler = (reason: ShutdownReason) => Promise<void>;
export interface ShutdownOptions {
  shutdownOnUncaughtException?: boolean;
}
/** Reason string or signal string for an `onShutdown` event. */
export type ShutdownReason = "ERROR" | "NORMAL" | NodeJS.Signals;

let finalShutdownHandler: ShutdownHandler | undefined = undefined;
/** Shutdown events per platform (or `other`). */
const shutdownEvents: Partial<Record<NodeJS.Platform, NodeJS.Signals[]>> & {
  other: NodeJS.Signals[];
} = {
  other: ["SIGINT", "SIGTERM", "SIGQUIT"] as NodeJS.Signals[],
  win32: ["SIGINT", "SIGQUIT"] as NodeJS.Signals[],
};
/** Handlers registered via `onShutdown`. */
let shutdownHandlers: ShutdownHandler[] = [];

let shuttingDown = false;

async function callShutdownHandlers(reason: ShutdownReason) {
  const handlers = shutdownHandlers.map((handler) => handler(reason));
  await Promise.all(handlers);
  if (finalShutdownHandler) {
    await finalShutdownHandler(reason);
  }
}

function handleShutdownSignal(signal: NodeJS.Signals) {
  shutdown(signal);
}
/** Start listening for shutdown signals. */
export default function listenForShutdown(
  finalHandler: ShutdownHandler,
  options: ShutdownOptions = {
    shutdownOnUncaughtException: false,
  },
) {
  if (finalShutdownHandler) {
    throw new Error("listenForShutdown can only be called once.");
  }
  finalShutdownHandler = finalHandler;

  if (options.shutdownOnUncaughtException) {
    process.on("uncaughtException", onUncaughtException);
  }

  const signals = shutdownEvents[OS.platform()] || shutdownEvents.other;
  for (const signal of signals) {
    process.on(signal, handleShutdownSignal);
  }
}
/** Register a `ShutdownHandler`. Call the returned function to unregister. */
export function onShutdown(handler: ShutdownHandler): ShutdownRemover {
  shutdownHandlers.push(handler);
  return shutdownHandlerRemover(handler);
}

function onUncaughtException(
  error: Error,
  // origin: NodeJS.UncaughtExceptionOrigin,
) {
  console.log("Exception", error);
  shutdown("ERROR");
}
/** Begins shutting down the process, asynchronously. */
export async function shutdown(
  reason: ShutdownReason = "NORMAL",
  code?: number,
) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  let exitCode = code ?? (reason === "ERROR" ? 1 : 0);
  try {
    console.log(`\nShutting down (${reason})...`);
    await callShutdownHandlers(reason);
    console.log("Goodbye");
  } catch (ex) {
    if (exitCode === 0) {
      exitCode = 2;
    }
    console.error("Shutdown error.", ex);
  } finally {
    process.exit(exitCode);
  }
}

function shutdownHandlerRemover(handler: ShutdownHandler): ShutdownRemover {
  return function removeShutdownHandler() {
    shutdownHandlers = shutdownHandlers.filter(function excludeHandler(it) {
      return it !== handler;
    });
  };
}
