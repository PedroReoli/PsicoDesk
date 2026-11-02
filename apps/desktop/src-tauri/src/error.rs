use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("acesso negado")]
    Forbidden,
    #[error("sessão inválida ou expirada")]
    InvalidSession,
    #[error("credenciais inválidas")]
    InvalidCredentials,
    #[error("recurso não encontrado")]
    NotFound,
    #[error("entrada inválida: {0}")]
    Validation(String),
    #[error("conflito: {0}")]
    Conflict(String),
    #[error("falha de persistência")]
    Database(#[from] rusqlite::Error),
    #[error("falha de entrada ou saída")]
    Io(#[from] std::io::Error),
    #[error("falha de segurança: {0}")]
    Security(String),
    #[error("falha interna")]
    Internal(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(value: AppError) -> Self {
        let (code, message) = match value {
            AppError::Forbidden => ("FORBIDDEN", "Você não tem permissão para esta ação.".into()),
            AppError::InvalidSession => (
                "INVALID_SESSION",
                "Sua sessão expirou. Entre novamente.".into(),
            ),
            AppError::InvalidCredentials => {
                ("INVALID_CREDENTIALS", "Usuário ou senha inválidos.".into())
            }
            AppError::NotFound => (
                "NOT_FOUND",
                "O registro solicitado não foi encontrado.".into(),
            ),
            AppError::Validation(detail) => ("VALIDATION", detail),
            AppError::Conflict(detail) => ("CONFLICT", detail),
            AppError::Database(_) | AppError::Io(_) | AppError::Internal(_) => {
                ("INTERNAL", "Não foi possível concluir a operação.".into())
            }
            AppError::Security(detail) => ("SECURITY", detail),
        };
        Self { code, message }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
