import {
  Repository,
  RepositoryPluginOf,
  registerPlugin,
} from "@jrfs/core";

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

export interface GitCommandHelpers {
  add(files?: string[]): Promise<any>;
  commit(message: string): Promise<any>;
  push(force?: boolean): Promise<any>;
}

declare module "@jrfs/core" {
  interface Commands extends GitCommands {
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

  interface RepositoryPlugins {
    git: RepositoryPluginOf<undefined, GitCommandHelpers>;
  }

  interface Repository<FT> {
    get git(): GitCommandHelpers;
  }
}

registerPlugin("git", function registerGitCommands() {
  this.plugin.git = (function (repo): GitCommandHelpers {
    return {
      async add(files?: string[]) {
        return repo.exec("git.add", { files });
      },
      async commit(message: string) {
        return repo.exec("git.commit", { message });
      },
      async push(force?: boolean) {
        return repo.exec("git.push", { force });
      },
    };
  })(this);
});

Object.defineProperty(Repository.prototype, "git", {
  enumerable: true,
  get: function getGitCommands(this: Repository<any>): GitCommandHelpers {
    return this.plugin.git!;
  },
});
