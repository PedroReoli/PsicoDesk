use crate::{
    application::authorization::Principal, error::AppError, infrastructure::database::Database,
};
use serde_json::Value;

pub fn record(
    db: &Database,
    principal: Option<&Principal>,
    action: &str,
    entity_type: &str,
    entity_id: Option<&str>,
    result: &str,
    metadata: Value,
) -> Result<(), AppError> {
    db.insert_audit_event(
        principal.map(|value| value.user_id.as_str()),
        action,
        entity_type,
        entity_id,
        result,
        &metadata,
    )
}
