import { exec as NodeChildProcessExec } from "node:child_process";
import { promisify } from "node:util";
import Path from "node:path";
import { performance as perf } from "node:perf_hooks";
import FS from "node:fs/promises";
import { build } from "esbuild";
import { glob } from "glob";
import minimist from "minimist";
import { replaceTscAliasPaths } from "tsc-alias";

/*** Notes & Type Defs *********************************************************
 *
 * - ALL PATHS should be relative to package being compiled.
 *
 * @typedef {keyof typeof PACKAGE_TYPES} PackageType
 * @typedef {import("esbuild").Plugin} EsbuildPlugin
 ******************************************************************************/

/** Name of this script/process used for labeling error messages, etc. */
const PROCESS_NAME = "build-esm";

/** Defaults for each type of package that can be built. */
const PACKAGE_TYPES = {
  lib: {
    declarations: true,
    out_dir: "lib",
  },
  standalone: {
    declarations: false,
    out_dir: "dist",
  },
};
/** @type {PackageType} */
const DEFAULT_PACKAGE_TYPE = "standalone";
/** The config set to it's default values for when no args are passed. */
const config = {
  /** Set `true` to write TypeScript declarations after building. */
  declarations: PACKAGE_TYPES[DEFAULT_PACKAGE_TYPE].declarations ?? false,
  /** Static source directories to copy. @type {string[]} */
  from_dirs: [],
  /** Output directory name. */
  out_dir: PACKAGE_TYPES[DEFAULT_PACKAGE_TYPE].out_dir ?? "dist",
  /** Source directory name. */
  src_dir: "src",
  /** Test directory name patterns for {@link glob} ignore. */
  test_dir: "*tests",
  /** Test file name patterns for {@link glob} ignore. */
  test_files: "*.test.{ts,js}",
  /** Static source directories to copy into. @type {string[]} */
  to_dirs: [],
  /** Name of the tsconfig file to use. */
  tsconfig_file: "tsconfig.json",
  /** Type of package to build. @type {PackageType} */
  type: DEFAULT_PACKAGE_TYPE,
  /** Set `true` to log more info. */
  verbose: false,
  /** Set `true` to print config, entrypoints and exit. */
  test: false,
};

const exec = promisify(NodeChildProcessExec);
/** Performance timestamp */
let started = 0;

/** Function to call when a task is done, to show performance timestamp. */
function done() {
  const time = perf.now() - started;
  const timeFmt = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(time);
  console.log(`⚡ \x1b[32mDone in ${timeFmt}ms\x1b[0m`);
}
/** Plugin to copy static files. @returns {EsbuildPlugin} */
function esbuildCopyStaticPlugin(from, to) {
  return {
    name: "esbuildCopyStaticPlugin",
    setup(build) {
      const { outdir = config.out_dir } = build.initialOptions;
      const source = from; // Path.join(__dirname, `../${from}`);
      const dest = Path.join(outdir, to);
      build.onEnd(async () => FS.cp(source, dest, { recursive: true }));
    },
  };
}
/**
 * Function to log a task start message and set {@link started} timestamp.
 * @param {string} message
 * @param {any[]} args
 */
function run(message, ...args) {
  console.log(message, ...args);
  started = perf.now();
}
/** Sets {@link config} fields from CLI args. */
function setConfig() {
  //
  // Parse CLI args and get package type
  //
  const {
    argv: [_nodeCmd, _thisScriptPath, ...argv],
  } = process;
  const parsed = minimist(argv);
  const package_type = parsed._[0];
  delete parsed._;
  delete parsed["--"];
  /**
   * @type {Record<"decl"|"from"|"help"|"out"|"test"|"to"|"tsconfig"|"verbose",boolean|string|string[]>}
   */
  const args = parsed;
  if (args.verbose) {
    console.log("PACKAGE TYPE", package_type ?? config.type, "ARGS", args);
  }
  if (args.help) {
    showHelp();
    return false;
  }
  //
  // Validate package_type from args, set config.type, copy defaults
  //
  if (package_type) {
    if (!PACKAGE_TYPES[package_type]) {
      showError(`Invalid package type "${package_type}"`, { help: true });
      return false;
    }
    config.type = package_type;
    Object.assign(config, PACKAGE_TYPES[config.type]);
  }
  //
  // Set options
  //
  if (args.length < 1) {
    return true; // No options, fine.
  }
  /** @param {string | string[]} arg */
  const asArray = (arg) => (Array.isArray(arg) ? arg : [arg]);
  /** @param {string | string[]} arg */
  const asString = (arg) => (Array.isArray(arg) ? arg[0] : arg);

  if (args.decl) config.declarations = args.decl;
  if (args.from) config.from_dirs = asArray(args.from);
  if (args.out) config.out_dir = asString(args.out);
  if (args.to) config.to_dirs = asArray(args.to);
  if (args.tsconfig) config.tsconfig_file = asString(args.tsconfig);
  if (args.verbose) config.verbose = true;
  if (args.test) config.test = true;
  //
  // Validate config
  //
  // CONSIDER: Validate if paths (out_dir, tsconfig_file) are well-formed,
  // but don't check if they exist here...
  //
  if (config.from_dirs.length !== config.to_dirs.length) {
    showError("Invalid from/to directories - counts must match.", {
      help: true,
    });
    return false;
  }
  if (config.test || config.verbose) {
    console.log("SET CONFIG", config);
  }
  return true;
}

function showHelp() {
  const PO = 22;
  const cpath = "node ../../scripts/build-esm.mjs";
  console.log(`USAGE: ${cpath} [type] [options]\n`);
  console.log(
    `TYPES:\n\t` +
      Object.keys(PACKAGE_TYPES).join(", ").padEnd(20) +
      ` (default: ${DEFAULT_PACKAGE_TYPE})\n`,
  );
  console.log(`OPTIONS:`);
  console.log(
    "\t--out <dir>".padEnd(PO) + "Set a non-default output directory.",
  );
  console.log(
    "\t--tsconfig <file>".padEnd(PO) + "Set a non-default tsconfig file name.",
  );
  console.log(
    "\t--decl".padEnd(PO) + "Flag to write TypeScript declarations after build",
  );
  console.log(
    "\t--from <dir>".padEnd(PO) +
      "Static directory to copy from. (Requires --to)",
  );
  console.log(
    "\t--to <dir>".padEnd(PO) +
      "Static directory to copy to. (Requires --from)",
  );
  console.log("\t--test".padEnd(PO) + "Print config, entry points and exit.");
  console.log(
    "\t--verbose".padEnd(PO) +
      "Print all possible diagnostic messages while running.",
  );
  console.log("\t--help".padEnd(PO) + "Print this help message");
  console.log("");
  console.log(`EXAMPLES:`);
  console.log(
    `\nChange output directory from default "dist" to "build"\n\n\t${cpath} ` +
      `--out build`,
  );
  console.log(
    `\nSet a different tsconfig file than default "tsconfig.json"\n\n\t${cpath} ` +
      `--tsconfig tsconfig.test.json`,
  );
  console.log(
    `\n...And write the d.ts declaration files\n\n\t${cpath} ` +
      `--decl --tsconfig tsconfig.test.json`,
  );
  console.log(
    `\nCopy files from "./public" to "./dest/public" during build\n\n\t${cpath} ` +
      `--from public --to public`,
  );
  console.log("");
  console.log(`NOTES:`);
  console.log(
    `\nCurrently, for ALL OPTIONS which accept a <file> or <dir> above, ` +
      `DO NOT start with a period. For example these are fine: --out my-dir ` +
      `--from my-dir/my-sub-dir and these are NOT ` +
      `--out ./my-dir --from ./my-dir/my-sub-dir`,
  );
  console.log(
    `\n(Therefore, we also cannot accept parent paths e.g. --from ../my-dir)`,
  );
  console.log("");
}
/** @param {string | Error} error */
function showError(error, { help = false } = {}) {
  error = error?.message ?? "" + error;
  console.error(`\n${PROCESS_NAME} Error: ${error}\n`);
  if (help) showHelp();
}

async function main() {
  if (!setConfig()) {
    return;
  }
  // Get all ts files...
  const entryPoints = await glob(`${config.src_dir}/**/*.ts`, {
    ignore: [
      //       Ignore Tests
      //       e.g. "src/**/*tests/**",
      `${config.src_dir}/**/${config.test_dir}/**`,
      //       e.g. "src/**/*.test.{ts,js}",
      `${config.src_dir}/**/${config.test_files}`,
    ],
  });
  if (config.test || config.verbose) {
    console.log("ENTRY POINTS", entryPoints);
  }
  if (config.test) {
    console.log(PROCESS_NAME + " Exiting: test mode");
    return;
  }
  run("Running esbuild...");
  /** @type {EsbuildPlugin[]} */
  const plugins = [];
  if (config.from_dirs.length > 0) {
    plugins.push(
      ...config.from_dirs.map((from, i) =>
        esbuildCopyStaticPlugin(from, config.to_dirs[i]),
      ),
    );
  }
  await build({
    entryPoints,
    logLevel: "info",
    outdir: config.out_dir,
    bundle: false,
    minify: false,
    platform: "node",
    format: "esm",
    sourcemap: "external",
    target: "node20",
    tsconfig: config.tsconfig_file,
    plugins,
  });
  // done(); // Not needed since esbuild prints it's own time....

  if (config.declarations) {
    run("\nWriting declarations...\n");
    // execSync("../../node_modules/.bin/tsc", { stdio: "inherit" });
    await exec(
      "../../node_modules/.bin/tsc " +
        [
          "--declaration",
          "--emitDeclarationOnly",
          `--project ${config.tsconfig_file}`,
        ].join(" "),
      {
        encoding: "utf-8",
        shell: "/bin/bash",
      },
    )
      .catch((err) => ({ err }))
      .then(
        /** @param {Partial<Record<"err" | "stderr" | "stdout", any>>} param0 */
        ({ err, stderr, stdout }) => {
          done();
          if (err) console.error("" + err, { err });
          if (stderr) console.error(stderr);
          if (stdout) console.log(stdout);
        },
      );
  }
  run("\nReplacing import paths for ESM...\n");
  // See https://github.com/evanw/esbuild/issues/394#issuecomment-1537247216
  await replaceTscAliasPaths({
    // Usage https://github.com/justkey007/tsc-alias?tab=readme-ov-file#usage
    configFile: config.tsconfig_file,
    watch: false,
    outDir: config.out_dir,
    declarationDir: config.out_dir,
    // The built code needs to import from "./files.js" not from "./file" so we
    // need both resolveFullExtension AND resolveFullPaths...
    resolveFullExtension: ".js",
    resolveFullPaths: true,
  });
  done();
}
main();
