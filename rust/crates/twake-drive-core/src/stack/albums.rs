use serde_json::{Value, json};

use super::dates::rfc3339;
use super::http::{Stack, unexpected};
use crate::CoreError;

const ALBUMS: &str = "io.cozy.photos.albums";

/// The albums the backups made, every device included, as `(id, name)`: the
/// flagship app picks one up by its name.
pub(crate) fn list(stack: &Stack) -> Result<Vec<(String, String)>, CoreError> {
    let path = format!("/data/{ALBUMS}/_all_docs?include_docs=true");
    let response = stack.call("GET", &path, None)?;
    let page: Value = match response.status {
        200 => serde_json::from_slice(&response.body).map_err(|e| CoreError::Stack {
            reason: format!("GET /data/{ALBUMS}/_all_docs: {e}"),
        })?,
        // No album yet: the database of the doctype does not exist.
        404 => return Ok(Vec::new()),
        status => return Err(unexpected("GET", &path, status)),
    };
    Ok(page["rows"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|row| &row["doc"])
        .filter(|doc| doc["backupDeviceIds"].is_array())
        .filter_map(|doc| {
            Some((
                doc["_id"].as_str()?.to_string(),
                doc["name"].as_str()?.to_string(),
            ))
        })
        .collect())
}

/// An album as the flagship app makes it, for Drive Photos.
pub(crate) fn create(
    stack: &Stack,
    name: &str,
    device_id: &str,
    now: i64,
) -> Result<String, CoreError> {
    let created = stack.json(
        "POST",
        &format!("/data/{ALBUMS}/"),
        Some(json!({"name": name, "created_at": rfc3339(now), "backupDeviceIds": [device_id]})),
        &[201],
    )?;
    created["id"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| CoreError::Stack {
            reason: "an album without an id".into(),
        })
}

/// An album of the phone the user picked, with the media it holds.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct AlbumMedia {
    pub album_id: String,
    pub name: String,
    pub local_ids: Vec<String>,
}
