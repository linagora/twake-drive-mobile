use serde_json::Value;

use super::http::{Stack, encode, query, unexpected};
use crate::CoreError;
use crate::backup::RemoteFile;
use crate::library::may_stand_for_own_media;

/// The files directly in the folder of the device, all pages. An
/// idFromLibrary that cannot stand for a media of this phone is left out:
/// the file still counts for its content, never as a media's older version.
pub(crate) fn list_files(
    stack: &Stack,
    folder_id: &str,
    this_device: Option<&str>,
) -> Result<Vec<RemoteFile>, CoreError> {
    let mut path = Some(format!("/files/{}?page%5Blimit%5D=1000", encode(folder_id)));
    let mut files = Vec::new();
    while let Some(current) = path {
        let page = stack.json("GET", &current, None, &[200])?;
        files.extend(
            page["included"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|doc| remote_file(doc, this_device)),
        );
        path = page["links"]["next"].as_str().map(String::from);
    }
    Ok(files)
}

/// The file at `path`, read as `list_files` reads it; None when nothing or a
/// folder is there.
pub(crate) fn file_at(
    stack: &Stack,
    path: &str,
    this_device: Option<&str>,
) -> Result<Option<RemoteFile>, CoreError> {
    let route = format!("/files/metadata?{}", query(&[("Path", path)]));
    let response = stack.call("GET", &route, None)?;
    match response.status {
        200 => {
            let doc: Value =
                serde_json::from_slice(&response.body).map_err(|e| CoreError::Stack {
                    reason: format!("GET /files/metadata: {e}"),
                })?;
            Ok(remote_file(&doc["data"], this_device))
        }
        404 => Ok(None),
        status => Err(unexpected("GET", &route, status)),
    }
}

fn remote_file(doc: &Value, this_device: Option<&str>) -> Option<RemoteFile> {
    let attributes = &doc["attributes"];
    if attributes["type"] != "file" {
        return None;
    }
    let metadata = &attributes["metadata"];
    let sent_from: Vec<String> = metadata["backupDeviceIds"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|id| id.as_str().map(String::from))
        .collect();
    Some(RemoteFile {
        file_id: doc["id"].as_str()?.into(),
        md5: attributes["md5sum"].as_str()?.into(),
        id_from_library: metadata["idFromLibrary"]
            .as_str()
            .filter(|id| may_stand_for_own_media(id, &sent_from, this_device))
            .map(String::from),
        name: attributes["name"].as_str().unwrap_or_default().into(),
    })
}
