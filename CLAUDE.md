# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands
- Build the plugin: `cargo build`
- Build JS bindings: `npm run build`
- Example app: `cd examples/tauri-app && cargo tauri dev`
- Run tests: `cargo test`
- Run single test: `cargo test <test_name>`
- Lint: `cargo clippy`
- Format: `cargo fmt`

## Code Style Guidelines
- Rust 2021 edition with minimum version 1.77.2
- Use thiserror for error types with #[error] annotations
- Follow Tauri plugin architecture patterns
- Type naming: PascalCase for types & structs, snake_case for functions
- Error handling: Use the crate's Result type with ? for propagation
- Platform-specific code: Use #[cfg(desktop)] and #[cfg(mobile)] attributes
- Imports: Group by external crates then internal modules
- Models use #[serde(rename_all = "camelCase")] for JS interoperability
- Documentation: Use /// for public API documentation

## Tauri Plugin Architecture Notes
- Plugin structure: Core Rust implementation with optional JS bindings
- Key files: lib.rs (setup), commands.rs (API), desktop.rs/mobile.rs (platform-specific)
- Commands are registered with `invoke_handler(tauri::generate_handler![...])`
- Use Builder pattern via `Builder::new("plugin-name")` for initialization
- Platform-specific code uses conditional compilation with #[cfg(desktop)] and #[cfg(mobile)]
- Permissions should be defined in permissions/default.toml

## Clerk Integration Notes
- Using `clerk-fapi-rs` crate to interact with Clerk Frontend API
- Client initialization pattern: 
  ```rust
  let config = ClerkFapiConfiguration::new(public_key, None, None);
  let clerk = Clerk::new(config).load().await?;
  ```
- Core authentication flow: create sign-in → attempt verification → manage session
- Implement singleton pattern with AppHandle state management
- Expose essential methods: sign in/out, session management, token retrieval
- Listen for auth state changes via event system
- Securely store tokens using Tauri's secure storage

## clerk-fapi-rs Usage
- Client initialization requires a public key (from Clerk dashboard)
- Authentication methods include email code verification flow
- Methods like `create_sign_in()` and `attempt_sign_in_factor_one()` handle auth
- Session management via `sign_out()` and `set_active()` methods 
- Reactive state with `add_listener()` for tracking auth changes

## Resources
- Tauri Plugin Development: https://v2.tauri.app/develop/plugins/
- Clerk Frontend SDK Development: https://clerk.com/docs/references/sdk/frontend-only
- clerk-fapi-rs: https://github.com/TheGrowthEngineeringCompany/clerk-fapi-rs