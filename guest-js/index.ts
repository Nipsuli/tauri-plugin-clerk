import { invoke } from "@tauri-apps/api/core";
import { ClientJSON } from "@clerk/types";

/**
 * We call initialize immediately on load to ensure the clerk client
 * is initialized
 */
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
