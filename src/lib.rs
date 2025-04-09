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
pub trait ClerkExt<R: Runtime> {
  fn clerk(&self) -> &Clerk<R>;
}

impl<R: Runtime, T: Manager<R>> crate::ClerkExt<R> for T {
  fn clerk(&self) -> &Clerk<R> {
    self.state::<Clerk<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("clerk")
    .invoke_handler(tauri::generate_handler![commands::ping])
    .setup(|app, api| {
      #[cfg(mobile)]
      let clerk = mobile::init(app, api)?;
      #[cfg(desktop)]
      let clerk = desktop::init(app, api)?;
      app.manage(clerk);
      Ok(())
    })
    .build()
}
