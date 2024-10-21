import { registerPlugin } from "@jrfs/core";
import registerGitPluginShared from "demo-shared/jrfs/git";
// import { simpleGit } from "simple-git";

export default registerPlugin("git", function registerGitPlugin(params) {
  registerGitPluginShared.call(this, params);
  console.log("[GIT] Registering host command runners...");
  if (params && typeof params !== "boolean") {
    // params?.run?.["git.add"](null!, {});
    // TODO: Set simpleGit options, baseDir, etc... from repo config!
    // const sgit = simpleGit();
    // CONSIDER: Maybe create the runners right here with sgit...
    // this.registerCommandRunners(params);
  }
});
