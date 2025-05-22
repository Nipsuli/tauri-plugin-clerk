use clerk_fapi_rs::{
    configuration::{ClientKind, Store as ClerkStateStore},
    models::{ClientPeriodClient, ClientPeriodOrganization, ClientPeriodSession, ClientPeriodUser},
    Clerk, ClerkFapiConfiguration,
};
use events::{emit_clerk_auth_event, ClerkAuthEventPayload};
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime,
};

mod commands;
mod events;

//
#[derive(Clone)]
pub struct ClerkStoreInternal {
    pub clerk: Clerk,
    pub publishable_key: String,
    // TODO: proxy or domain
}
pub type ClerkStore = RwLock<ClerkStoreInternal>;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the clerk APIs.
#[allow(async_fn_in_trait)]
pub trait ClerkExt<R: Runtime> {
    /// Get the whole clerk store
    fn clerk_store(&self) -> ClerkStoreInternal;
    /// Get the Clerk instance
    fn clerk(&self) -> Clerk;
    ///
    async fn ensure_clerk_initialized(&self) -> Result<(), String>;
}

fn clerk_auth_cb<R: Runtime>(
    app: AppHandle<R>,
    client: ClientPeriodClient,
    session: Option<ClientPeriodSession>,
    user: Option<ClientPeriodUser>,
    organization: Option<ClientPeriodOrganization>,
) {
    emit_clerk_auth_event(
        app,
        ClerkAuthEventPayload {
            client,
            session,
            user,
            organization,
        },
    )
}

impl<R: Runtime, T: Manager<R>> crate::ClerkExt<R> for T {
    fn clerk_store(&self) -> ClerkStoreInternal {
        let app = self.app_handle();
        let clerk_store = {
            let app_clerk = app.state::<ClerkStore>();
            let app_clerk = app_clerk.read();
            app_clerk.clone()
        };
        clerk_store
    }

    fn clerk(&self) -> Clerk {
        self.clerk_store().clerk
    }

    async fn ensure_clerk_initialized(&self) -> Result<(), String> {
        let app_handle = self.app_handle();
        let app_clerk_init_lock = app_handle.state::<ClerkInitLock>();
        let _app_clerk_init_lock = app_clerk_init_lock.lock().await;
        let clerk = self.clerk();
        if !clerk.loaded() {
            // Prefer cached resources, In case one uses persisted ClerkStore
            // we can load the resources from cache to support offline loading
            // TODO: in the clerk fapi rs add reload mechanism, so here in case
            // we ended up loading from cache we can trigger background task
            // to refresh the cache
            clerk.load(true).await.map_err(|e| e.to_string())?;
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
    // TODO: the proxy and domain should be
    // mutually exclusive
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
    pub fn build<R: Runtime>(self) -> TauriPlugin<R> {
        let publishable_key = self
            .publishable_key
            .or_else(|| std::env::var("CLERK_PUBLISHABLE_KEY").ok())
            .unwrap();

        Builder::<R>::new("clerk")
            .invoke_handler(tauri::generate_handler![
                commands::initialize,
                commands::get_client_authorization_header,
                commands::set_client_authorization_header
            ])
            .setup(move |app, _api| {
                let config = ClerkFapiConfiguration::new_with_store(
                    publishable_key.clone(),
                    self.proxy,
                    self.domain,
                    self.store,
                    None,
                    ClientKind::NonBrowser,
                )?;

                let clerk = Clerk::new(config);
                app.manage(RwLock::new(ClerkStoreInternal {
                    clerk,
                    publishable_key: publishable_key.clone(),
                }));
                app.manage(tokio::sync::Mutex::new(ClerkInitLockInner::default()));
                Ok(())
            })
            .build()
    }
}
