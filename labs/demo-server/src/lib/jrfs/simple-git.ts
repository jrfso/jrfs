import { registerPlugin } from "@jrfs/core";
import registerGitPluginShared from "demo-shared/jrfs/git";
// import { simpleGit } from "simple-git";

export default registerPlugin("git", function registerGitPlugin(cmds) {
  registerGitPluginShared.call(this, cmds);
  console.log("[GIT] Registering host command runners...");
  if (cmds && typeof cmds !== "boolean") {
    // cmds?.run?.["git.add"](null!, {});
    // TODO: Set simpleGit options, baseDir, etc... from repo config!
    // const sgit = simpleGit();
    // CONSIDER: Maybe create the runners right here with sgit...
    // this.registerCommandRunners(cmds);
  }
});
