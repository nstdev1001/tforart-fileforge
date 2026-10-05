use std::time::{Duration, SystemTime, UNIX_EPOCH};

use oauth2::{
    basic::{BasicClient, BasicErrorResponse},
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl,
    RefreshToken, RequestTokenError, Scope, TokenResponse, TokenUrl,
};
use serde::Serialize;
use thiserror::Error;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::timeout,
};
use url::Url;

use super::secure_store::{SecureStoreError, SecureTokenStore, StoredToken};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);
const EXPIRY_SAFETY_SECONDS: u64 = 60;

#[derive(Clone)]
pub struct GoogleConfig {
    pub client_id: String,
    pub client_secret: String,
}

impl GoogleConfig {
    pub fn from_environment() -> Result<Self, OAuthError> {
        let client_id = read_required_env("GOOGLE_CLIENT_ID")?;
        let client_secret = read_required_env("GOOGLE_CLIENT_SECRET")?;
        Ok(Self {
            client_id,
            client_secret,
        })
    }

    pub fn is_configured() -> bool {
        Self::from_environment().is_ok()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthLoginResult {
    pub authenticated: bool,
    pub expires_at_unix: u64,
}

#[derive(Debug, Error)]
pub enum OAuthError {
    #[error("missing required environment variable {0}")]
    MissingConfiguration(&'static str),
    #[error("OAuth endpoint configuration is invalid: {0}")]
    Endpoint(String),
    #[error("could not start the loopback callback listener: {0}")]
    Listener(#[from] std::io::Error),
    #[error("could not open the system browser: {0}")]
    Browser(String),
    #[error("Google sign-in timed out after five minutes")]
    CallbackTimeout,
    #[error("Google rejected authorization: {0}")]
    AuthorizationRejected(String),
    #[error("OAuth callback did not contain an authorization code")]
    MissingCode,
    #[error("OAuth state mismatch; the callback was rejected")]
    StateMismatch,
    #[error("token exchange failed: {0}")]
    TokenExchange(String),
    #[error("token endpoint request failed: {0}")]
    TokenTransport(String),
    #[error("token endpoint is temporarily unavailable: {0}")]
    TokenTemporary(String),
    #[error("Google did not return a refresh token; revoke access and try connecting again")]
    MissingRefreshToken,
    #[error(transparent)]
    SecureStore(#[from] SecureStoreError),
    #[error("system clock is before the Unix epoch")]
    InvalidSystemClock,
}

pub async fn login(
    http: &reqwest::Client,
    store: &SecureTokenStore,
) -> Result<OAuthLoginResult, OAuthError> {
    let config = GoogleConfig::from_environment()?;
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let redirect_url = format!("http://127.0.0.1:{}", address.port());

    let client = BasicClient::new(ClientId::new(config.client_id))
        .set_client_secret(ClientSecret::new(config.client_secret))
        .set_auth_uri(parse_auth_url()?)
        .set_token_uri(parse_token_url()?)
        .set_redirect_uri(
            RedirectUrl::new(redirect_url)
                .map_err(|error| OAuthError::Endpoint(error.to_string()))?,
        );

    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (authorization_url, csrf_state) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new(DRIVE_SCOPE.to_owned()))
        .set_pkce_challenge(challenge)
        .add_extra_param("access_type", "offline")
        .add_extra_param("prompt", "consent")
        .url();

    open::that(authorization_url.as_str())
        .map_err(|error| OAuthError::Browser(error.to_string()))?;

    let authorization_code = receive_callback(&listener, csrf_state.secret()).await?;
    let response = client
        .exchange_code(AuthorizationCode::new(authorization_code))
        .set_pkce_verifier(verifier)
        .request_async(http)
        .await
        .map_err(map_token_exchange_error)?;

    let refresh_token = response
        .refresh_token()
        .map(|token| token.secret().to_owned())
        .ok_or(OAuthError::MissingRefreshToken)?;
    let expires_at_unix = expiry_from_now(response.expires_in())?;
    let scopes = response
        .scopes()
        .map(|items| {
            items
                .iter()
                .map(|scope| scope.as_str().to_owned())
                .collect()
        })
        .unwrap_or_else(|| vec![DRIVE_SCOPE.to_owned()]);

    store.save(&StoredToken {
        access_token: response.access_token().secret().to_owned(),
        refresh_token,
        expires_at_unix,
        scopes,
    })?;

    Ok(OAuthLoginResult {
        authenticated: true,
        expires_at_unix,
    })
}

pub async fn valid_access_token(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    force_refresh: bool,
) -> Result<String, OAuthError> {
    let token = store.load()?.ok_or(OAuthError::AuthorizationRejected(
        "Google Drive is not connected".to_owned(),
    ))?;

    if !force_refresh && !token.is_expiring_within(EXPIRY_SAFETY_SECONDS, unix_now()?) {
        return Ok(token.access_token);
    }

    refresh_access_token(http, store, token).await
}

async fn refresh_access_token(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    previous: StoredToken,
) -> Result<String, OAuthError> {
    let config = GoogleConfig::from_environment()?;
    let client = BasicClient::new(ClientId::new(config.client_id))
        .set_client_secret(ClientSecret::new(config.client_secret))
        .set_auth_uri(parse_auth_url()?)
        .set_token_uri(parse_token_url()?);

    let response = client
        .exchange_refresh_token(&RefreshToken::new(previous.refresh_token.clone()))
        .request_async(http)
        .await
        .map_err(map_token_exchange_error)?;

    let access_token = response.access_token().secret().to_owned();
    let refreshed = StoredToken {
        access_token: access_token.clone(),
        refresh_token: response
            .refresh_token()
            .map(|token| token.secret().to_owned())
            .unwrap_or(previous.refresh_token),
        expires_at_unix: expiry_from_now(response.expires_in())?,
        scopes: response
            .scopes()
            .map(|items| {
                items
                    .iter()
                    .map(|scope| scope.as_str().to_owned())
                    .collect()
            })
            .unwrap_or(previous.scopes),
    };
    store.save(&refreshed)?;
    Ok(access_token)
}

fn map_token_exchange_error<RE>(error: RequestTokenError<RE, BasicErrorResponse>) -> OAuthError
where
    RE: std::error::Error + 'static,
{
    match error {
        RequestTokenError::Request(error) => OAuthError::TokenTransport(error.to_string()),
        RequestTokenError::ServerResponse(response) => {
            let message = response.to_string();
            if is_transient_token_error_code(response.error().as_ref()) {
                OAuthError::TokenTemporary(message)
            } else {
                OAuthError::TokenExchange(message)
            }
        }
        // oauth2 does not retain the HTTP status for these variants. Google can
        // return an HTML/empty 429 or 5xx response, so keep the task recoverable
        // instead of turning a temporary endpoint failure into a terminal task.
        RequestTokenError::Parse(error, _) => OAuthError::TokenTemporary(error.to_string()),
        RequestTokenError::Other(message) => OAuthError::TokenTemporary(message),
    }
}

fn is_transient_token_error_code(code: &str) -> bool {
    matches!(
        code,
        "temporarily_unavailable" | "server_error" | "rate_limit_exceeded" | "slow_down"
    )
}

fn read_required_env(name: &'static str) -> Result<String, OAuthError> {
    if let Ok(value) = std::env::var(name) {
        let trimmed = value.trim().to_owned();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }

    let compile_time_value = match name {
        "GOOGLE_CLIENT_ID" => option_env!("GOOGLE_CLIENT_ID"),
        "GOOGLE_CLIENT_SECRET" => option_env!("GOOGLE_CLIENT_SECRET"),
        _ => None,
    };

    if let Some(value) = compile_time_value {
        let trimmed = value.trim().to_owned();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }

    Err(OAuthError::MissingConfiguration(name))
}

fn parse_auth_url() -> Result<AuthUrl, OAuthError> {
    AuthUrl::new(AUTH_URL.to_owned()).map_err(|error| OAuthError::Endpoint(error.to_string()))
}

fn parse_token_url() -> Result<TokenUrl, OAuthError> {
    TokenUrl::new(TOKEN_URL.to_owned()).map_err(|error| OAuthError::Endpoint(error.to_string()))
}

async fn receive_callback(
    listener: &TcpListener,
    expected_state: &str,
) -> Result<String, OAuthError> {
    let (mut stream, _) = timeout(CALLBACK_TIMEOUT, listener.accept())
        .await
        .map_err(|_| OAuthError::CallbackTimeout)??;
    let mut buffer = vec![0_u8; 16 * 1024];
    let read = stream.read(&mut buffer).await?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or(OAuthError::MissingCode)?;
    let result = parse_callback_target(target, expected_state);

    let (status, heading, message) = if result.is_ok() {
        (
            "200 OK",
            "Tforart FileForge is connected",
            "You can close this browser tab and return to the application.",
        )
    } else {
        (
            "400 Bad Request",
            "Tforart FileForge could not connect",
            "Return to Tforart FileForge and try the Google Drive connection again.",
        )
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{heading}</title></head>\
         <body style=\"font-family:Segoe UI,sans-serif;max-width:560px;margin:80px auto;padding:24px;\
         color:#172019\"><h1>{heading}</h1><p>{message}</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await?;

    result
}

fn parse_callback_target(target: &str, expected_state: &str) -> Result<String, OAuthError> {
    let url =
        Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| OAuthError::MissingCode)?;
    let mut code = None;
    let mut state = None;
    let mut oauth_error = None;

    for (name, value) in url.query_pairs() {
        match name.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => oauth_error = Some(value.into_owned()),
            _ => {}
        }
    }

    if let Some(error) = oauth_error {
        return Err(OAuthError::AuthorizationRejected(error));
    }
    if state.as_deref() != Some(expected_state) {
        return Err(OAuthError::StateMismatch);
    }
    code.filter(|value| !value.is_empty())
        .ok_or(OAuthError::MissingCode)
}

fn expiry_from_now(expires_in: Option<Duration>) -> Result<u64, OAuthError> {
    Ok(unix_now()?.saturating_add(expires_in.unwrap_or(Duration::from_secs(3600)).as_secs()))
}

fn unix_now() -> Result<u64, OAuthError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| OAuthError::InvalidSystemClock)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_parser_accepts_matching_state_and_decodes_code() {
        let code = parse_callback_target("/?state=safe-state&code=hello%2Fworld", "safe-state")
            .expect("valid callback");
        assert_eq!(code, "hello/world");
    }

    #[test]
    fn callback_parser_rejects_state_mismatch() {
        let result = parse_callback_target("/?state=attacker&code=secret", "expected");
        assert!(matches!(result, Err(OAuthError::StateMismatch)));
    }

    #[test]
    fn callback_parser_surfaces_google_denial() {
        let result = parse_callback_target("/?state=safe&error=access_denied", "safe");
        assert!(matches!(
            result,
            Err(OAuthError::AuthorizationRejected(message)) if message == "access_denied"
        ));
    }

    #[test]
    fn token_endpoint_temporary_codes_are_recoverable() {
        for code in [
            "temporarily_unavailable",
            "server_error",
            "rate_limit_exceeded",
            "slow_down",
        ] {
            assert!(is_transient_token_error_code(code));
        }
        assert!(!is_transient_token_error_code("invalid_grant"));
        assert!(!is_transient_token_error_code("invalid_client"));
    }
}
