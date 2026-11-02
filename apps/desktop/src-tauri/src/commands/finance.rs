use serde_json::json;
use tauri::State;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
        validation,
    },
    commands::authenticate,
    domain::models::{Charge, CreateChargeInput, Payment, RegisterPaymentInput},
    error::{AppError, CommandError, CommandResult},
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub fn list_charges(
    state: State<'_, AppState>,
    session_token: String,
    status: Option<String>,
) -> CommandResult<Vec<Charge>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageFinance).map_err(CommandError::from)?;
    state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?
        .list_charges(status.as_deref())
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_charge(
    state: State<'_, AppState>,
    session_token: String,
    mut input: CreateChargeInput,
) -> CommandResult<Charge> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageFinance).map_err(CommandError::from)?;
    input.description = validation::required_text(&input.description, "Descrição", 2, 240)
        .map_err(CommandError::from)?;
    input.due_date = validation::optional_date(Some(&input.due_date), "Vencimento")
        .map_err(CommandError::from)?
        .ok_or_else(|| CommandError::from(AppError::Validation("Informe o vencimento.".into())))?;
    if input.amount_minor <= 0 {
        return Err(AppError::Validation("O valor deve ser maior que zero.".into()).into());
    }
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let charge = db
        .insert_charge(&input, &principal.user_id)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "charge.created",
        "charge",
        Some(&charge.id),
        "success",
        json!({"amountMinor":charge.amount_minor}),
    )
    .map_err(CommandError::from)?;
    Ok(charge)
}

#[tauri::command(rename_all = "camelCase")]
pub fn register_payment(
    state: State<'_, AppState>,
    session_token: String,
    charge_id: String,
    mut input: RegisterPaymentInput,
) -> CommandResult<Payment> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageFinance).map_err(CommandError::from)?;
    if !matches!(
        input.method.as_str(),
        "cash" | "pix" | "card" | "transfer" | "other"
    ) {
        return Err(AppError::Validation("Forma de pagamento inválida.".into()).into());
    }
    input.paid_at = validation::utc_datetime(&input.paid_at, "Data do pagamento")
        .map_err(CommandError::from)?
        .to_rfc3339();
    let mut db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let payment = db
        .register_payment(&charge_id, &input, &principal.user_id)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "payment.registered",
        "payment",
        Some(&payment.id),
        "success",
        json!({"chargeId":charge_id,"amountMinor":payment.amount_minor}),
    )
    .map_err(CommandError::from)?;
    Ok(payment)
}
