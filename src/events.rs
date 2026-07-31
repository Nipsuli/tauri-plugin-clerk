use clerk_fapi_rs::models::{ClientClient, ClientOrganization, ClientSession, ClientUser};
use log::debug;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};

pub const CLERK_AUTH_EVENT_NAME: &str = "plugin-clerk-auth-cb";
pub const RUST_EVENT_SOURCE: &str = "rust";

/// Need to be in sync with ClerkAuthEventPayload in
/// guest-js/sync.ts
#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClerkAuthEventPayload {
    pub client: ClientClient,
    pub session: Option<ClientSession>,
    pub user: Option<ClientUser>,
    pub organization: Option<ClientOrganization>,
}
/// Need to be in sync with ClerkAuthEvent in
/// guest-js/sync.ts
#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClerkAuthEvent {
    // Window name or "rust" to identify sender
    pub source: String,
    pub payload: ClerkAuthEventPayload,
}

pub fn emit_clerk_auth_event<R: Runtime>(app: AppHandle<R>, payload: ClerkAuthEventPayload) {
    debug!("Emitting Clerk auth state change");

    if let Err(e) = app.emit(
        CLERK_AUTH_EVENT_NAME,
        ClerkAuthEvent {
            source: RUST_EVENT_SOURCE.to_string(),
            payload,
        },
    ) {
        tracing::error!("Failed to emit clerk auth change: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::ClerkAuthEvent;
    use serde_json::{json, Value};

    fn organization_json() -> Value {
        json!({
            "object": "organization",
            "id": "org_moonfire",
            "name": "Moonfire",
            "slug": "moonfire",
            "image_url": "https://example.test/moonfire.png",
            "has_image": true,
            "members_count": 2,
            "pending_invitations_count": 1,
            "max_allowed_memberships": 10,
            "admin_delete_enabled": true,
            "public_metadata": {},
            "created_at": 1_700_000_000,
            "updated_at": 1_700_000_100
        })
    }

    fn public_user_data_json() -> Value {
        json!({
            "first_name": "Ada",
            "last_name": "Lovelace",
            "image_url": "https://example.test/ada.png",
            "has_image": true,
            "identifier": "ada@example.test",
            "user_id": "user_ada"
        })
    }

    fn user_json() -> Value {
        json!({
            "object": "user",
            "id": "user_ada",
            "external_id": null,
            "primary_email_address_id": "email_ada",
            "primary_phone_number_id": null,
            "primary_web3_wallet_id": null,
            "image_url": "https://example.test/ada.png",
            "has_image": true,
            "username": null,
            "email_addresses": [{
                "object": "email_address",
                "id": "email_ada",
                "email_address": "ada@example.test",
                "reserved": false,
                "verification": null,
                "linked_to": [{
                    "object": "",
                    "id": "idn_google",
                    "type": "oauth_google"
                }],
                "matches_sso_connection": false,
                "created_at": 0,
                "updated_at": 0
            }],
            "phone_numbers": [],
            "web3_wallets": [],
            "passkeys": [],
            "organization_memberships": [{
                "object": "organization_membership",
                "id": "orgmem_ada",
                "organization": organization_json(),
                "permissions": ["org:sys_profile:read"],
                "public_metadata": {},
                "public_user_data": public_user_data_json(),
                "role": "org:member",
                "role_name": "Member",
                "created_at": 1_700_000_200,
                "updated_at": 1_700_000_300
            }],
            "external_accounts": [],
            "saml_accounts": [],
            "password_enabled": true,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "totp_enabled": false,
            "backup_code_enabled": false,
            "two_factor_enabled": false,
            "public_metadata": {},
            "unsafe_metadata": {},
            "last_sign_in_at": 1_700_000_400,
            "banned": false,
            "locked": false,
            "lockout_expires_in_seconds": null,
            "verification_attempts_remaining": null,
            "last_active_at": null,
            "mfa_enabled_at": null,
            "mfa_disabled_at": null,
            "create_organization_enabled": false,
            "create_organizations_limit": 0,
            "delete_self_enabled": false,
            "legal_accepted_at": null,
            "created_at": 1_700_000_000,
            "updated_at": 1_700_000_500
        })
    }

    fn session_json(user: Value) -> Value {
        json!({
            "object": "session",
            "id": "sess_ada",
            "status": "active",
            "factor_verification_age": [3, -1],
            "expire_at": 1_700_003_600,
            "abandon_at": 1_700_007_200,
            "last_active_at": 1_700_000_600,
            "last_active_token": {
                "object": "token",
                "jwt": "test-session-jwt"
            },
            "last_active_organization_id": "org_moonfire",
            "actor": null,
            "tasks": null,
            "user": user,
            "public_user_data": public_user_data_json(),
            "created_at": 1_700_000_000,
            "updated_at": 1_700_000_600
        })
    }

    #[test]
    fn deserializes_signed_in_javascript_auth_event() {
        let user = user_json();
        let session = session_json(user.clone());
        let event = json!({
            "source": "main",
            "payload": {
                "client": {
                    "object": "client",
                    "id": "client_ada",
                    "sessions": [session.clone()],
                    "sign_in": null,
                    "sign_up": null,
                    "last_active_session_id": "sess_ada",
                    "cookie_expires_at": 1_700_086_400,
                    "captcha_bypass": false,
                    "created_at": 1_700_000_000,
                    "updated_at": 1_700_000_600
                },
                "session": session,
                "user": user,
                "organization": organization_json()
            }
        });

        let parsed: ClerkAuthEvent = serde_json::from_value(event)
            .expect("the JavaScript auth snapshot must match clerk-fapi-rs");

        assert_eq!(parsed.payload.client.id, "client_ada");
        assert_eq!(parsed.payload.client.sessions.len(), 1);
        assert_eq!(parsed.payload.user.expect("signed-in user").id, "user_ada");
        assert_eq!(
            parsed.payload.organization.expect("active organization").id,
            "org_moonfire"
        );
    }
}
