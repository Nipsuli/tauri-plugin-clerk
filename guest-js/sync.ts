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

/**
 * Need to stay in sync with ClerkInitResponse in
 * src/commands.rs
 */
type ClerkInitResponse = {
  environment: EnvironmentJSON;
  client: ClientJSON;
  publishableKey: string;
};

/**
 * Need to stay in sync with ClerkAuthEventPayload in
 * src/events.rs
 */
type ClerkAuthEventPayload = {
  client: ClientJSON;
  session: SessionJSON | null;
  user: UserJSON | null;
  organization: OrganizationJSON | null;
};
/**
 * Need to stay in sync with ClerkAuthEvent in
 * src/events.rs
 */
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
  if (!oldClient) {
    return true;
  }
  if (oldClient.id !== newClient.id) {
    return true;
  }
  if (oldClient.lastActiveSessionId !== newClient.last_active_session_id) {
    return true;
  }

  const oldSessionIds = oldClient.sessions
    .map((session) => session.id)
    .toSorted();
  const newSessionIds = newClient.sessions
    .map((session) => session.id)
    .toSorted();

  if (oldSessionIds.length !== newSessionIds.length) {
    return true;
  }

  for (let i = 0; i < oldSessionIds.length; i++) {
    if (oldSessionIds[i] !== newSessionIds[i]) {
      return true;
    }
  }

  return false;
};

export const initListener = async (clerk: Clerk): Promise<void> => {
  await listen<ClerkAuthEvent>(CLERK_AUTH_EVENT_NAME, (event) => {
    const authEvent = event.payload;
    if (authEvent.source !== __internalWindowLabel) {
      logger.debug({ authEvent }, "Plugin:clerk: received auth event");
      if (shouldUpdate(clerk.client, authEvent.payload.client)) {
        logger.debug({}, "Plugin:clerk: refreshing session");
        // TODO: figure out how to sync Clerk state from
        // rust side. For now the JS side is the one driving
        // this story
      }
    }
  });
};

export const emitClerkAuthEvent = (payload: ClerkAuthEventPayload): void => {
  logger.debug({ payload }, "Plugin:clerk: emitting auth event");
  emit<ClerkAuthEvent>(CLERK_AUTH_EVENT_NAME, {
    source: __internalWindowLabel,
    payload,
  }).catch(logError("Plugin:clerk: failed to emit auth event"));
};

export const getInitArgs = (): Promise<ClerkInitResponse> =>
  invoke<ClerkInitResponse>("plugin:clerk|initialize");

export const getClientJWT = (): Promise<string | null> =>
  invoke<string | null>("plugin:clerk|get_client_authorization_header");

export const saveClientJWT = async (header: string): Promise<void> => {
  await invoke("plugin:clerk|set_client_authorization_header", {
    header,
  });
};
