/** @file Renders the root component loaded by `./main` (from `./views`). */
import React from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline } from "@mui/material";
// Local
import type { AppView } from "@/app/AppView";
import StyledEngineProvider from "@/common/mui/StyledEngineProvider";
// import { ThemeProvider } from "@/common/mui/themes";

const container = document.getElementById("app-root");
if (!container) {
  throw new Error("Invalid document. Element with id 'app-root' not found.");
}
const root = createRoot(container);

function render(AppView: AppView) {
  const { VITE_STRICTMODE } = import.meta.env;
  const MaybeStrict =
    VITE_STRICTMODE === "false" ? React.Fragment : React.StrictMode;
  root.render(
    <MaybeStrict>
      <StyledEngineProvider injectFirst>
        {/* <ThemeProvider> */}
        <CssBaseline />
        <AppView />
        {/* </ThemeProvider> */}
      </StyledEngineProvider>
    </MaybeStrict>,
  );
}

export default render;
