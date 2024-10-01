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
  return <div>Hello</div>;
}

export type AppView = typeof AppView;

export default AppView;
