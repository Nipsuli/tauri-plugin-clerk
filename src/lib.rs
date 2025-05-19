use clerk_fapi_rs::{
    configuration::{ClientKind, Store as ClerkStateStore},
    models::{ClientPeriodClient, ClientPeriodOrganization, ClientPeriodSession, ClientPeriodUser},
    Clerk, ClerkFapiConfiguration,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime,
};

mod commands;

//
pub struct ClerkStoreInternal {
    pub clerk: Clerk,
}
pub type ClerkStore = RwLock<ClerkStoreInternal>;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the clerk APIs.
#[allow(async_fn_in_trait)]
pub trait ClerkExt<R: Runtime + Clone> {
    /// Get a reference to the Clerk instance
    fn clerk(&self) -> Clerk;

    ///
    async fn ensure_clerk_initialized(&self) -> Result<(), String>;
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClerkAuthEvent {
    client: ClientPeriodClient,
    session: Option<ClientPeriodSession>,
    user: Option<ClientPeriodUser>,
    organization: Option<ClientPeriodOrganization>,
}

fn clerk_auth_cb<R: Runtime + Clone>(
    app: AppHandle<R>,
    client: ClientPeriodClient,
    session: Option<ClientPeriodSession>,
    user: Option<ClientPeriodUser>,
    organization: Option<ClientPeriodOrganization>,
) {
    if let Err(e) = app.emit(
        "plugin:clerk|auth_cb",
        ClerkAuthEvent {
            client,
            session,
            user,
            organization,
        },
    ) {
        tracing::error!("Failed to emit clerk auth change: {e}");
    }
}

impl<R: Runtime + Clone, T: Manager<R>> crate::ClerkExt<R> for T {
    fn clerk(&self) -> Clerk {
        let app = self.app_handle();
        let clerk = {
            let app_clerk = app.state::<ClerkStore>();
            let app_clerk = app_clerk.read().unwrap();
            app_clerk.clerk.clone()
        };
        clerk
    }

    async fn ensure_clerk_initialized(&self) -> Result<(), String> {
        let app_handle = self.app_handle();
        let app_clerk_init_lock = app_handle.state::<ClerkInitLock>();
        let _app_clerk_init_lock = app_clerk_init_lock.lock().await;
        let clerk = self.clerk();
        if !clerk.loaded() {
            clerk.load().await?;
            let app_handle = app_handle.clone();
            clerk.add_listener(move |client, session, user, organization| {
                let app_handle_clone = app_handle.clone();
                clerk_auth_cb(app_handle_clone, client, session, user, organization);
            });
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct ClerkInitLockInner {}
pub type ClerkInitLock = tokio::sync::Mutex<ClerkInitLockInner>;

/// Builder for the Clerk plugin
#[derive(Default)]
pub struct ClerkPluginBuilder {
    /// Clerk publishable key
    pub publishable_key: Option<String>,
    /// Proxy URL
    pub proxy: Option<String>,
    /// Domain
    pub domain: Option<String>,
    /// Store
    pub store: Option<Arc<dyn ClerkStateStore>>,
}

impl ClerkPluginBuilder {
    /// Create a new builder instance
    pub fn new() -> Self {
        Default::default()
    }

    /// Set the Clerk publishable key
    pub fn publishable_key(mut self, key: impl Into<String>) -> Self {
        self.publishable_key = Some(key.into());
        self
    }

    /// Set the proxy URL
    pub fn proxy(mut self, proxy: impl Into<String>) -> Self {
        self.proxy = Some(proxy.into());
        self
    }

    /// Set the domain
    pub fn domain(mut self, domain: impl Into<String>) -> Self {
        self.domain = Some(domain.into());
        self
    }

    /// Set the store
    pub fn store(mut self, store: impl ClerkStateStore + 'static) -> Self {
        self.store = Some(Arc::new(store));
        self
    }

    /// Build the Tauri plugin
    pub fn build<R: Runtime + Clone>(self) -> TauriPlugin<R> {
        let publishable_key = self
            .publishable_key
            .or_else(|| std::env::var("CLERK_PUBLISHABLE_KEY").ok());

        Builder::new("clerk")
            .invoke_handler(tauri::generate_handler![commands::initialize])
            .setup(move |app, _api| {
                let config = ClerkFapiConfiguration::new_with_store(
                    publishable_key.clone().unwrap(),
                    self.proxy,
                    self.domain,
                    self.store,
                    None,
                    ClientKind::NonBrowser,
                )?;

                let clerk = Clerk::new(config);
                app.manage(RwLock::new(ClerkStoreInternal { clerk }));
                app.manage(tokio::sync::Mutex::new(ClerkInitLockInner::default()));
                Ok(())
            })
            .build()
    }
}

/// Initializes the plugin with default configuration.
pub fn init<R: Runtime + Clone>() -> TauriPlugin<R> {
    ClerkPluginBuilder::new().build()
}

/// Create a new builder for configuring the Clerk plugin
pub fn builder() -> ClerkPluginBuilder {
    ClerkPluginBuilder::new()
}
