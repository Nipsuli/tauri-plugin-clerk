import type {
  FapiRequestInit,
  FapiResponse,
} from "@clerk/clerk-js/dist/types/core/fapiClient";
import type {
  ClerkOptions,
  ClientJSON,
  ClientJSONSnapshot,
  EnvironmentJSON,
  EnvironmentJSONSnapshot,
  OrganizationJSON,
  SessionJSON,
  UserJSON,
} from "@clerk/types";
import { Clerk } from "@clerk/clerk-js";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import pkg from "../package.json";

/**
 * Need to keep in sync with rust
 */
type ClerkInitResponse = {
  environment: EnvironmentJSON;
  client: ClientJSON;
  publishableKey: string;
};

/**
 * Need to keep in sync with rust
 */
type ClerkAuthEventPayload = {
  client: ClientJSON;
  session: SessionJSON | null;
  user: UserJSON | null;
  organization: OrganizationJSON | null;
};
type ClerkAuthEvent = {
  // Window name or "rust"
  source: string;
  payload: ClerkAuthEventPayload;
};

listen<ClerkAuthEvent>("plugin-clerk-auth-cb", (event) => {
  const authEvent = event.payload;
  // TODO:
  // * update local client state from the event
  console.log("Received auth event", authEvent);
}).catch((e) => {
  console.error("Plugin:clerk: failed to initialize auth event listener", e);
});

let __internalClerk: Clerk | undefined;

export const init = async (initArgs: ClerkOptions) => {
  const { client, environment, publishableKey } =
    await invoke<ClerkInitResponse>("plugin:clerk|initialize");
  // TODO DomainOrProxy
  __internalClerk ??= new Clerk(publishableKey);
  // As the rust side can load the client and environment from
  // cache we can intitlize even when no network connection
  // similar to clerk-expo
  __internalClerk.__internal_getCachedResources = async () => ({
    client: client as ClientJSONSnapshot,
    environment: environment as EnvironmentJSONSnapshot,
  });

  __internalClerk.__unstable__onBeforeRequest(
    async (requestInit: FapiRequestInit) => {
      requestInit.credentials = "omit";
      requestInit.url?.searchParams.append("_is_native", "1");
      const jwt = await invoke<string | null>(
        "plugin:clerk|get_client_authorization_header",
      );
      (requestInit.headers as Headers).set("authorization", jwt || "");
      (requestInit.headers as Headers).set("x-mobile", "1");
    },
  );

  __internalClerk.__unstable__onAfterResponse(
    async (_: FapiRequestInit, response?: FapiResponse<any>) => {
      if (!response) {
        console.warn("No response in Fapi call");
        return;
      }
      const header = response.headers.get("authorization");
      if (header) {
        await invoke("plugin:clerk|get_client_authorization_header", {
          header,
        });
      }

      if (response.payload?.errors?.[0]?.code === "native_api_disabled") {
        console.error(
          "The Native API is disabled for this instance.\nGo to Clerk Dashboard > Configure > Native applications to enable it.\nOr, navigate here: https://dashboard.clerk.com/last-active?path=native-applications",
        );
      }
    },
  );

  await __internalClerk.load({
    ...initArgs,
    sdkMetadata: {
      name: pkg.name,
      version: pkg.version,
    },
    standardBrowser: false,
  });

  return __internalClerk;
};
