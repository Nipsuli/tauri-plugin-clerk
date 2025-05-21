import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ClientJSON,
  OrganizationJSON,
  SessionJSON,
  UserJSON,
} from "@clerk/types";

export const init = () => {
  invoke<ClientJSON>("plugin:clerk|initialize")
    .then((client) => {
      // TODO:
      // * we have clerk now initialized, setup Clerk to window object
      //   with all the needed bells and whistles
      console.log("Initialized clerk with", client);
    })
    .catch((e) => {
      console.error("Plugin:clerk: Failed to initialize Clerk", e);
    });

  type ClerkAuthCbEvent = {
    client: ClientJSON;
    session: SessionJSON | null;
    user: UserJSON | null;
    organization: OrganizationJSON | null;
  };

  listen<ClerkAuthCbEvent>("plugin-clerk-auth-cb", (event) => {
    const authEvent = event.payload;
    // TODO:
    // * update local client state from the event
    console.log("Received auth event", authEvent);
  }).catch((e) => {
    console.error("Plugin:clerk: failed to initialize auth event listener", e);
  });
};
