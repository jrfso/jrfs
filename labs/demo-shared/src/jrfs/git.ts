import { RepositoryPluginOf, registerPlugin } from "@jrfs/core";

export interface GitCommander {
  add(files?: string[]): Promise<any>;
  commit(message: string): Promise<any>;
  push(force?: boolean): Promise<any>;
}

export interface GitCommands {
  "git.add": {
    params: { files?: string[] };
    result: { files: string[] };
  };
  "git.commit": {
    params: { message: string };
    result: { commit: string };
  };
  "git.push": {
    params: { force?: boolean };
    result: { commit: string };
  };
}

declare module "@jrfs/core" {
  /* eslint-disable @typescript-eslint/no-unused-vars */

  interface Commands extends GitCommands {}

  interface RepositoryPlugins {
    git: RepositoryPluginOf<undefined>;
  }

  interface Repository<FT> {
    get git(): GitCommander;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

registerPlugin("git", function registerGitPlugin() {
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
  } satisfies GitCommander);
  Object.defineProperty(this, "git", {
    enumerable: true,
    value: commands,
    writable: false,
  });
});
