/** @file The main loader entry-point for the app. */
// Common Feature modules
import "demo-shared/features/db";
// Common Local modules
import "@/platform";

/**
 * Gets the application chunks to load in parallel.
 *
 * `@/app/render` contains the main dependencies and providers of the base app.
 *  - React, ReactDom, ThemeProvider, StyledEngineProvider, MUI-core, etc.
 * `@/workbench/parts/root` contains the main structure of the base app.
 *
 * These are the two main chunks that are used to render the core structure of
 * the app. Importing them with `Promise.all` (by using HTTP/2 multiplexing) we
 * can load them in parallel and achieve the best possible performance.
 */
function getChunks(): [
  Promise<typeof import("@/app/render")>,
  Promise<typeof import("@/app/AppView")>,
] {
  return [
    // Main dependencies, providers, etc...
    import("@/app/render"),
    // App specific structure...
    import("@/app/AppView"),
  ];
}

Promise.all(getChunks()).then(([{ default: render }, { default: AppView }]) => {
  render(AppView);
});
