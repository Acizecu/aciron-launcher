

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn init(app: &AppHandle) {
    let open = match MenuItem::with_id(app, "open", crate::i18n::t("Open Aciron"), true, None::<&str>) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("[tray] menu item not created: {e}");
            return;
        }
    };
    let quit = match MenuItem::with_id(app, "quit", crate::i18n::t("Quit"), true, None::<&str>) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("[tray] menu item not created: {e}");
            return;
        }
    };
    let menu = match Menu::with_items(app, &[&open, &quit]) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[tray] menu not created: {e}");
            return;
        }
    };

    let built = TrayIconBuilder::with_id("aciron")
        .icon(app.default_window_icon().cloned().unwrap_or_else(|| {

            tauri::image::Image::new_owned(vec![0; 4], 1, 1)
        }))
        .tooltip("Aciron Launcher")
        .menu(&menu)

        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app);

    if let Err(e) = built {
        eprintln!("[tray] icon not created: {e}");
    }
}

#[tauri::command]
pub fn start_minimized() -> bool {
    std::env::args().any(|a| a == "--minimized")
}
