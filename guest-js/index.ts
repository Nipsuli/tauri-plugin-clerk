import type {
  ClerkOptions,
  ClientResource,
  ClientJSONSnapshot,
  EnvironmentJSONSnapshot,
  Without,
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
import {
  clerkClientToClientJSON,
  clerkOrganizationToOrganizationJSON,
  clerkSessionToSessionJSON,
  clerkUserToUserJSON,
} from "./clerk-utils";
import pkg from "../package.json";

export type { Logger, LoggerParams } from "./logger";
export { consoleLogger, noopLogger } from "./logger";

const sdkMetadata = {
  name: pkg.name,
  version: pkg.version,
};

//
// STATE
//

// Let's make the consumers types happy
// oxlint-disable-next-line typescript/consistent-type-definitions
interface HeadlessBrowserClerk extends Clerk {
  load: (opts?: Without<ClerkOptions, "isSatellite">) => Promise<void>;
  updateClient: (client: ClientResource) => void;
}

let __internalClerk: HeadlessBrowserClerk | null = null;

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
        emitClerkAuthEvent({
          client: clerkClientToClientJSON(client),
          session: session ? clerkSessionToSessionJSON(session) : null,
          user: user ? clerkUserToUserJSON(user) : null,
          organization: organization
            ? clerkOrganizationToOrganizationJSON(organization)
            : null,
        });
      },
    );
  }

  // As the rust side can load the client and environment from
  // cache we can intitlize even when no network connection
  // similar to clerk-expo
  // oxlint-disable-next-line eslint/require-await
  __internalClerk.__internal_getCachedResources = async () => ({
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
