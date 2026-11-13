use serde_json::{Value, json};

use super::dates::rfc3339;
use super::http::{Stack, encode, unexpected};
use crate::CoreError;

const ALBUMS: &str = "io.cozy.photos.albums";
/// References per request: the stack takes them in one transaction.
pub(crate) const REFERENCES_PER_CALL: usize = 100;

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

/// The stack takes references to a deleted album without a word: the album is
/// read before any.
pub(crate) fn exists(stack: &Stack, album_id: &str) -> Result<bool, CoreError> {
    let path = format!("/data/{ALBUMS}/{}", encode(album_id));
    match stack.call("GET", &path, None)?.status {
        200 => Ok(true),
        404 => Ok(false),
        status => Err(unexpected("GET", &path, status)),
    }
}

/// The files an album references already: the stack does not dedup a
/// reference sent again.
pub(crate) fn referenced_files(stack: &Stack, album_id: &str) -> Result<Vec<String>, CoreError> {
    let mut path = Some(format!(
        "/data/{ALBUMS}/{}/relationships/references?page%5Blimit%5D=1000",
        encode(album_id)
    ));
    let mut files = Vec::new();
    while let Some(current) = path {
        let page = stack.json("GET", &current, None, &[200])?;
        files.extend(
            page["data"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|reference| reference["id"].as_str().map(String::from)),
        );
        path = page["links"]["next"].as_str().map(String::from);
    }
    Ok(files)
}

/// The files of `chunk` done with: referenced, or gone from Drive. The stack
/// refuses a whole request for one file deleted meanwhile, so such a request
/// goes again file by file.
pub(crate) fn add_files(
    stack: &Stack,
    album_id: &str,
    chunk: &[String],
) -> Result<Vec<String>, CoreError> {
    let path = format!(
        "/data/{ALBUMS}/{}/relationships/references",
        encode(album_id)
    );
    let send = |files: &[String]| -> Result<u16, CoreError> {
        let data: Vec<Value> = files
            .iter()
            .map(|id| json!({"type": "io.cozy.files", "id": id}))
            .collect();
        Ok(stack
            .call("POST", &path, Some(json!({ "data": data })))?
            .status)
    };
    match send(chunk)? {
        200..=299 => return Ok(chunk.to_vec()),
        404 if chunk.len() > 1 => {}
        404 => return Ok(chunk.to_vec()),
        status => return Err(unexpected("POST", &path, status)),
    }
    let mut done = Vec::new();
    for file in chunk {
        match send(std::slice::from_ref(file))? {
            200..=299 | 404 => done.push(file.clone()),
            status => return Err(unexpected("POST", &path, status)),
        }
    }
    Ok(done)
}

/// An album of the phone, with the media it holds.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct AlbumMedia {
    pub album_id: String,
    pub name: String,
    pub local_ids: Vec<String>,
}
