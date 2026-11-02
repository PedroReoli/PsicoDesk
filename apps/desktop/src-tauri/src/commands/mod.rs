pub mod auth;
pub mod backup;
pub mod clinical;
pub mod documents;
pub mod finance;
pub mod patients;
pub mod reports;
pub mod scheduling;
pub mod settings;
pub mod sync;
pub mod users;

use crate::{application::authorization::Principal, error::AppError, state::AppState};

pub(crate) fn authenticate(state: &AppState, token: &str) -> Result<Principal, AppError> {
    state.sessions.principal(token)
}
