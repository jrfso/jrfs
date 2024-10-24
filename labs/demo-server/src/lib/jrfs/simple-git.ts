import { command, registerPlugin } from "@jrfs/core";
import registerGitPluginShared from "demo-shared/jrfs/git";
// import { simpleGit } from "simple-git";

// TODO: Implement some actual git commands...

const gitCommands = [
  command("git.add", async function gitAdd(props, params) {
    console.log("Yooooo git.add!");
    return { files: ["OK!"] };
  }),
  command("git.commit", async function gitCommit(props, params) {
    console.log("Yooooo git.commit!");
    return { commit: "OK!" };
  }),
  command("git.push", async function gitPush(props, params) {
    console.log("Yooooo git.push!");
    return { commit: "OK!" };
  }),
];

export default registerPlugin("git", function registerGitPlugin(props, params) {
  registerGitPluginShared(props, params);
  const { config, commands /*,repo*/ } = props;
  console.log("[GIT] Registering host command runners...");
  commands.register(gitCommands);
  // TODO: Find git path from config.host.dataPath...
  config.host.gitPath = "/a/b/c";
});
