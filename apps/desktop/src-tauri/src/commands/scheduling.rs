use serde_json::json;
use tauri::State;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
        validation,
    },
    commands::authenticate,
    domain::models::{Appointment, CreateAppointmentInput, UpdateAppointmentStatusInput},
    error::{AppError, CommandError, CommandResult},
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub fn list_appointments(
    state: State<'_, AppState>,
    session_token: String,
    from: String,
    to: String,
) -> CommandResult<Vec<Appointment>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSchedule).map_err(CommandError::from)?;
    let from = validation::utc_datetime(&from, "Início")
        .map_err(CommandError::from)?
        .to_rfc3339();
    let to = validation::utc_datetime(&to, "Fim")
        .map_err(CommandError::from)?
        .to_rfc3339();
    if to <= from {
        return Err(
            AppError::Validation("O fim do período deve ser posterior ao início.".into()).into(),
        );
    }
    state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?
        .list_appointments(&from, &to)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_appointment(
    state: State<'_, AppState>,
    session_token: String,
    mut input: CreateAppointmentInput,
) -> CommandResult<Appointment> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSchedule).map_err(CommandError::from)?;
    let starts_at =
        validation::utc_datetime(&input.starts_at, "Início").map_err(CommandError::from)?;
    let ends_at = validation::utc_datetime(&input.ends_at, "Fim").map_err(CommandError::from)?;
    if ends_at <= starts_at || ends_at - starts_at > chrono::Duration::hours(8) {
        return Err(AppError::Validation(
            "O horário final deve ser posterior ao inicial e a duração máxima é de 8 horas.".into(),
        )
        .into());
    }
    if !matches!(
        input.kind.as_str(),
        "individual" | "couple" | "family" | "group" | "assessment"
    ) {
        return Err(AppError::Validation("Tipo de atendimento inválido.".into()).into());
    }
    input.starts_at = starts_at.to_rfc3339();
    input.ends_at = ends_at.to_rfc3339();
    let mut db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let appointment = db
        .insert_appointment(&input, &principal.user_id)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "appointment.created",
        "appointment",
        Some(&appointment.id),
        "success",
        json!({}),
    )
    .map_err(CommandError::from)?;
    Ok(appointment)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_appointment_status(
    state: State<'_, AppState>,
    session_token: String,
    appointment_id: String,
    input: UpdateAppointmentStatusInput,
) -> CommandResult<Appointment> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSchedule).map_err(CommandError::from)?;
    if !matches!(
        input.status.as_str(),
        "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show"
    ) {
        return Err(AppError::Validation("Status do atendimento inválido.".into()).into());
    }
    if input.status == "cancelled"
        && input
            .cancellation_reason
            .as_deref()
            .unwrap_or_default()
            .trim()
            .len()
            < 3
    {
        return Err(AppError::Validation("Informe o motivo do cancelamento.".into()).into());
    }
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let appointment = db
        .update_appointment_status(&appointment_id, &input)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "appointment.status_updated",
        "appointment",
        Some(&appointment_id),
        "success",
        json!({"status":input.status}),
    )
    .map_err(CommandError::from)?;
    Ok(appointment)
}
