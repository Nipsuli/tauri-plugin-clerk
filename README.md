# Tauri Plugin clerk

Status: works, see `examples/react-example` is in use in production at [reconfigured](https://reconfigured.io/)

Keeps the Client state in sync with rust and js allowing actions on either side.

The platfrom agnostic Clerk FAPI in rust can be found from [here](https://github.com/Nipsuli/clerk-fapi-rs).

## Notes

- Requires `tauri_plugin_http` to be initialized
- Patches `globalThis.fetch` to be able to route Clerk calls via rust
- OAuth flows do not work. Haven't figured out a good way to do those in Tauri
