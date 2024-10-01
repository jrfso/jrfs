/** @file Vitest Root config. See https://vitest.dev/guide/config.html */
import { defineConfig } from "vitest/config";

// NOTE: Some options such as `bail` must also be set in `vitest.workspace.js`

export default defineConfig({
  test: {
    bail: 1,
    // Rerun ALL tests when any package/*/src/ file changes. See:
    // https://github.com/vitest-dev/vitest/issues/4997#issuecomment-1975394663
    forceRerunTriggers: [
      "**\/packages\/**\/src\/**",
      "**\/labs\/demo-app\/src\/**",
      "**\/labs\/demo-server\/src\/**",
    ],
  },
});
