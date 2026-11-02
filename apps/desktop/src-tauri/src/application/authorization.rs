use crate::{domain::models::Role, error::AppError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    ManageUsers,
    ManageSettings,
    ManagePatients,
    ManageSchedule,
    ReadClinicalRecords,
    WriteClinicalRecords,
    ManageFinance,
    ManageDocuments,
    ViewDashboard,
    ManageBackups,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Principal {
    pub user_id: String,
    pub display_name: String,
    pub role: Role,
}

pub fn require(principal: &Principal, permission: Permission) -> Result<(), AppError> {
    if permits(&principal.role, permission) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub fn permits(role: &Role, permission: Permission) -> bool {
    use Permission::*;
    match role {
        Role::Owner => matches!(
            permission,
            ManageUsers
                | ManageSettings
                | ManagePatients
                | ManageSchedule
                | ManageFinance
                | ManageDocuments
                | ViewDashboard
                | ManageBackups
        ),
        Role::Admin => matches!(
            permission,
            ManageUsers
                | ManageSettings
                | ManagePatients
                | ManageSchedule
                | ManageFinance
                | ManageDocuments
                | ViewDashboard
                | ManageBackups
        ),
        Role::Psychologist => matches!(
            permission,
            ManagePatients
                | ManageSchedule
                | ReadClinicalRecords
                | WriteClinicalRecords
                | ManageDocuments
                | ViewDashboard
        ),
        Role::Receptionist => matches!(
            permission,
            ManagePatients | ManageSchedule | ManageDocuments | ViewDashboard
        ),
        Role::Finance => matches!(permission, ManageFinance | ViewDashboard),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receptionist_cannot_read_clinical_records() {
        assert!(!permits(
            &Role::Receptionist,
            Permission::ReadClinicalRecords
        ));
    }

    #[test]
    fn finance_cannot_manage_patients() {
        assert!(!permits(&Role::Finance, Permission::ManagePatients));
    }

    #[test]
    fn psychologist_can_write_clinical_records() {
        assert!(permits(
            &Role::Psychologist,
            Permission::WriteClinicalRecords
        ));
    }
}
