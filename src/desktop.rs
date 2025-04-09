use clerk_fapi_rs::clerk::Clerk as ClerkClient;
use clerk_fapi_rs::configuration::ClerkFapiConfiguration;
use serde::de::DeserializeOwned;
use std::sync::Arc;
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use tokio::sync::RwLock;

use crate::models::*;

pub fn init<R: Runtime + Clone, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
  publishable_key: Option<String>,
) -> crate::Result<Clerk<R>> {
  // Get the publishable key from environment if not provided
  let key = publishable_key.or_else(|| std::env::var("CLERK_PUBLISHABLE_KEY").ok());
  
  Ok(Clerk {
    app: app.clone(),
    publishable_key: key,
    clerk_client: None,
  })
}

/// Access to the clerk APIs.
#[derive(Clone)]
pub struct Clerk<R: Runtime + Clone> {
  pub app: AppHandle<R>,
  pub publishable_key: Option<String>,
  pub clerk_client: Option<Arc<RwLock<ClerkClient>>>,
}

impl<R: Runtime + Clone> Clerk<R> {
  /// Initialize the Clerk client.
  /// This needs to be called before using any other methods.
  pub async fn initialize(&mut self, key_override: Option<String>, proxy: Option<String>, domain: Option<String>) -> crate::Result<()> {
    // Use the override key if provided, otherwise use the stored key
    let has_override = key_override.is_some();
    let key = key_override.or_else(|| self.publishable_key.clone());
    
    if let Some(key) = key {
      // Update the stored key if we have an override
      if has_override {
        self.publishable_key = Some(key.clone());
      }
      
      // Create the Clerk client configuration
      let config = match ClerkFapiConfiguration::new(key, proxy, domain) {
        Ok(config) => config,
        Err(e) => return Err(crate::Error::Initialization(format!("Failed to create Clerk configuration: {}", e)))
      };
      
      // Create the Clerk client with the configuration
      let client = ClerkClient::new(config);
      let loaded_client = client.load().await.map_err(|e| {
        crate::Error::Initialization(format!("Failed to initialize Clerk client: {}", e))
      })?;
      
      self.clerk_client = Some(Arc::new(RwLock::new(loaded_client)));
      Ok(())
    } else {
      Err(crate::Error::Initialization("Clerk publishable key is not provided".into()))
    }
  }

  /// Get a reference to the Clerk client.
  /// Returns an error if the client is not initialized.
  pub async fn get_client(&self) -> crate::Result<Arc<RwLock<ClerkClient>>> {
    if let Some(client) = &self.clerk_client {
      Ok(client.clone())
    } else {
      Err(crate::Error::Uninitialized)
    }
  }

  /// Check if the client is initialized.
  pub fn is_initialized(&self) -> bool {
    self.clerk_client.is_some()
  }

  /// Ping the Clerk API.
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    Ok(PingResponse {
      value: payload.value,
    })
  }
}
