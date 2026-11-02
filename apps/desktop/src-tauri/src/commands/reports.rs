use tauri::State;

use crate::{
    application::authorization::{permits, require, Permission},
    commands::authenticate,
    domain::models::{DashboardReport, Role},
    error::{AppError, CommandError, CommandResult},
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub fn get_dashboard_report(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<DashboardReport> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ViewDashboard).map_err(CommandError::from)?;
    let include_finance = permits(&principal.role, Permission::ManageFinance);
    state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?
        .dashboard_report(
            include_finance,
            (principal.role == Role::Psychologist).then_some(principal.user_id.as_str()),
        )
        .map_err(Into::into)
}
