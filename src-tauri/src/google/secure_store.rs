use keyring::v1::Entry;
use serde::{Deserialize, Serialize};
use thiserror::Error;

const SERVICE_NAME: &str = "com.tforart.fileforge.google-oauth";
const TOKEN_ACCOUNT: &str = "primary";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct StoredToken {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at_unix: u64,
    pub scopes: Vec<String>,
}

impl StoredToken {
    pub fn is_expiring_within(&self, seconds: u64, now_unix: u64) -> bool {
        self.expires_at_unix <= now_unix.saturating_add(seconds)
    }
}

#[derive(Debug, Error)]
pub enum SecureStoreError {
    #[error("Windows Credential Manager is unavailable: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("stored Google token data is invalid: {0}")]
    InvalidToken(#[from] serde_json::Error),
}

#[derive(Default)]
pub struct SecureTokenStore;

impl SecureTokenStore {
    pub fn is_available(&self) -> bool {
        Entry::store_status().is_ok()
    }

    pub fn has_token(&self) -> bool {
        self.load().ok().flatten().is_some()
    }

    pub fn save(&self, token: &StoredToken) -> Result<(), SecureStoreError> {
        let serialized = serde_json::to_string(token)?;
        self.entry()?.set_password(&serialized)?;
        Ok(())
    }

    pub fn load(&self) -> Result<Option<StoredToken>, SecureStoreError> {
        match self.entry()?.get_password() {
            Ok(serialized) => Ok(Some(serde_json::from_str(&serialized)?)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    pub fn delete(&self) -> Result<(), SecureStoreError> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    fn entry(&self) -> Result<Entry, keyring::Error> {
        Entry::new(SERVICE_NAME, TOKEN_ACCOUNT)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_expiry_uses_a_safety_window() {
        let token = StoredToken {
            access_token: "access".into(),
            refresh_token: "refresh".into(),
            expires_at_unix: 1_100,
            scopes: vec![],
        };

        assert!(!token.is_expiring_within(60, 1_000));
        assert!(token.is_expiring_within(120, 1_000));
    }

    #[test]
    fn token_serialization_round_trip_preserves_refresh_token() {
        let token = StoredToken {
            access_token: "access".into(),
            refresh_token: "refresh".into(),
            expires_at_unix: 42,
            scopes: vec!["drive".into()],
        };
        let serialized = serde_json::to_string(&token).expect("serialize token");
        let decoded: StoredToken = serde_json::from_str(&serialized).expect("decode token");
        assert_eq!(decoded.refresh_token, "refresh");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_credential_manager_backend_is_available() {
        assert!(
            Entry::store_status().is_ok(),
            "Windows Credential Manager backend must initialize"
        );
    }
}
