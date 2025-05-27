# Tauri Plugin clerk

Status: WIP, basic stuff works

Keeps the Client state in sync with rust and js allowing actions on
either side.

The platfrom agnostic Clerk FAPI in rust can be found from [here](https://github.com/TheGrowthEngineeringCompany/clerk-fapi-rs).

## Notes

- Requires `tauri_plugin_http` to be initialized
- Patches `globalThis.fetch` to be able to route Clerk calls via rust
