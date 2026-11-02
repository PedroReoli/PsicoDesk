use crate::error::AppError;
use chrono::{DateTime, NaiveDate, Utc};

pub fn required_text(value: &str, field: &str, min: usize, max: usize) -> Result<String, AppError> {
    let normalized = value.trim();
    if normalized.len() < min || normalized.len() > max {
        return Err(AppError::Validation(format!(
            "{field} deve ter entre {min} e {max} caracteres."
        )));
    }
    Ok(normalized.to_owned())
}

pub fn username(value: &str) -> Result<String, AppError> {
    let normalized = value.trim().to_lowercase();
    if normalized.len() < 3
        || normalized.len() > 80
        || !normalized
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return Err(AppError::Validation(
            "Usuário deve conter de 3 a 80 letras, números, ponto, hífen ou sublinhado.".into(),
        ));
    }
    Ok(normalized)
}

pub fn password(value: &str) -> Result<(), AppError> {
    let valid = value.len() >= 12
        && value.len() <= 128
        && value.chars().any(char::is_uppercase)
        && value.chars().any(char::is_lowercase)
        && value.chars().any(|ch| ch.is_ascii_digit());
    if !valid {
        return Err(AppError::Validation(
            "A senha deve ter de 12 a 128 caracteres, com maiúscula, minúscula e número.".into(),
        ));
    }
    Ok(())
}

pub fn optional_date(value: Option<&str>, field: &str) -> Result<Option<String>, AppError> {
    value
        .map(|date| {
            NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map(|parsed| parsed.format("%Y-%m-%d").to_string())
                .map_err(|_| {
                    AppError::Validation(format!("{field} deve usar o formato AAAA-MM-DD."))
                })
        })
        .transpose()
}

pub fn utc_datetime(value: &str, field: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(value)
        .map(|parsed| parsed.with_timezone(&Utc))
        .map_err(|_| {
            AppError::Validation(format!("{field} deve ser uma data e hora ISO 8601 válida."))
        })
}
