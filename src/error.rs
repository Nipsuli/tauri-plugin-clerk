use serde::{ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[cfg(mobile)]
  #[error(transparent)]
  PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
  
  #[error("Clerk initialization error: {0}")]
  Initialization(String),
  
  #[error("Clerk client is not initialized")]
  Uninitialized,
  
  #[error("Clerk API error: {0}")]
  ClerkApi(String),
  
  #[error("Authentication error: {0}")]
  Authentication(String),
}

impl Serialize for Error {
  fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
  where
    S: Serializer,
  {
    serializer.serialize_str(self.to_string().as_ref())
  }
}
