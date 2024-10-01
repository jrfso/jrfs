/** @file Vitest Workspace. See https://vitest.dev/guide/workspace.html */
import { defineWorkspace } from "vitest/config";
import tsconfigPathsPlugin from "vite-tsconfig-paths";

const tsconfigPaths = tsconfigPathsPlugin({
  // ...
});

export default defineWorkspace([
  {
    test: {
      name: "labs/demo-server",
      environment: "node",
      include: ["labs/demo-server/src/**/*.test.{ts,js}"],
      bail: 1,
    },
    plugins: [tsconfigPaths],
  },
]);
