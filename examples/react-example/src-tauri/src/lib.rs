use tauri::Manager;

// Compile time variable
pub const CLERK_PUBLIC_KEY: &str = env!("CLERK_PUBLISHABLE_KEY");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init()) // !!! Required !!!
        .plugin(tauri_plugin_store::Builder::new().build()) // Optional if one wants to use store
        .plugin(
            tauri_plugin_clerk::ClerkPluginBuilder::new()
                .publishable_key(CLERK_PUBLIC_KEY)
                .with_tauri_store() // Optional saves session over restarts
                .build(),
        )
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
