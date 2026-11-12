use serde_json::{Value, json};

use super::dates::rfc3339;
use super::folders::numbered;
use super::http::{Header, HttpRequest, Stack, encode, query};
use crate::CoreError;
use crate::backup::UploadOutcome;

/// A media ready to go: hashed, its file readable by the platform.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MediaToSend {
    pub local_id: String,
    pub name: String,
    pub mime: String,
    pub size: u64,
    pub md5: String,
    pub created_at: i64,
    pub modified_at: i64,
    /// For the photo of a Live Photo: the Drive file of its video.
    pub paired_video_id: Option<String>,
}

/// The upload to send, without its body: the platform attaches the file,
/// in the foreground or in a background session.
pub(crate) fn request(
    stack: &Stack,
    folder_id: &str,
    device_id: &str,
    media: &MediaToSend,
    existing_file: Option<&str>,
    name_attempt: u32,
) -> Result<HttpRequest, CoreError> {
    let metadata = metadata(device_id, media).to_string();
    let updated_at = rfc3339(media.modified_at);
    let size = media.size.to_string();
    let (method, path) = match existing_file {
        Some(file_id) => (
            "PUT",
            format!(
                "/files/{}?{}",
                encode(file_id),
                // A new version takes its tags from this request.
                query(&[
                    ("Tags", "library"),
                    ("UpdatedAt", &updated_at),
                    ("Metadata", &metadata),
                    ("Size", &size),
                ])
            ),
        ),
        None => (
            "POST",
            format!(
                "/files/{}?{}",
                encode(folder_id),
                query(&[
                    ("Type", "file"),
                    ("Name", &numbered(&media.name, name_attempt, true)),
                    ("Tags", "library"),
                    ("Executable", "false"),
                    ("CreatedAt", &rfc3339(media.created_at)),
                    ("UpdatedAt", &updated_at),
                    ("Metadata", &metadata),
                    ("Size", &size),
                ])
            ),
        ),
    };
    Ok(HttpRequest {
        method: method.into(),
        url: format!("{}{path}", stack.base_url),
        headers: vec![
            stack.bearer()?,
            header("Content-MD5", &media.md5),
            header("Content-Type", &media.mime),
        ],
        body: None,
    })
}

/// The metadata the flagship app writes, so Photos web and earlier backups
/// read these files the same way.
fn metadata(device_id: &str, media: &MediaToSend) -> Value {
    let mut metadata = json!({
        "backupDeviceIds": [device_id],
        "idFromLibrary": media.local_id,
        "creationDateFromLibrary": rfc3339(media.created_at),
    });
    if let Some(video) = &media.paired_video_id {
        metadata["pairedVideoId"] = json!(video);
    }
    metadata
}

fn header(name: &str, value: &str) -> Header {
    Header {
        name: name.into(),
        value: value.into(),
    }
}

/// What the stack answered to an upload. `None` for a 409: the name is
/// taken, the next request goes with another one.
pub(crate) fn outcome(status: u16, body: &[u8]) -> Result<Option<UploadOutcome>, CoreError> {
    Ok(Some(match status {
        200 | 201 => {
            let doc: Value = serde_json::from_slice(body).map_err(|e| CoreError::Stack {
                reason: format!("upload answer: {e}"),
            })?;
            let file_id = doc["data"]["id"].as_str().ok_or_else(|| CoreError::Stack {
                reason: "upload answer without an id".into(),
            })?;
            UploadOutcome::Uploaded {
                file_id: file_id.into(),
            }
        }
        409 => return Ok(None),
        412 => UploadOutcome::ContentChanged,
        // The stack tells the two 413 apart by their message only. Any other
        // 413, e.g. a proxy's body limit, is about this file's size.
        413 if String::from_utf8_lossy(body).contains("disk quota") => UploadOutcome::QuotaExceeded,
        413 => UploadOutcome::FileTooLarge,
        401 => UploadOutcome::Unauthorized,
        500..=599 => UploadOutcome::Server { status },
        _ => UploadOutcome::Refused { status },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_answers_of_the_stack_become_outcomes() {
        let created = br#"{"data":{"id":"f1"}}"#;
        assert_eq!(
            outcome(201, created).unwrap(),
            Some(UploadOutcome::Uploaded {
                file_id: "f1".into()
            })
        );
        assert_eq!(outcome(409, b"").unwrap(), None);
        assert_eq!(
            outcome(412, b"").unwrap(),
            Some(UploadOutcome::ContentChanged)
        );
        let quota = br#"{"errors":[{"detail":"The file is too big and exceeds the disk quota"}]}"#;
        assert_eq!(
            outcome(413, quota).unwrap(),
            Some(UploadOutcome::QuotaExceeded)
        );
        let too_big = br#"{"errors":[{"detail":"The file is too big and exceeds the filesystem maximum file size"}]}"#;
        assert_eq!(
            outcome(413, too_big).unwrap(),
            Some(UploadOutcome::FileTooLarge)
        );
        let proxy = b"<html><head><title>413 Request Entity Too Large</title></head></html>";
        assert_eq!(
            outcome(413, proxy).unwrap(),
            Some(UploadOutcome::FileTooLarge)
        );
        assert_eq!(
            outcome(401, b"").unwrap(),
            Some(UploadOutcome::Unauthorized)
        );
        assert_eq!(
            outcome(503, b"").unwrap(),
            Some(UploadOutcome::Server { status: 503 })
        );
        assert_eq!(
            outcome(404, b"").unwrap(),
            Some(UploadOutcome::Refused { status: 404 })
        );
        assert!(outcome(201, b"{}").is_err());
    }
}
