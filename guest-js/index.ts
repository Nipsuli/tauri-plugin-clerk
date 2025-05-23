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
import type {
  FapiRequestInit,
  FapiResponse,
} from "@clerk/clerk-js/dist/types/core/fapiClient";

import { Clerk } from "@clerk/clerk-js";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import pkg from "../package.json";

export type LoggerParams = { [key: string]: unknown };

export type Logger = {
  info: (params: LoggerParams, message: string) => void;
  warn: (params: LoggerParams, message: string) => void;
  error: (params: LoggerParams, message: string) => void;
};

export const consoleLogger = (): Logger => ({
  error: (params: LoggerParams, message: string): void =>
    console.error(message, params), // oxlint-disable-line no-console
  info: (params: LoggerParams, message: string): void =>
    console.info(message, params), // oxlint-disable-line no-console
  warn: (params: LoggerParams, message: string): void =>
    console.warn(message, params), // oxlint-disable-line no-console
});

export const noopLogger = (): Logger => ({
  error: (_params: LoggerParams, _message: string): void => {}, // oxlint-disable-line no-empty-function
  info: (_params: LoggerParams, _message: string): void => {}, // oxlint-disable-line no-empty-function
  warn: (_params: LoggerParams, _message: string): void => {}, // oxlint-disable-line no-empty-function
});

let logger = consoleLogger();

export const setLogger = (newLogger: Logger): void => {
  logger = newLogger;
};

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

listen<ClerkAuthEvent>("plugin-clerk-auth-cb", (event): void => {
  const authEvent = event.payload;
  // TODO:
  // * update local client state from the event
  logger.info({ authEvent }, "Received auth event");
}).catch((error): void => {
  logger.error(
    { error },
    "Plugin:clerk: failed to initialize auth event listener",
  );
});

let __internalClerk: Clerk | null = null;

export const init = async (initArgs: ClerkOptions): Promise<Clerk> => {
  const { client, environment, publishableKey } =
    await invoke<ClerkInitResponse>("plugin:clerk|initialize");
  // TODO DomainOrProxy
  __internalClerk ??= new Clerk(publishableKey);
  // As the rust side can load the client and environment from
  // cache we can intitlize even when no network connection
  // similar to clerk-expo
  // oxlint-disable-next-line eslint/require-await
  __internalClerk.__internal_getCachedResources = async (): Promise<{
    client: ClientJSONSnapshot;
    environment: EnvironmentJSONSnapshot;
  }> => ({
    client: client as ClientJSONSnapshot,
    environment: environment as EnvironmentJSONSnapshot,
  });

  __internalClerk.__unstable__onBeforeRequest(
    async (requestInit: FapiRequestInit): Promise<void> => {
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
    // in this case we need to use any due Clerks internal typings
    // oxlint-disable-next-line typescript/no-explicit-any
    async (_: FapiRequestInit, response?: FapiResponse<any>): Promise<void> => {
      if (!response) {
        logger.warn({}, "No response in Fapi call");
        return;
      }
      const header = response.headers.get("authorization");
      if (header) {
        await invoke("plugin:clerk|get_client_authorization_header", {
          header,
        });
      }

      if ("native_api_disabled" === response.payload?.errors?.[0]?.code) {
        // This error we want to push always, even if one would have
        // used noopLogger or any other custom logger
        // oxlint-disable-next-line no-console
        console.error(
          "The Native API is disabled for this instance.\n",
          "Go to Clerk Dashboard > Configure > Native applications to enable it.\n",
          "Or, navigate here: https://dashboard.clerk.com/last-active?path=native-applications",
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
