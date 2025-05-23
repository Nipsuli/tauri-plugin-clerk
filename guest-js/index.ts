import type {
  ClerkOptions,
  ClientJSON,
  ClientJSONSnapshot,
  EnvironmentJSONSnapshot,
  SessionJSON,
  UserJSON,
} from "@clerk/types";
import type {
  FapiRequestInit,
  FapiResponse,
} from "@clerk/clerk-js/dist/types/core/fapiClient";
import { Clerk } from "@clerk/clerk-js";

import { type Logger, logger, setLogger } from "./logger";
import {
  emitClerkAuthEvent,
  getClientJWT,
  getInitArgs,
  initListener,
  saveClientJWT,
} from "./sync";
import { applyGlobalPatches } from "./patching";

export type { Logger, LoggerParams } from "./logger";
export { consoleLogger, noopLogger } from "./logger";

// TODO: read from package.json
const sdkMetadata = {
  name: "tauri-plugin-clerk",
  version: "0.1.0",
};

//
// STATE
//

let __internalClerk: Clerk | null = null;

//
// MAIN ENTRY POINT
//

export const init = async (
  initArgs: ClerkOptions,
  intLogger?: Logger,
): Promise<Clerk> => {
  applyGlobalPatches();

  if (intLogger) {
    setLogger(intLogger);
  }

  const { client, environment, publishableKey } = await getInitArgs();

  const isNewInstance = !__internalClerk;
  // TODO
  // * DomainOrProxy
  // * check of publishable key if we want to allow hot swapping
  __internalClerk ??= new Clerk(publishableKey);

  if (isNewInstance) {
    await initListener(__internalClerk);
    // is new instance, let's add listener
    __internalClerk.addListener(
      ({ client, session, user, organization }): void => {
        // We do bit of casting, the XxxJSONSnapshot matches the XxxJSON forma
        // it's bit more relaxed, but has the same shape and types
        emitClerkAuthEvent({
          client: client.__internal_toSnapshot() as ClientJSON,
          session: (session?.__internal_toSnapshot() ??
            null) as SessionJSON | null,
          user: (user?.__internal_toSnapshot() ?? null) as UserJSON | null,
          organization: organization?.__internal_toSnapshot() ?? null,
        });
      },
    );
  }

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
      const jwt = await getClientJWT();
      (requestInit.headers as Headers).set("authorization", jwt || "");
      (requestInit.headers as Headers).set("x-mobile", "1");
      // our own flag to notify our fetch patching
      (requestInit.headers as Headers).set("x-no-origin", "1");
      (requestInit.headers as Headers).set("x-tauri-fetch", "1");
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
        await saveClientJWT(header);
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
    sdkMetadata,
    standardBrowser: false,
  });

  return __internalClerk;
};
