use crate::ClerkExt;
use clerk_fapi_rs::models::ClientPeriodClient;
use tauri::{command, AppHandle, Runtime};

#[command]
pub(crate) async fn initialize<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClientPeriodClient, String> {
    app.ensure_clerk_initialized().await?;
    app.clerk()
        .client()
        .ok_or("Clerk client not initialized".to_string())
}
