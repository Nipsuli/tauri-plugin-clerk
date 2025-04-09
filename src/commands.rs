use tauri::{AppHandle, Manager, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::ClerkExt;

#[command]
pub(crate) async fn ping<R: Runtime + Clone>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse> {
    app.clerk().ping(payload)
}

#[command]
pub(crate) async fn initialize<R: Runtime + Clone>(
    app: AppHandle<R>,
    publishable_key: Option<String>,
    proxy: Option<String>,
    domain: Option<String>,
) -> Result<bool> {
    // We need to get a mutable reference to state from the app
    // Since we can't directly mutate app state, we'll need to:
    // 1. Get a clone of the current state
    // 2. Modify that clone
    // 3. Replace the state with the modified clone
    
    // Step 1: Get current state (clerk instance)
    let clerk_state = app.state::<crate::Clerk<R>>();
    let mut clerk = clerk_state.inner().clone();
    
    // Step 2: Initialize the clerk client (this modifies our local clone)
    clerk.initialize(publishable_key, proxy, domain).await?;
    
    // Step 3: Replace the app state with our updated clone
    // This drops the existing state and manages the new one
    app.manage(clerk);
    
    Ok(true)
}
