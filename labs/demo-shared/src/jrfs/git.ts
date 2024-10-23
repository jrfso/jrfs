import {
  CommandType,
  PluginType,
  registerPlugin,
} from "@jrfs/core";

export interface GitPlugin {
  add(files?: string[]): Promise<any>;
  commit(message: string): Promise<any>;
  push(force?: boolean): Promise<any>;
}

export interface GitCommands {
  "git.add": CommandType<{ files?: string[] }, { files: string[] }>;
  "git.commit": CommandType<{ message: string }, { commit: string }>;
  "git.push": CommandType<{ force?: boolean }, { commit: string }>;
}

declare module "@jrfs/core" {
  /* eslint-disable @typescript-eslint/no-unused-vars */

  interface Commands extends GitCommands {}

  interface Plugins {
    git: PluginType<undefined>;
  }

  interface Repository<FT> {
    get git(): GitPlugin;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

export default registerPlugin("git", function registerGitPlugin(params) {
  console.log("[GIT] Registering shared commands...");
  const commands = Object.freeze({
    add: async (files?) => {
      console.log("[GIT] Add...");
      return this.exec("git.add", { files });
    },
    commit: async (message) => {
      console.log("[GIT] Commit...");
      return this.exec("git.commit", { message });
    },
    push: async (force?) => {
      console.log("[GIT] Push...");
      return this.exec("git.push", { force });
    },
  } satisfies GitPlugin);
  Object.defineProperty(this, "git", {
    enumerable: true,
    value: commands,
    writable: false,
  });
});
