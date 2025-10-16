# Tauri Plugin clerk

Status: works, see `examples/react-example`
This is in use in production at [reconfigured](https://reconfigured.io/)

The platfrom agnostic Clerk FAPI in rust can be found from [here](https://github.com/Nipsuli/clerk-fapi-rs).

## Core Idea

The Javascript side of Clerk is the one that orchestrates everyting but the auth
state is propagated to Rust side as well so one can get the current auth state
in rust code as well. The syncing of client state from rust side back to javascript
is still in the works.

One can use the js side Clerk functionality almost as in browser environment.

Some limitations:

- OAuth flows do not work in the default singin component. Haven't figured out
  a good way to do those in Tauri, one might be able to build custom auth flow
  for that, haven't tested yet.
- Magic links don't work, haven't figured out a way to make those work in Tauri
- DomainOrProxy is not yet implemented

## Notes

Due to some limitations of Tauri platform:

- Requires `tauri_plugin_http` to be initialized
- This package patches `globalThis.fetch` to be able to route Clerk calls via rust

## Usage

Rust side

```rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let clerk_publishable_key = todo!("Load the way you want");

    tauri::Builder::default()
        // needed for the request routing
        .plugin(tauri_plugin_http::init())
        // Optional if one wants to persist the auth state
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_clerk::ClerkPluginBuilder::new()
                .publishable_key(clerk_publishable_key)
                // Optional if one wants to persist the auth state
                .with_tauri_store()
                .build(),
        )
        // All the other plugins etc
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Client with React

```tsx
import type { Clerk } from "@clerk/clerk-js";
import { ClerkProvider } from "@clerk/clerk-react";
import { initClerk } from "tauri-plugin-clerk";

const App = () => {
  const clerkPromise = initClerk();
  return (
    <Suspense fallback={<div>loading...</div>}>
      <AppWithClerk clerkPromise={clerkPromise} />
    </Suspense>
  );
};

const AppLoaded = ({ clerkPromise }: { clerkPromise: Promise<Clerk> }) => {
  const clerk = use(clerkPromise);
  return (
    <ClerkProvider publishableKey={clerk.publishableKey} Clerk={clerk}>
      <ActualApp />
    </ClerkProvider>
  );
};
```

See examples for more

## Why this package works the way it does?

As tauri uses native webwiev (=browser) the first question easily is why is this
package needed? The reason why one cannot use the default clerk web packages is
how web views on different platform deals with cookies. Example on mac cookies do
not work on custom domains such as Tauri uses. One way around this is to patch
`document.cookies` but that leaves the authenticated state only on the client
side. Another solution is to have the the authentication state fully on rust side
and for that there is [clerk-fapi-rs](https://crates.io/crates/clerk-fapi-rs)
which works well with Tauri.

The solution this package takes is to patch global fetch and pipe fetch calls that
have `x-tauri-fetch` header through [tauri-plugin-http](https://crates.io/crates/tauri-plugin-http)
this is because of the limitations of the the API resulting in error like:

```json
{
  "errors": [
    {
      "message": "Setting both the 'Origin' and 'Authorization' headers is forbidden",
      "long_message": "For security purposes, only one of the 'Origin' and 'Authorization' headers should be provided, but not both. In browser contexts, the 'Origin' header is set automatically by the browser. In native application contexts (e.g. mobile apps), set the 'Authorization' header.",
      "code": "origin_authorization_headers_conflict"
    }
  ],
  "clerk_trace_id": "..."
}
```

By patching the global fetch to direct api calls through rust we can use the Clerk
javascript package as is and hook to the `onBeforeRequest` and `onAfterResponse`
hooks similarly as in the clerk expo package does. In addition this package allows
one to persist the Clerk session on disk to maintain the login state.
