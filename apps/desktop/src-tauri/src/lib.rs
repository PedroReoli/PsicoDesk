mod application;
mod commands;
mod domain;
mod error;
mod infrastructure;
mod security;
mod state;
mod sync;

#[cfg(test)]
mod production_tests;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_target(false)
        .compact()
        .init();

    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let state = state::AppState::initialize(app_data_dir)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            sync::initialize(&state)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            app.manage(state);
            app.manage(sync::SyncRuntime::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::bootstrap_admin,
            commands::auth::needs_bootstrap,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::get_session,
            commands::users::list_users,
            commands::users::create_user,
            commands::users::update_user_status,
            commands::patients::list_patients,
            commands::patients::list_patient_options,
            commands::patients::create_patient,
            commands::patients::update_patient,
            commands::scheduling::list_appointments,
            commands::scheduling::list_schedule_professionals,
            commands::scheduling::create_appointment,
            commands::scheduling::update_appointment_status,
            commands::clinical::list_clinical_records,
            commands::clinical::create_clinical_record,
            commands::clinical::create_clinical_amendment,
            commands::finance::list_charges,
            commands::finance::create_charge,
            commands::finance::register_payment,
            commands::documents::list_documents,
            commands::documents::generate_document,
            commands::documents::export_document,
            commands::reports::get_dashboard_report,
            commands::settings::get_app_settings,
            commands::settings::get_session_policy,
            commands::settings::update_app_setting,
            commands::backup::create_backup,
            commands::backup::list_backups,
            commands::backup::restore_backup,
            commands::backup::export_portable_backup,
            commands::backup::list_portable_backups,
            commands::backup::restore_portable_backup,
            commands::sync::get_sync_config,
            commands::sync::get_sync_device_identity,
            commands::sync::update_sync_config,
            commands::sync::get_sync_status,
            commands::sync::start_sync,
            commands::sync::stop_sync,
            commands::sync::sync_now,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o PsicoDesk");
}
