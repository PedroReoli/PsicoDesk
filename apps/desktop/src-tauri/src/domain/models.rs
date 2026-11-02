use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Owner,
    Admin,
    Psychologist,
    Receptionist,
    Finance,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Admin => "admin",
            Self::Psychologist => "psychologist",
            Self::Receptionist => "receptionist",
            Self::Finance => "finance",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "owner" => Some(Self::Owner),
            "admin" => Some(Self::Admin),
            "psychologist" => Some(Self::Psychologist),
            "receptionist" => Some(Self::Receptionist),
            "finance" => Some(Self::Finance),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSummary {
    pub id: String,
    pub display_name: String,
    pub username: String,
    pub role: Role,
    pub professional_registration: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapAdminInput {
    pub display_name: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserInput {
    pub display_name: String,
    pub username: String,
    pub password: String,
    pub role: Role,
    pub professional_registration: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserStatusInput {
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    pub token: String,
    pub expires_at: String,
    pub user: UserSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Patient {
    pub id: String,
    pub full_name: String,
    pub social_name: Option<String>,
    pub birth_date: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub guardian_name: Option<String>,
    pub guardian_phone: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePatientInput {
    pub full_name: String,
    pub social_name: Option<String>,
    pub birth_date: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub guardian_name: Option<String>,
    pub guardian_phone: Option<String>,
    pub professional_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePatientInput {
    pub full_name: String,
    pub social_name: Option<String>,
    pub birth_date: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub guardian_name: Option<String>,
    pub guardian_phone: Option<String>,
    pub status: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Appointment {
    pub id: String,
    pub patient_id: String,
    pub patient_name: String,
    pub professional_id: String,
    pub professional_name: String,
    pub starts_at: String,
    pub ends_at: String,
    pub status: String,
    pub kind: String,
    pub recurrence_id: Option<String>,
    pub cancellation_reason: Option<String>,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAppointmentInput {
    pub patient_id: String,
    pub professional_id: String,
    pub starts_at: String,
    pub ends_at: String,
    pub kind: String,
    pub recurrence_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppointmentStatusInput {
    pub status: String,
    pub cancellation_reason: Option<String>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinicalRecord {
    pub id: String,
    pub patient_id: String,
    pub author_id: String,
    pub author_name: String,
    pub appointment_id: Option<String>,
    pub body: String,
    pub amendment_of: Option<String>,
    pub content_hash: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateClinicalRecordInput {
    pub patient_id: String,
    pub appointment_id: Option<String>,
    pub body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateClinicalAmendmentInput {
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Charge {
    pub id: String,
    pub patient_id: String,
    pub patient_name: String,
    pub description: String,
    pub amount_minor: i64,
    pub paid_minor: i64,
    pub due_date: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChargeInput {
    pub patient_id: String,
    pub description: String,
    pub amount_minor: i64,
    pub due_date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub id: String,
    pub charge_id: String,
    pub amount_minor: i64,
    pub method: String,
    pub paid_at: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPaymentInput {
    pub amount_minor: i64,
    pub method: String,
    pub paid_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub patient_id: Option<String>,
    pub patient_name: Option<String>,
    pub title: String,
    pub document_type: String,
    pub template_version: i64,
    pub encrypted_path: String,
    pub checksum: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDocumentInput {
    pub patient_id: Option<String>,
    pub title: String,
    pub document_type: String,
    pub template_version: i64,
    pub encrypted_path: String,
    pub checksum: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDocumentInput {
    pub patient_id: Option<String>,
    pub title: String,
    pub document_type: String,
    pub content: String,
    pub template_version: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardReport {
    pub sessions_this_month: i64,
    pub active_patients: i64,
    pub revenue_this_month_minor: i64,
    pub occupancy_percent: i64,
    pub pending_amount_minor: i64,
    pub appointments_today: Vec<Appointment>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSetting {
    pub key: String,
    pub value: serde_json::Value,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppSettingInput {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupInput {
    pub backup_id: String,
    pub confirmation: String,
}
