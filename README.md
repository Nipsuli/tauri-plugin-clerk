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
