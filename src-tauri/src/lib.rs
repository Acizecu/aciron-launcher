mod accounts;
mod aciron;
mod aciron_servers;
mod announce;
mod atomic;
mod build_covers;
mod builds;
mod cancel;
mod chat;
mod content;
mod crash;
mod curseforge;
mod discord;
mod forge;
mod ftb;
mod gamelog;
mod i18n;
mod importer;
mod instance;
mod launcher;
mod launch_config;
mod logshare;
mod microsoft;
mod modrinth;
mod net;
mod optifine;
mod mojang;
mod pack;
mod presence;
mod promo;
mod realtime;
mod recents;
mod screenshots;
mod secret;
mod servers;
mod settings;
mod social;
mod tray;
mod update;
mod wardrobe;
mod window_frame;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    crash::install_panic_hook();

    let arg_pack = pack::scan_argv();

    let Some(slot) = instance::acquire() else {
        if let Some(p) = arg_pack {
            pack::post_to_inbox(&p);
            eprintln!("[instance] launcher is already running, handed over {p}");
        } else {
            eprintln!(
                "[instance] launcher is already running (window limit: {}), exiting",
                instance::MAX_INSTANCES
            );
        }
        return;
    };
    if slot > 1 {
        eprintln!("[instance] second window: separate profile in {:?}", settings::data_root());
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())

        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {

            for label in ["main", "splash"] {
                if let Some(w) = tauri::Manager::get_webview_window(app, label) {
                    window_frame::strip_system_frame(&w);
                }
            }

            tray::init(app.handle());

            update::remember_install_dir(app.handle());

            build_covers::backfill_in_background();

            std::thread::spawn(discord::init);

            tauri::async_runtime::spawn(presence::heartbeat_loop());

            tauri::async_runtime::spawn(realtime::connect_loop(app.handle().clone()));

            tauri::async_runtime::spawn(async {
                let r = mojang::sync_look().await;
                if let Some(e) = r.error {
                    eprintln!("[mojang] look not synced at startup: {e}");
                }
            });

            crash::set_enabled(settings::load_settings().crash_reports);

            tauri::async_runtime::spawn(async {
                crash::flush(false).await;
            });

            pack::watch_inbox(app.handle().clone());
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
            launcher::loader_versions,
            launcher::loader_game_versions,
            launcher::stop_game,
            gamelog::game_log_tail,
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
            aciron::aciron_login_start,
            aciron::aciron_refresh_plus,
            aciron::aciron_login_finish,
            aciron::aciron_login_telegram_send,
            aciron::aciron_register,
            aciron::aciron_verify_email,
            aciron::aciron_resend_code,
            aciron::aciron_link_license,
            announce::announce_current,
            social::friends_list,
            social::friend_request,
            social::friend_respond,
            social::friend_cancel,
            social::friend_remove,
            social::friend_block,
            social::friend_unblock,
            social::set_presence_status,
            social::set_accept_requests,
            realtime::realtime_connected,
            realtime::realtime_send_typing,
            chat::chat_history,
            chat::chat_send,
            chat::chat_send_image,
            chat::chat_send_image_data,
            chat::chat_limits,
            chat::chat_overview,
            chat::chat_mark_read,
            chat::chat_delete,
            chat::friend_profile,
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
            builds::create_build_with_java,
            builds::delete_build,
            builds::open_build_folder,
            builds::rename_build,
            builds::remove_mod,
            builds::toggle_mod,
            builds::refresh_build_content,
            optifine::install_optifine,
            promo::promo_current,
            promo::promo_install,
            builds::set_build_image,
            builds::get_build_image,
            build_covers::build_cover,
            builds::read_image_data_url,
            builds::set_build_banner,
            builds::get_build_banner,
            builds::set_build_favorite,
            builds::set_build_loader,
            builds::set_build_java,
            builds::add_content_files,
            pack::export_build,
            pack::build_tree,
            pack::import_acpack,
            pack::pending_pack,
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
            curseforge::cf_check_build_updates,
            ftb::ftb_search,
            ftb::ftb_project,
            ftb::ftb_project_versions,
            ftb::ftb_install_modpack,
            servers::server_status,
            screenshots::screenshots_list,
            screenshots::screenshot_thumbnail,
            screenshots::screenshot_full,
            screenshots::screenshot_open,
            screenshots::screenshot_reveal,
            screenshots::screenshot_delete,
            aciron_servers::aciron_servers_list,
            update::build_info,
            crash::crash_report_js,
            crash::crash_reports_pending,
            crash::crash_report_preview,
            crash::crash_reports_send,
            crash::crash_reports_clear,
            crash::crash_reports_dir,
            crash::crash_reports_available,
            tray::start_minimized,
            logshare::log_share,
            logshare::log_share_size,
            logshare::log_share_available,
            importer::scan_external_instances,
            importer::import_external_instance,
            importer::first_run_pending,
            importer::complete_first_run,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, event| {

            if let tauri::RunEvent::Exit = event {
                tauri::async_runtime::block_on(async {
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(2), async {
                        realtime::shutdown().await;
                        presence::goodbye().await;
                    })
                    .await;
                });
            }
        });
}
