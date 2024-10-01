import React from "react";
// Local
import { openRepo } from "@/platform";

export function AppView() {
  React.useEffect(() => {
    console.log("AppView: Starting up...");
    openRepo().then(() => {
      console.log("AppView: Started.");
    });
  }, []);
  return (
    <div style={styles.root}>
      <h1>Hello</h1>
      <p>&nbsp;</p>
      <p>Things are happening in the devtools right now...</p>
    </div>
  );
}

export type AppView = typeof AppView;

export default AppView;

const styles = {
  root: {
    alignItems: "center",
    color: "gainsboro",
    background: "linear-gradient(0deg, royalblue, darkorchid)",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    justifyContent: "center",
    width: "100vw",
  },
} satisfies Record<string, React.CSSProperties>;
