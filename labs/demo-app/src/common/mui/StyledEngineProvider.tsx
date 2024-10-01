/**
 * @file Modified MUI `StyledEngineProvider` to use `compat` mode in the default
 * Emotion styling enging, to disable SSR warnings.
 *
 * Original file:
 * - https://github.com/mui/material-ui/blob/07a4824f261561e878ac03e1c96c33e2774eba7d/packages/mui-styled-engine/src/StyledEngineProvider/StyledEngineProvider.js
 */
import React from "react";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";

// prepend: true moves MUI styles to the top of the <head> so they're loaded first.
// It allows developers to easily override MUI styles with other styling solutions, like CSS modules.
let cache: ReturnType<typeof createCache> | undefined;
if (typeof document === "object") {
  cache = createCache({ key: "css", prepend: true });
  // See https://github.com/mui/material-ui/issues/36763#issuecomment-1500106406
  cache.compat = true;
}

export default function StyledEngineProvider(
  props: React.PropsWithChildren<{
    /**
     * By default, the styles are injected last in the <head> element of the page.
     * As a result, they gain more specificity than any other style sheet.
     * If you want to override MUI's styles, set this prop.
     */
    injectFirst?: boolean;
  }>,
) {
  const { injectFirst, children } = props;
  return injectFirst && cache ? (
    <CacheProvider value={cache}>{children}</CacheProvider>
  ) : (
    children
  );
}
