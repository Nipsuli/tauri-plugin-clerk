use tauri::{AppHandle, command, Runtime};

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
    // Get a reference to the clerk store
    let store = app.clerk_store();
    
    // Acquire a write lock on the store
    let mut store_guard = store.write().await;
    
    // Get a mutable reference to the clerk instance
    let clerk = &mut store_guard.clerk;
    
    // Initialize the clerk client with the provided parameters
    clerk.initialize(publishable_key, proxy, domain).await?;
    
    Ok(true)
}
