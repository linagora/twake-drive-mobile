use serde_json::Value;

use super::http::{Stack, encode, query, unexpected};
use crate::CoreError;
use crate::backup::RemoteFile;

/// The files directly in the folder of the device, all pages.
pub(crate) fn list_files(stack: &Stack, folder_id: &str) -> Result<Vec<RemoteFile>, CoreError> {
    let mut path = Some(format!("/files/{}?page%5Blimit%5D=1000", encode(folder_id)));
    let mut files = Vec::new();
    while let Some(current) = path {
        let page = stack.json("GET", &current, None, &[200])?;
        files.extend(
            page["included"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(remote_file),
        );
        path = page["links"]["next"].as_str().map(String::from);
    }
    Ok(files)
}

/// The file at `path` and the devices whose backups sent it, None when
/// nothing or a folder is there.
pub(crate) fn file_at(
    stack: &Stack,
    path: &str,
) -> Result<Option<(RemoteFile, Vec<String>)>, CoreError> {
    let route = format!("/files/metadata?{}", query(&[("Path", path)]));
    let response = stack.call("GET", &route, None)?;
    match response.status {
        200 => {
            let doc: Value =
                serde_json::from_slice(&response.body).map_err(|e| CoreError::Stack {
                    reason: format!("GET /files/metadata: {e}"),
                })?;
            let doc = &doc["data"];
            let devices = doc["attributes"]["metadata"]["backupDeviceIds"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|id| id.as_str().map(String::from))
                .collect();
            Ok(remote_file(doc).map(|file| (file, devices)))
        }
        404 => Ok(None),
        status => Err(unexpected("GET", &route, status)),
    }
}

fn remote_file(doc: &Value) -> Option<RemoteFile> {
    let attributes = &doc["attributes"];
    if attributes["type"] != "file" {
        return None;
    }
    Some(RemoteFile {
        file_id: doc["id"].as_str()?.into(),
        md5: attributes["md5sum"].as_str()?.into(),
        id_from_library: attributes["metadata"]["idFromLibrary"]
            .as_str()
            .map(String::from),
        name: attributes["name"].as_str().unwrap_or_default().into(),
    })
}
