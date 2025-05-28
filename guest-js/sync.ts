import type {
  ClientJSON,
  ClientResource,
  EnvironmentJSON,
  OrganizationJSON,
  SessionJSON,
  UserJSON,
} from "@clerk/types";
import type { Clerk } from "@clerk/clerk-js";

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

const shouldUpdate = (
  oldClient: ClientResource | undefined,
  newClient: ClientJSON,
) => {
  if (!oldClient) return true;
  if (oldClient.id !== newClient.id) return true;
  if (oldClient.lastActiveSessionId !== newClient.last_active_session_id)
    return true;

  const oldSessionIds = [...oldClient.sessions.map((s) => s.id)].sort();
  const newSessionIds = [...newClient.sessions.map((s) => s.id)].sort();

  if (oldSessionIds.length !== newSessionIds.length) return true;

  for (let i = 0; i < oldSessionIds.length; i++) {
    if (oldSessionIds[i] !== newSessionIds[i]) return true;
  }

  return false;
};

export const initListener = async (clerk: Clerk) => {
  await listen<ClerkAuthEvent>(CLERK_AUTH_EVENT_NAME, (event) => {
    const authEvent = event.payload;
    if (authEvent.source !== __internalWindowLabel) {
      logger.debug({ authEvent }, "Plugin:clerk: received auth event");
      if (shouldUpdate(clerk.client, authEvent.payload.client)) {
        logger.debug({ authEvent }, "Plugin:clerk: refreshing session");
        // need to figure out if we could just update the client
        // on the Clerk object, but there are lot of internal
        // things that do not work fine, so just pulling from api
        clerk.__internal_reloadInitialResources();
      }
    }
  });
};

export const emitClerkAuthEvent = (payload: ClerkAuthEventPayload) => {
  logger.debug({ payload }, "Plugin:clerk: emitting auth event");
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
