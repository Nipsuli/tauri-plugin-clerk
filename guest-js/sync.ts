import type {
  Clerk,
  ClientJSON,
  EnvironmentJSON,
  OrganizationJSON,
  SessionJSON,
  UserJSON,
} from "@clerk/types";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { logError, logger } from "./logger";

const __internalWindowLabel = getCurrentWindow().label;

//
// OBS!!!
// NEED TO STAY IN SYNC WITH RUST SIDE
//

type ClerkInitResponse = {
  environment: EnvironmentJSON;
  client: ClientJSON;
  publishableKey: string;
};

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

export const initListener = async (clerk: Clerk) => {
  await listen<ClerkAuthEvent>(CLERK_AUTH_EVENT_NAME, (event) => {
    const authEvent = event.payload;
    if (authEvent.source === __internalWindowLabel) {
      logger.info({ authEvent }, "Received auth event FROM SELF");
    } else {
      // set clerk client
      logger.info({ authEvent }, "Received auth event ELSEWHERE");
    }
  });
};

export const emitClerkAuthEvent = (payload: ClerkAuthEventPayload) => {
  logger.info({ payload }, "Emiting auth event");
  emit<ClerkAuthEvent>(CLERK_AUTH_EVENT_NAME, {
    source: __internalWindowLabel,
    payload,
  }).catch(logError("Plugin:clerk: failed to emit auth event"));
};

export const getInitArgs = () =>
  invoke<ClerkInitResponse>("plugin:clerk|initialize");

export const getClientJWT = () =>
  invoke<string | null>("plugin:clerk|get_client_authorization_header");

export const saveClientJWT = (header: string) =>
  invoke("plugin:clerk|set_client_authorization_header", {
    header,
  });
