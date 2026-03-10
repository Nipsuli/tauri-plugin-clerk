import type {
  ClerkAPIErrorJSON,
  ClerkOptions,
  ClerkUIConstructor,
  ClientJSON,
  ClientJSONSnapshot,
  EnvironmentJSONSnapshot,
} from "@clerk/shared/types";
import { Clerk } from "@clerk/clerk-js";
import { loadClerkUIScript } from "@clerk/shared/loadClerkJsScript";

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
import { name, version } from "../package.json";

export type { Logger, LoggerParams } from "./logger";
export { consoleLogger, noopLogger } from "./logger";

type FapiResponse<T> = Response & {
  payload: FapiResponseJSON<T> | null;
};

interface FapiResponseJSON<T> {
  response: T;
  client?: ClientJSON;
  errors?: ClerkAPIErrorJSON[];
  meta?: {
    client?: ClientJSON;
    session_id?: string;
  };
}

type FapiRequestInit = RequestInit & {
  path?: string;
  search?: ConstructorParameters<typeof URLSearchParams>[0];
  sessionId?: string;
  rotatingTokenNonce?: string;
  pathPrefix?: string;
  url?: URL;
};

const sdkMetadata = {
  name,
  version,
};

//
// STATE
//

let __internalClerk: Clerk | null = null;

//
// MAIN ENTRY POINT
//

export const initClerk = async (
  initArgs?: ClerkOptions,
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
  // TODO: figure out why this doesn't work as expected, setting
  // experimental: {
  //  ...initArgs?.experimental,
  //  rethrowOfflineNetworkErrors: true,
  //},
  // on the clerk.load fails on other errors
  //
  // oxlint-disable-next-line eslint/require-await
  __internalClerk.__internal_getCachedResources = async () => ({
    client: client as ClientJSONSnapshot,
    environment: environment as EnvironmentJSONSnapshot,
  });

  // In Core 3 (@clerk/clerk-js v6), UI components are no longer bundled
  // with the main clerk-js ESM module. They must be loaded separately
  // from CDN and explicitly passed to clerk.load() via the ui option.
  let clerkUI: ClerkUIConstructor | undefined;
  try {
    await loadClerkUIScript({ publishableKey });
    clerkUI = (
      window as Window & { __internal_ClerkUICtor?: ClerkUIConstructor }
    ).__internal_ClerkUICtor;
  } catch (e) {
    logger.warn(
      { error: e },
      "Plugin:clerk: Failed to load Clerk UI components from CDN. " +
        "Pre-built UI components (SignIn, UserButton, etc.) will not be available.",
    );
  }

  __internalClerk.__internal_onBeforeRequest(
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

  __internalClerk.__internal_onAfterResponse(
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

  const loadOptions: ClerkOptions = {
    ...initArgs,
    sdkMetadata,
    standardBrowser: false,
  };
  if (clerkUI) {
    loadOptions.ui = { ClerkUI: clerkUI };
  }
  await __internalClerk.load(loadOptions);

  return __internalClerk;
};
