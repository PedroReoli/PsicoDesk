use serde_json::json;
use tauri::State;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
        validation,
    },
    commands::authenticate,
    domain::models::{CreatePatientInput, Patient, PatientOption, Role, UpdatePatientInput},
    error::{AppError, CommandError, CommandResult},
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub fn list_patient_options(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<Vec<PatientOption>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    if !matches!(
        principal.role,
        Role::Owner | Role::Admin | Role::Psychologist | Role::Receptionist | Role::Finance
    ) {
        return Err(AppError::Forbidden.into());
    }
    let professional_id =
        (principal.role == Role::Psychologist).then_some(principal.user_id.as_str());
    state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?
        .list_patient_options(professional_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_patients(
    state: State<'_, AppState>,
    session_token: String,
    query: Option<String>,
) -> CommandResult<Vec<Patient>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManagePatients).map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    if principal.role == Role::Psychologist {
        db.list_patients_for_professional(query.as_deref(), &principal.user_id)
    } else {
        db.list_patients(query.as_deref())
    }
    .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_patient(
    state: State<'_, AppState>,
    session_token: String,
    mut input: CreatePatientInput,
) -> CommandResult<Patient> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManagePatients).map_err(CommandError::from)?;
    input.full_name =
        validation::required_text(&input.full_name, "Nome", 2, 160).map_err(CommandError::from)?;
    input.birth_date = validation::optional_date(input.birth_date.as_deref(), "Data de nascimento")
        .map_err(CommandError::from)?;
    let professional_id = if principal.role == Role::Psychologist {
        Some(principal.user_id.clone())
    } else {
        input.professional_id.clone()
    };
    let mut db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let patient = db
        .insert_patient(&input, professional_id.as_deref())
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "patient.created",
        "patient",
        Some(&patient.id),
        "success",
        json!({}),
    )
    .map_err(CommandError::from)?;
    Ok(patient)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_patient(
    state: State<'_, AppState>,
    session_token: String,
    patient_id: String,
    mut input: UpdatePatientInput,
) -> CommandResult<Patient> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManagePatients).map_err(CommandError::from)?;
    if principal.role == Role::Psychologist
        && !state
            .database
            .lock()
            .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?
            .professional_can_access_patient(&principal.user_id, &patient_id)
            .map_err(CommandError::from)?
    {
        return Err(AppError::Forbidden.into());
    }
    input.full_name =
        validation::required_text(&input.full_name, "Nome", 2, 160).map_err(CommandError::from)?;
    input.birth_date = validation::optional_date(input.birth_date.as_deref(), "Data de nascimento")
        .map_err(CommandError::from)?;
    if !matches!(input.status.as_str(), "active" | "inactive" | "archived") {
        return Err(AppError::Validation("Status do paciente inválido.".into()).into());
    }
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let patient = db
        .update_patient(&patient_id, &input)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "patient.updated",
        "patient",
        Some(&patient_id),
        "success",
        json!({"version":patient.version}),
    )
    .map_err(CommandError::from)?;
    Ok(patient)
}
