use std::{fs, path::PathBuf, sync::Mutex};

use zeroize::Zeroizing;

use crate::{
    error::AppError,
    infrastructure::database::Database,
    security::{key_store, session::SessionStore},
};

pub struct AppState {
    pub database: Mutex<Database>,
    pub sessions: SessionStore,
    pub data_dir: PathBuf,
    pub database_key: Zeroizing<Vec<u8>>,
}

impl AppState {
    pub fn initialize(data_dir: PathBuf) -> Result<Self, AppError> {
        fs::create_dir_all(&data_dir)?;
        let key = Zeroizing::new(key_store::load_or_create(
            &data_dir.join("database-key.dpapi"),
        )?);
        let database = Database::open(&data_dir.join("psicodesk.db"), key.as_slice())?;
        fs::create_dir_all(data_dir.join("backups"))?;
        fs::create_dir_all(data_dir.join("documents"))?;
        Ok(Self {
            database: Mutex::new(database),
            sessions: SessionStore::default(),
            data_dir,
            database_key: key,
        })
    }
}
