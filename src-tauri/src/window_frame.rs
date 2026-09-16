

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
