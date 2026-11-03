mod auditor;
mod catalog_tweaks;
mod companion;
mod dns;
mod elevation;
mod preferences;
mod performance_device;
mod repair;
mod visual_tweaks;
mod windows_tweaks;
mod workflows;
mod models;
mod agent_host;
mod local_runtime;

use auditor::{list_auditor_proposals, review_auditor_proposal};
use companion::{
    cancel_assistant_model_download, create_mod_kernel_proposal, download_assistant_model,
    get_assistant_catalog, get_assistant_status, get_browser_snapshot, get_mod_analysis_status,
    inspect_agent_runtime, configure_agent_runtime,
    manage_wsl_distribution,
    inspect_mod_package, list_mod_kernel_proposals, load_assistant_model, unload_assistant_model,
    list_approved_learning, approve_source_lesson, forget_source_lesson,
    review_cache_status, clear_review_cache,
    propose_appearance_tweaks, propose_scene_html_edit, route_browser_task, save_mod_auditor_proposal, start_mod_analysis,
};
use dns::{inspect_dns, set_dns_provider};
use catalog_tweaks::{CatalogState, inspect_catalog_tweaks, preview_catalog_tweaks, preview_appearance_settings, apply_catalog_tweaks, rollback_catalog_tweaks};
use repair::{apply_security_fix, inspect_security, run_repair, preview_repair, get_repair_receipt};
use preferences::{erase_preferences, get_preference_receipts, get_preferences, save_preferences};
use performance_device::{inspect_performance_device, inspect_performance_telemetry, open_power_settings, PerformanceTelemetryState};
use visual_tweaks::{
    get_visual_tweak_receipts, inspect_visual_tweaks, rollback_visual_tweak, set_visual_tweak,
};
use windows_tweaks::{
    CapsuleState, apply_theme_change, get_last_theme_receipt, inspect_theme, preview_theme_change,
    rollback_last_theme_change,
};
use workflows::{delete_user_workflow, list_user_workflows, save_user_workflow};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Some(code) = elevation::run_helper_if_requested() {
        std::process::exit(code);
    }
    tauri::Builder::default()
        .manage(CapsuleState::default())
        .manage(CatalogState::default())
        .manage(PerformanceTelemetryState::default())
        .invoke_handler(tauri::generate_handler![
            get_browser_snapshot,
            route_browser_task,
            get_assistant_status,
            companion::orchestrator_action,
            companion::bible_reference_action,
            companion::workspace_autonomy_action,
            companion::authorize_document_workspace,
            inspect_agent_runtime,
            configure_agent_runtime,
            manage_wsl_distribution,
            agent_host::open_agent_host_page,
            get_assistant_catalog,
            load_assistant_model,
            unload_assistant_model,
            download_assistant_model,
            cancel_assistant_model_download,
            propose_appearance_tweaks,
            propose_scene_html_edit,
            inspect_mod_package,
            companion::html_component_action,
            companion::export_reduced_html_copy,
            companion::preview_wsl_setup,
            companion::apply_wsl_setup,
            list_approved_learning,
            approve_source_lesson,
            forget_source_lesson,
            review_cache_status,
            clear_review_cache,
            start_mod_analysis,
            get_mod_analysis_status,
            save_mod_auditor_proposal,
            list_mod_kernel_proposals,
            create_mod_kernel_proposal,
            list_auditor_proposals,
            review_auditor_proposal,
            inspect_theme,
            inspect_catalog_tweaks,
            inspect_performance_device,
            inspect_performance_telemetry,
            open_power_settings,
            preview_catalog_tweaks,
            preview_appearance_settings,
            apply_catalog_tweaks,
            rollback_catalog_tweaks,
            inspect_dns,
            set_dns_provider,
            run_repair,
            preview_repair,
            get_repair_receipt,
            inspect_security,
            apply_security_fix,
            get_last_theme_receipt,
            preview_theme_change,
            apply_theme_change,
            rollback_last_theme_change,
            inspect_visual_tweaks,
            get_visual_tweak_receipts,
            set_visual_tweak,
            rollback_visual_tweak,
            get_preferences,
            get_preference_receipts,
            save_preferences,
            erase_preferences,
            list_user_workflows,
            save_user_workflow,
            delete_user_workflow
        ])
        .setup(|app| {
            local_runtime::initialize(app.handle())?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            models::register_offline_models(app.handle())?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Capsule Toolbox")
        .run(|_, event| {
            if matches!(event, tauri::RunEvent::Exit) { local_runtime::shutdown(); }
        });
}
