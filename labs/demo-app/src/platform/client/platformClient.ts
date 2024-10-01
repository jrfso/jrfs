import createClient from "openapi-fetch";
// Local
import type { components, paths } from "./api.gen";

export const platformClient = createClient<paths>({
  baseUrl: "/api/v1",
});

platformClient.use({
  onRequest({ request }) {
    if (request.method === "POST" && !request.body) {
      // Add a body to any post request missing one.
      return new Request(request, { body: "{}" });
    }
  },
});

declare global {
  type PlatformApiSchema = components["schemas"];
}


// Test

// setTimeout(async () => {
//   const result = await platformClient.POST("/project/repo/connect");
//   console.log("CONNECT", result);
// }, 1000);
