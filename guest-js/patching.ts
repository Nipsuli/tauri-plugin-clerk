import z from "zod";
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

let __internalIsPatched = false;

export const applyGlobalPatches = () => {
  if (__internalIsPatched) {
    return;
  }
  __internalIsPatched = true;
  // !!!! WE DO PATCH GLOBAL FETCH !!!!
  globalThis.fetch = patchFetch;
};
