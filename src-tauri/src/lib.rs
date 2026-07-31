mod accounts;
mod aciron;
mod builds;
mod cancel;
mod curseforge;
mod discord;
mod forge;
mod ftb;
mod importer;
mod launcher;
mod microsoft;
mod modrinth;
mod presence;
mod recents;
mod secret;
mod servers;
mod settings;
mod social;
mod update;
mod wardrobe;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()

        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {

            std::thread::spawn(discord::init);

            tauri::async_runtime::spawn(presence::heartbeat_loop());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            settings::default_settings,
            settings::detect_java,
            settings::open_folder,
            settings::move_directories,
            settings::data_migration_pending,
            settings::migrate_data,
            settings::hardware_capable,
            settings::total_ram_mb,
            launcher::launch_game,
            launcher::launch_build,
            launcher::stop_game,
            launcher::list_versions,
            launcher::get_installed_versions,
            recents::get_recents,
            recents::remove_recent,
            launcher::add_installed_version,
            launcher::remove_installed_version,
            accounts::get_accounts,
            accounts::add_offline_account,
            accounts::remove_account,
            accounts::set_active_account,
            microsoft::add_microsoft_account,
            aciron::aciron_login,
            aciron::aciron_register,
            aciron::aciron_verify_email,
            aciron::aciron_resend_code,
            aciron::aciron_link_license,
            social::friends_list,
            social::friend_request,
            social::friend_respond,
            social::friend_cancel,
            social::friend_remove,
            social::set_presence_status,
            social::set_accept_requests,
            wardrobe::wardrobe_list,
            wardrobe::wardrobe_add,
            wardrobe::read_texture,
            wardrobe::wardrobe_apply,
            wardrobe::wardrobe_delete,
            wardrobe::wardrobe_rename,
            wardrobe::wardrobe_cape_off,
            wardrobe::cape_catalog,
            wardrobe::cape_catalog_apply,
            wardrobe::skin_catalog,
            wardrobe::skin_catalog_apply,
            wardrobe::license_capes,
            wardrobe::license_cape_apply,
            wardrobe::outfit_add,
            wardrobe::outfit_apply,
            wardrobe::outfit_delete,
            presence::set_presence_privacy,
            builds::get_builds,
            builds::create_build,
            builds::delete_build,
            builds::open_build_folder,
            builds::rename_build,
            builds::remove_mod,
            builds::toggle_mod,
            builds::refresh_build_content,
            builds::set_build_image,
            builds::get_build_image,
            builds::set_build_banner,
            builds::get_build_banner,
            modrinth::modrinth_search,
            modrinth::modrinth_categories,
            modrinth::modrinth_install,
            modrinth::modrinth_install_version,
            modrinth::modrinth_project,
            modrinth::project_versions,
            modrinth::change_build_version,
            modrinth::check_build_updates,
            cancel::cancel_download,
            modrinth::install_modpack,
            modrinth::import_mrpack,
            modrinth::match_local_mods,
            curseforge::curseforge_search,
            curseforge::curseforge_categories,
            curseforge::curseforge_project,
            curseforge::curseforge_project_versions,
            curseforge::curseforge_install,
            curseforge::curseforge_install_version,
            curseforge::curseforge_install_modpack,
            ftb::ftb_search,
            ftb::ftb_project,
            ftb::ftb_project_versions,
            ftb::ftb_install_modpack,
            servers::server_status,
            update::check_update,
            importer::scan_external_instances,
            importer::import_external_instance,
            importer::first_run_pending,
            importer::complete_first_run,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
