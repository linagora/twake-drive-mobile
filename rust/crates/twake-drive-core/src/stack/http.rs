use std::sync::Arc;

use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use serde_json::Value;

use crate::CoreError;

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Header {
    pub name: String,
    pub value: String,
}

/// A request the platform sends as is. `url` is absolute.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<Header>,
    pub body: Option<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

/// Sends a request to the stack, from the platform's own HTTP client. The core
/// calls it synchronously: never from the main thread. A request that got no
/// answer returns `CoreError::Network`, whose reason leaves the URL out: it may
/// hold a file name.
#[uniffi::export(with_foreign)]
pub trait StackTransport: Send + Sync {
    fn send(&self, request: HttpRequest) -> Result<HttpResponse, CoreError>;
}

/// The access token, from the platform: it owns the session and refreshes it
/// for the app and its extensions alike.
#[uniffi::export(with_foreign)]
pub trait TokenSource: Send + Sync {
    fn access_token(&self) -> Result<String, CoreError>;
    /// A new token, after the stack refused `rejected`.
    fn refresh(&self, rejected: String) -> Result<String, CoreError>;
}

/// `encodeURIComponent`: what cozy-stack-client does to ids and parameters.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

pub(crate) fn encode(value: &str) -> String {
    utf8_percent_encode(value, COMPONENT).to_string()
}

pub(crate) fn query(params: &[(&str, &str)]) -> String {
    params
        .iter()
        .map(|(key, value)| format!("{key}={}", encode(value)))
        .collect::<Vec<_>>()
        .join("&")
}

pub(crate) struct Stack {
    pub base_url: String,
    pub transport: Arc<dyn StackTransport>,
    pub tokens: Arc<dyn TokenSource>,
}

impl Stack {
    pub(crate) fn bearer(&self) -> Result<Header, CoreError> {
        Ok(authorization(&self.tokens.access_token()?))
    }

    /// A short call. A 401 gets one new token and one more try.
    pub(crate) fn call(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<HttpResponse, CoreError> {
        let token = self.tokens.access_token()?;
        let response = self.send(method, path, body.clone(), &token)?;
        if response.status != 401 {
            return Ok(response);
        }
        let token = self.tokens.refresh(token)?;
        self.send(method, path, body, &token)
    }

    fn send(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
        token: &str,
    ) -> Result<HttpResponse, CoreError> {
        let mut headers = vec![
            authorization(token),
            Header {
                name: "Accept".into(),
                value: "application/vnd.api+json".into(),
            },
        ];
        if body.is_some() {
            headers.push(Header {
                name: "Content-Type".into(),
                value: "application/vnd.api+json".into(),
            });
        }
        self.transport.send(HttpRequest {
            method: method.into(),
            url: format!("{}{path}", self.base_url),
            headers,
            body: body.map(|b| b.to_string().into_bytes()),
        })
    }

    /// A short call that must answer `expected`, read as JSON.
    pub(crate) fn json(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
        expected: &[u16],
    ) -> Result<Value, CoreError> {
        let response = self.call(method, path, body)?;
        if !expected.contains(&response.status) {
            return Err(unexpected(method, path, response.status));
        }
        serde_json::from_slice(&response.body).map_err(|e| CoreError::Stack {
            reason: format!("{method} {}: {e}", route(path)),
        })
    }
}

fn authorization(token: &str) -> Header {
    Header {
        name: "Authorization".into(),
        value: format!("Bearer {token}"),
    }
}

pub(crate) fn unexpected(method: &str, path: &str, status: u16) -> CoreError {
    CoreError::Stack {
        reason: format!("{method} {}: HTTP {status}", route(path)),
    }
}

/// The path without its query: a query may hold a file name.
pub(crate) fn route(path: &str) -> &str {
    path.split('?').next().unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn components_are_encoded_like_encode_uri_component() {
        assert_eq!(
            encode("io.cozy.apps/photos/mobile"),
            "io.cozy.apps%2Fphotos%2Fmobile"
        );
        assert_eq!(encode("Été (1).jpg"), "%C3%89t%C3%A9%20(1).jpg");
        assert_eq!(
            query(&[("Type", "file"), ("Name", "a&b")]),
            "Type=file&Name=a%26b"
        );
    }

    #[test]
    fn an_error_keeps_the_query_out() {
        let CoreError::Stack { reason } = unexpected("POST", "/files/d?Name=secret.jpg", 500)
        else {
            panic!()
        };
        assert_eq!(reason, "POST /files/d: HTTP 500");
    }
}
