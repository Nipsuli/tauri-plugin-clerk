// Import clerk-fapi-rs types
use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::Clerk;
#[cfg(mobile)]
use mobile::Clerk;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the clerk APIs.
pub trait ClerkExt<R: Runtime + Clone> {
  fn clerk(&self) -> &Clerk<R>;
}

impl<R: Runtime + Clone, T: Manager<R>> crate::ClerkExt<R> for T {
  fn clerk(&self) -> &Clerk<R> {
    self.state::<Clerk<R>>().inner()
  }
}

/// Builder for the Clerk plugin
pub struct ClerkPluginBuilder {
  /// Clerk publishable key
  pub publishable_key: Option<String>,
  /// Proxy URL
  pub proxy: Option<String>,
  /// Domain
  pub domain: Option<String>,
}

impl Default for ClerkPluginBuilder {
  fn default() -> Self {
    Self {
      publishable_key: None,
      proxy: None,
      domain: None,
    }
  }
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

  /// Build the Tauri plugin
  pub fn build<R: Runtime + Clone>(self) -> TauriPlugin<R> {
    let publishable_key = self.publishable_key;
    
    Builder::new("clerk")
      .invoke_handler(tauri::generate_handler![
        commands::ping,
        commands::initialize
      ])
      .setup(move |app, api| {
        #[cfg(mobile)]
        let clerk = mobile::init(app, api, publishable_key)?;
        #[cfg(desktop)]
        let clerk = desktop::init(app, api, publishable_key)?;
        app.manage(clerk);
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
