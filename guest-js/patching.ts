import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

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

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

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

const parseTauriFetchBody = (
  obj: Json,
): { clientConfig: { [key: string]: Json } } => {
  if (
    obj &&
    typeof obj === "object" &&
    obj !== null &&
    "clientConfig" in obj &&
    typeof obj.clientConfig === "object" &&
    obj.clientConfig !== null &&
    !Array.isArray(obj.clientConfig)
  ) {
    return obj as { clientConfig: { [key: string]: Json } };
  }
  throw new Error("Invalid Tauri Fetch Body: no clientConfig");
};

const getHeadersFromTauriFetchBody = (body: {
  clientConfig: { [key: string]: Json };
}): [string, string][] => {
  if (
    "headers" in body.clientConfig &&
    Array.isArray(body.clientConfig.headers) &&
    body.clientConfig.headers.every(
      (v): v is [string, string] =>
        Array.isArray(v) &&
        v.length === 2 &&
        typeof v[0] === "string" &&
        typeof v[1] === "string",
    )
  ) {
    return body.clientConfig.headers;
  }
  throw new Error("Invalid Tauri Fetch Body: no headers");
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
    const rawBody = JSON.parse(init.body) as Json;
    const body = parseTauriFetchBody(rawBody);
    const existingHeaders = getHeadersFromTauriFetchBody(body);

    if (existingHeaders) {
      const headers = [
        ...existingHeaders,
        ["User-Agent", window.navigator.userAgent],
      ] as [string, string][];

      if (existingHeaders.some((h) => h[0] === "x-no-origin")) {
        headers.push(["Origin", ""]);
      } else {
        headers.push(["Origin", window.location.origin]);
      }

      initToPass = {
        ...init,
        body: JSON.stringify({
          body,
          clientConfig: {
            ...body.clientConfig,
            headers,
          },
        }),
      };
    }
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

let __internalIsPatched = false;

export const applyGlobalPatches = (): void => {
  if (__internalIsPatched) {
    return;
  }
  __internalIsPatched = true;
  // !!!! WE DO PATCH GLOBAL FETCH !!!!
  globalThis.fetch = patchFetch;
};
