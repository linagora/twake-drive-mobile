use super::http::{Stack, encode};
use crate::CoreError;
use crate::backup::RemoteFile;

/// The files directly in the folder of the device, all pages.
pub(crate) fn list_files(stack: &Stack, folder_id: &str) -> Result<Vec<RemoteFile>, CoreError> {
    let mut path = Some(format!("/files/{}?page%5Blimit%5D=1000", encode(folder_id)));
    let mut files = Vec::new();
    while let Some(current) = path {
        let page = stack.json("GET", &current, None, &[200])?;
        for doc in page["included"].as_array().into_iter().flatten() {
            let attributes = &doc["attributes"];
            let (Some(file_id), Some(md5)) = (doc["id"].as_str(), attributes["md5sum"].as_str())
            else {
                continue;
            };
            if attributes["type"] != "file" {
                continue;
            }
            files.push(RemoteFile {
                file_id: file_id.into(),
                md5: md5.into(),
                id_from_library: attributes["metadata"]["idFromLibrary"]
                    .as_str()
                    .map(String::from),
                name: attributes["name"].as_str().unwrap_or_default().into(),
            });
        }
        path = page["links"]["next"].as_str().map(String::from);
    }
    Ok(files)
}
