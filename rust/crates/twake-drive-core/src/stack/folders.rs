use serde_json::{Value, json};

use super::dates::seconds_of;
use super::http::{Header, Stack, encode, query, route, unexpected};
use crate::CoreError;

/// The flagship app's references: Photos web finds the backups through them.
const PHOTOS_REF: &str = "io.cozy.apps/photos";
const BACKUP_REF: &str = "io.cozy.apps/photos/mobile";
const ROOT_DIR: &str = "io.cozy.files.root-dir";
pub(crate) const MAX_NAME_ATTEMPTS: u32 = 50;
const MAX_ADOPT_ATTEMPTS: u32 = 5;

/// A folder the backup of one phone goes to:
/// `/Photos/<backup root>/<device name>`.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct DeviceFolder {
    pub id: String,
    pub name: String,
    pub path: String,
    pub device_ids: Vec<String>,
    pub created_at: String,
}

/// `name (1)`, `name (2)`… keeping the extension of a file.
pub(crate) fn numbered(name: &str, attempt: u32, keep_extension: bool) -> String {
    if attempt == 0 {
        return name.to_string();
    }
    let dot = name.rfind('.').filter(|&i| keep_extension && i > 0);
    let (base, ext) = dot.map_or((name, ""), |i| name.split_at(i));
    format!("{base} ({attempt}){ext}")
}

pub(crate) fn list(stack: &Stack) -> Result<Vec<DeviceFolder>, CoreError> {
    let mut folders: Vec<DeviceFolder> = referenced_dirs(stack, BACKUP_REF)?
        .iter()
        .map(to_folder)
        .collect();
    folders.sort_by_key(|folder| std::cmp::Reverse(seconds_of(&folder.created_at)));
    Ok(folders)
}

pub(crate) fn create(
    stack: &Stack,
    device_id: &str,
    device_name: &str,
    root_name: &str,
) -> Result<DeviceFolder, CoreError> {
    let photos = photos_folder(stack)?;
    let root = dir_by_path_or_create(stack, &id_of(&photos)?, &path_of(&photos), root_name)?;
    let metadata = stack.json(
        "POST",
        "/files/upload/metadata",
        Some(json!({"data": {"type": "io.cozy.files.metadata",
            "attributes": {"backupDeviceIds": [device_id]}}})),
        &[201],
    )?;
    let metadata_id = id_of(&metadata["data"])?;
    let folder = create_dir_numbered(stack, &id_of(&root)?, device_name, &metadata_id)?;
    add_reference(stack, BACKUP_REF, &id_of(&folder)?)?;
    Ok(to_folder(&folder))
}

/// Adds `device_id` to the devices of a folder, keeping the rest of its
/// metadata: the stack replaces the metadata of a directory as a whole, so
/// the write is conditional on the revision read, and read again if another
/// device wrote in between.
pub(crate) fn adopt(
    stack: &Stack,
    folder_id: &str,
    device_id: &str,
) -> Result<DeviceFolder, CoreError> {
    let path = format!("/files/{}", encode(folder_id));
    for _ in 0..MAX_ADOPT_ATTEMPTS {
        let folder = stack.json("GET", &path, None, &[200])?["data"].clone();
        let patch = json!({"data": {"type": "io.cozy.files", "id": folder_id,
            "attributes": {"metadata": with_device(&folder, device_id)}}});
        let if_match = Header {
            name: "If-Match".into(),
            value: folder["meta"]["rev"].as_str().unwrap_or_default().into(),
        };
        let response = stack.call_with("PATCH", &path, Some(patch), &[if_match])?;
        match response.status {
            200 => return Ok(to_folder(&data_of(&response.body, &path)?)),
            412 => continue,
            status => return Err(unexpected("PATCH", &path, status)),
        }
    }
    Err(CoreError::Stack {
        reason: "the device folder kept changing".into(),
    })
}

fn with_device(folder: &Value, device_id: &str) -> Value {
    let mut metadata = folder["attributes"]["metadata"].clone();
    if !metadata.is_object() {
        metadata = json!({});
    }
    let ids = &mut metadata["backupDeviceIds"];
    if !ids.is_array() {
        *ids = json!([]);
    }
    let ids = ids.as_array_mut().expect("an array");
    if !ids.iter().any(|id| id == device_id) {
        ids.push(json!(device_id));
    }
    metadata
}

fn photos_folder(stack: &Stack) -> Result<Value, CoreError> {
    if let Some(photos) = referenced_dirs(stack, PHOTOS_REF)?.into_iter().next() {
        return Ok(photos);
    }
    let photos = dir_by_path_or_create(stack, ROOT_DIR, "", "Photos")?;
    add_reference(stack, PHOTOS_REF, &id_of(&photos)?)?;
    Ok(photos)
}

/// The directories a document references, out of the trash, all pages.
fn referenced_dirs(stack: &Stack, doc_id: &str) -> Result<Vec<Value>, CoreError> {
    let mut path = Some(format!(
        "/data/io.cozy.apps/{}/relationships/references?include=files&page%5Blimit%5D=1000",
        encode(doc_id)
    ));
    let mut dirs = Vec::new();
    while let Some(current) = path {
        let page = stack.json("GET", &current, None, &[200])?;
        let included = page["included"].as_array().cloned().unwrap_or_default();
        dirs.extend(included.into_iter().filter(|doc| {
            doc["attributes"]["type"] == "directory" && !path_of(doc).starts_with("/.cozy_trash")
        }));
        // The stack's next link keeps the cursor only, not `include`.
        path = page["links"]["next"]
            .as_str()
            .map(|next| format!("{next}&include=files"));
    }
    Ok(dirs)
}

fn dir_by_path_or_create(
    stack: &Stack,
    parent_id: &str,
    parent_path: &str,
    name: &str,
) -> Result<Value, CoreError> {
    let path = format!("{parent_path}/{name}");
    let by_path = format!("/files/metadata?{}", query(&[("Path", &path)]));
    let found = stack.call("GET", &by_path, None)?;
    match found.status {
        200 => return data_of(&found.body, &by_path),
        404 => {}
        status => return Err(unexpected("GET", &by_path, status)),
    }
    let create = format!(
        "/files/{}?{}",
        encode(parent_id),
        query(&[("Type", "directory"), ("Name", name)])
    );
    let created = stack.call("POST", &create, None)?;
    match created.status {
        201 => data_of(&created.body, &create),
        // Created meanwhile by another device or app.
        409 => Ok(stack.json("GET", &by_path, None, &[200])?["data"].clone()),
        status => Err(unexpected("POST", &create, status)),
    }
}

fn create_dir_numbered(
    stack: &Stack,
    parent_id: &str,
    name: &str,
    metadata_id: &str,
) -> Result<Value, CoreError> {
    for attempt in 0..MAX_NAME_ATTEMPTS {
        let path = format!(
            "/files/{}?{}",
            encode(parent_id),
            query(&[
                ("Type", "directory"),
                ("Name", &numbered(name, attempt, false)),
                ("MetadataID", metadata_id),
            ])
        );
        let response = stack.call("POST", &path, None)?;
        match response.status {
            201 => return data_of(&response.body, &path),
            409 => continue,
            status => return Err(unexpected("POST", &path, status)),
        }
    }
    Err(CoreError::Stack {
        reason: "no free name for the device folder".into(),
    })
}

fn add_reference(stack: &Stack, doc_id: &str, file_id: &str) -> Result<(), CoreError> {
    let path = format!(
        "/data/io.cozy.apps/{}/relationships/references",
        encode(doc_id)
    );
    let body = json!({"data": [{"type": "io.cozy.files", "id": file_id}]});
    let response = stack.call("POST", &path, Some(body))?;
    if !(200..300).contains(&response.status) {
        return Err(unexpected("POST", &path, response.status));
    }
    Ok(())
}

fn data_of(body: &[u8], path: &str) -> Result<Value, CoreError> {
    serde_json::from_slice::<Value>(body)
        .map(|doc| doc["data"].clone())
        .map_err(|e| CoreError::Stack {
            reason: format!("{}: {e}", route(path)),
        })
}

fn id_of(doc: &Value) -> Result<String, CoreError> {
    doc["id"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| CoreError::Stack {
            reason: "a document without an id".into(),
        })
}

fn path_of(doc: &Value) -> String {
    doc["attributes"]["path"]
        .as_str()
        .unwrap_or_default()
        .to_string()
}

fn to_folder(doc: &Value) -> DeviceFolder {
    let attributes = &doc["attributes"];
    DeviceFolder {
        id: doc["id"].as_str().unwrap_or_default().to_string(),
        name: attributes["name"].as_str().unwrap_or_default().to_string(),
        path: path_of(doc),
        device_ids: attributes["metadata"]["backupDeviceIds"]
            .as_array()
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| id.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        created_at: attributes["created_at"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_taken_name_gets_a_number_before_its_extension() {
        assert_eq!(numbered("IMG_1.HEIC", 0, true), "IMG_1.HEIC");
        assert_eq!(numbered("IMG_1.HEIC", 2, true), "IMG_1 (2).HEIC");
        assert_eq!(numbered(".hidden", 1, true), ".hidden (1)");
        assert_eq!(numbered("Pixel 8.1", 1, false), "Pixel 8.1 (1)");
    }
}
