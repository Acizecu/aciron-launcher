

#[cfg(windows)]
pub fn strip_system_frame(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;

    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWCP_ROUND: u32 = 2;
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

    let Ok(hwnd) = window.hwnd() else { return };
    let hwnd = hwnd.0 as _;

    for (attr, value) in [
        (DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE),
        (DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND),
    ] {

        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                attr,
                &value as *const u32 as *const core::ffi::c_void,
                core::mem::size_of::<u32>() as u32,
            );
        }
    }
}

#[cfg(not(windows))]
pub fn strip_system_frame(_window: &tauri::WebviewWindow) {}

const CORNER_RADIUS: f64 = 16.0;

#[cfg(windows)]
pub fn apply_corner_region(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};

    let Ok(hwnd) = window.hwnd() else { return };
    let hwnd = hwnd.0 as _;
    let square = window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false);
    let Ok(size) = window.inner_size() else { return };
    let scale = window.scale_factor().unwrap_or(1.0);
    unsafe {
        if square || size.width == 0 || size.height == 0 {
            SetWindowRgn(hwnd, core::ptr::null_mut(), 1);
            return;
        }

        let d = (2.0 * CORNER_RADIUS * scale).round() as i32;
        let rgn = CreateRoundRectRgn(0, 0, size.width as i32 + 1, size.height as i32 + 1, d, d);
        if !rgn.is_null() {
            SetWindowRgn(hwnd, rgn, 1);
        }
    }
}

#[cfg(not(windows))]
pub fn apply_corner_region(_window: &tauri::WebviewWindow) {}
