use std::{collections::HashMap, sync::RwLock};

use chrono::{Duration, Utc};
use rand::{rngs::OsRng, RngCore};

use crate::{application::authorization::Principal, domain::models::SessionDto, error::AppError};

#[derive(Debug, Clone)]
struct Session {
    principal: Principal,
    expires_at: chrono::DateTime<Utc>,
    last_activity_at: chrono::DateTime<Utc>,
    idle_timeout: Duration,
}

impl Session {
    fn is_valid_at(&self, now: chrono::DateTime<Utc>) -> bool {
        self.expires_at > now && now - self.last_activity_at < self.idle_timeout
    }
}

#[derive(Default)]
pub struct SessionStore {
    sessions: RwLock<HashMap<String, Session>>,
}

impl SessionStore {
    pub fn create(
        &self,
        principal: Principal,
        user: crate::domain::models::UserSummary,
        idle_timeout_minutes: i64,
    ) -> Result<SessionDto, AppError> {
        let mut random = [0u8; 32];
        OsRng.fill_bytes(&mut random);
        let token = hex::encode(random);
        let expires_at = Utc::now() + Duration::hours(8);
        self.sessions
            .write()
            .map_err(|_| AppError::Internal("session lock poisoned".into()))?
            .insert(
                token.clone(),
                Session {
                    principal,
                    expires_at,
                    last_activity_at: Utc::now(),
                    idle_timeout: Duration::minutes(idle_timeout_minutes.clamp(1, 120)),
                },
            );
        Ok(SessionDto {
            token,
            expires_at: expires_at.to_rfc3339(),
            user,
        })
    }

    pub fn principal(&self, token: &str) -> Result<Principal, AppError> {
        let now = Utc::now();
        let mut sessions = self
            .sessions
            .write()
            .map_err(|_| AppError::Internal("session lock poisoned".into()))?;
        sessions.retain(|_, session| session.is_valid_at(now));
        let session = sessions.get_mut(token).ok_or(AppError::InvalidSession)?;
        session.last_activity_at = now;
        Ok(session.principal.clone())
    }

    pub fn describe(
        &self,
        token: &str,
        user: crate::domain::models::UserSummary,
    ) -> Result<SessionDto, AppError> {
        let now = Utc::now();
        let sessions = self
            .sessions
            .read()
            .map_err(|_| AppError::Internal("session lock poisoned".into()))?;
        let session = sessions
            .get(token)
            .filter(|session| session.is_valid_at(now))
            .ok_or(AppError::InvalidSession)?;
        Ok(SessionDto {
            token: token.into(),
            expires_at: session.expires_at.to_rfc3339(),
            user,
        })
    }

    pub fn revoke(&self, token: &str) -> Result<(), AppError> {
        self.sessions
            .write()
            .map_err(|_| AppError::Internal("session lock poisoned".into()))?
            .remove(token);
        Ok(())
    }

    pub fn revoke_user(&self, user_id: &str) -> Result<(), AppError> {
        self.sessions
            .write()
            .map_err(|_| AppError::Internal("session lock poisoned".into()))?
            .retain(|_, session| session.principal.user_id != user_id);
        Ok(())
    }

    pub fn clear(&self) -> Result<(), AppError> {
        self.sessions
            .write()
            .map_err(|_| AppError::Internal("session lock poisoned".into()))?
            .clear();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::models::{Role, UserSummary};

    #[test]
    fn revoked_session_is_rejected() {
        let store = SessionStore::default();
        let principal = Principal {
            user_id: "u1".into(),
            display_name: "Teste".into(),
            role: Role::Owner,
        };
        let user = UserSummary {
            id: "u1".into(),
            display_name: "Teste".into(),
            username: "teste".into(),
            role: Role::Owner,
            professional_registration: None,
            status: "active".into(),
            created_at: Utc::now().to_rfc3339(),
        };
        let session = store.create(principal, user, 15).expect("session");
        store.revoke(&session.token).expect("revoke");
        assert!(matches!(
            store.principal(&session.token),
            Err(AppError::InvalidSession)
        ));
    }

    #[test]
    fn session_honors_configured_idle_timeout_boundaries() {
        let now = Utc::now();
        let principal = Principal {
            user_id: "u1".into(),
            display_name: "Teste".into(),
            role: Role::Owner,
        };
        let one_minute = Session {
            principal: principal.clone(),
            expires_at: now + Duration::hours(8),
            last_activity_at: now - Duration::seconds(61),
            idle_timeout: Duration::minutes(1),
        };
        let two_hours = Session {
            principal,
            expires_at: now + Duration::hours(8),
            last_activity_at: now - Duration::minutes(119),
            idle_timeout: Duration::minutes(120),
        };
        assert!(!one_minute.is_valid_at(now));
        assert!(two_hours.is_valid_at(now));
    }
}
