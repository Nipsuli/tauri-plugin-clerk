use clerk_fapi_rs::models::{
    ClientPeriodClient, ClientPeriodOrganization, ClientPeriodSession, ClientPeriodUser,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};

const CLERK_AUTH_EVENT_NAME: &str = "plugin-clerk-auth-cb";

/// Need to be in sync with js side
#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClerkAuthEventPayload {
    pub client: ClientPeriodClient,
    pub session: Option<ClientPeriodSession>,
    pub user: Option<ClientPeriodUser>,
    pub organization: Option<ClientPeriodOrganization>,
}
#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClerkAuthEvent {
    // Window name or "rust" to identify sender
    source: String,
    payload: ClerkAuthEventPayload,
}

pub fn emit_clerk_auth_event<R: Runtime>(app: AppHandle<R>, payload: ClerkAuthEventPayload) {
    if let Err(e) = app.emit(
        CLERK_AUTH_EVENT_NAME,
        ClerkAuthEvent {
            source: "rust".to_string(),
            payload,
        },
    ) {
        tracing::error!("Failed to emit clerk auth change: {e}");
    }
}
