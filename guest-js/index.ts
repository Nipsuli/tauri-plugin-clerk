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

import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import z from "zod";

// TODO: read from package.json
const sdkMetadata = {
  name: "tauri-plugin-clerk",
  version: "0.1.0",
};

//
// LOGGER
//

export type LoggerParams = { [key: string]: unknown };

export type Logger = {
  info: (params: LoggerParams, message: string) => void;
  warn: (params: LoggerParams, message: string) => void;
  error: (params: LoggerParams & { error: Error }, message: string) => void;
};

export const consoleLogger = (): Logger => ({
  info: (params, message) => console.info(message, params), // oxlint-disable-line no-console
  warn: (params, message) => console.warn(message, params), // oxlint-disable-line no-console
  error: ({ error, ...params }, message) =>
    console.error(message, error, params), // oxlint-disable-line no-console
});

export const noopLogger = (): Logger => ({
  info: (_params, _message) => {}, // oxlint-disable-line no-empty-function
  warn: (_params, _message): void => {}, // oxlint-disable-line no-empty-function
  error: (_params, _message) => {}, // oxlint-disable-line no-empty-function
});

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  } else if (typeof error === "string") {
    return new Error(error);
  } else {
    return new Error(JSON.stringify(error));
  }
};

const logError = (message: string) => (error: unknown) =>
  __internalLogger.error({ error: toError(error) }, message);

export const setLogger = (newLogger: Logger): void => {
  __internalLogger = newLogger;
};

//
// PATCHING
//
// To code around some Clerk limitations we're piping
// clerk requests through rust
//
const realFetch = globalThis.fetch;

type Fetch = typeof realFetch;
type FetchReturn = ReturnType<Fetch>;
type FetchArgs = Parameters<Fetch>;

const RequestInitSchema = z
  .object({
    clientConfig: z.object({
      url: z.string(),
      headers: z.array(z.tuple([z.string(), z.string()])),
      // We only care about headers and url
      method: z.string(),
      data: z.any(),
      maxRedirections: z.any(),
      connectTimeout: z.any(),
      proxy: z.any(),
    }),
  })
  .strict();

const urlForRequestInput = (input: FetchArgs[0]) =>
  typeof input === "string"
    ? new URL(input)
    : input instanceof URL
      ? input
      : new URL(input.url);

const runTauriFetch = async (input: FetchArgs[0], init: FetchArgs[1]) => {
  const req = new Request(input, init);
  const res = await tauriFetch(req);
  return res;
};

const shouldRunTauriFetch = (input: FetchArgs[0], init: FetchArgs[1]) => {
  const initHeaders = init?.headers;

  if (initHeaders) {
    if (initHeaders instanceof Headers) {
      return initHeaders.has("x-tauri-fetch");
    } else if (Array.isArray(initHeaders)) {
      return initHeaders.some((h) => h[0] === "x-tauri-fetch");
    } else {
      return !!initHeaders["x-tauri-fetch"];
    }
  }

  if (input instanceof Request) {
    return input.headers.has("x-tauri-fetch");
  }
  return false;
};

const runRealFetch = async (input: FetchArgs[0], init: FetchArgs[1]) => {
  // tauri-plugin-http uses plain fetch so we here indentify
  // if we should modify the request headers that are sent
  // via tauri fetch
  const url = urlForRequestInput(input);
  const path = decodeURIComponent(url.pathname);
  const shouldInjectHeaders = path === "/plugin:http|fetch";

  let initToPass = init;

  if (shouldInjectHeaders && typeof init?.body === "string") {
    const rawBody = JSON.parse(init.body) as unknown;
    const body = RequestInitSchema.parse(rawBody);
    const headers = [
      ...body.clientConfig.headers,
      ["User-Agent", window.navigator.userAgent],
    ];

    if (body.clientConfig.headers.some((h) => h[0] === "x-no-origin")) {
      headers.push(["Origin", ""]);
    } else {
      headers.push(["Origin", window.location.origin]);
    }

    initToPass = {
      ...init,
      body: JSON.stringify({
        ...body,
        clientConfig: {
          ...body.clientConfig,
          headers,
        },
      }),
    };
  }

  const res = await realFetch(input, initToPass);

  return res;
};

const patchFetch = async (
  input: FetchArgs[0],
  init: FetchArgs[1],
): FetchReturn => {
  if (shouldRunTauriFetch(input, init)) {
    return await runTauriFetch(input, init);
  } else {
    return await runRealFetch(input, init);
  }
};

// !!!! WE DO PATCH GLOBAL FETCH !!!!
globalThis.fetch = patchFetch;

//
// STATE
//
let __internalLogger: Logger = consoleLogger();
let __internalClerk: Clerk | null = null;
let __internalWindowLabel = getCurrentWindow().label;

//
// COMMUNICATION WITH RUST
//
// OBS!!!
// NEED TO STAY IN SYNC WITH RUST SIDE
//

type ClerkInitResponse = {
  environment: EnvironmentJSON;
  client: ClientJSON;
  publishableKey: string;
};

const getInitArgs = () => invoke<ClerkInitResponse>("plugin:clerk|initialize");
const getClientJWT = () =>
  invoke<string | null>("plugin:clerk|get_client_authorization_header");
const saveClientJWT = (header: string) =>
  invoke("plugin:clerk|set_client_authorization_header", {
    header,
  });

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

const CLERK_AUTH_EVENT_NAME = "plugin-clerk-auth-cb";

listen<ClerkAuthEvent>(CLERK_AUTH_EVENT_NAME, (event) => {
  const authEvent = event.payload;
  // TODO:
  // * update local client state from the event
  __internalLogger.info({ authEvent }, "Received auth event");
}).catch(logError("Plugin:clerk: failed to initialize auth event listener"));

const emitClerkAuthEvent = (payload: ClerkAuthEventPayload) => {
  emit<ClerkAuthEvent>(CLERK_AUTH_EVENT_NAME, {
    source: __internalWindowLabel,
    payload,
  }).catch(logError("Plugin:clerk: failed to emit auth event"));
};

//
// MAIN ENTRY POINT
//

export const init = async (
  initArgs: ClerkOptions,
  logger?: Logger,
): Promise<Clerk> => {
  if (logger) {
    setLogger(logger);
  }

  const { client, environment, publishableKey } = await getInitArgs();

  const isNewInstance = !__internalClerk;
  // TODO
  // * DomainOrProxy
  // * check of publishable key if we want to allow hot swapping
  __internalClerk ??= new Clerk(publishableKey);

  if (isNewInstance) {
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
        __internalLogger.warn({}, "No response in Fapi call");
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
