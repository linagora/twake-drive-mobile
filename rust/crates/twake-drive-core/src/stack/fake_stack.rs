//! An in-memory cozy-stack for the tests: the routes the backup calls, over a
//! tree of documents. No network.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use percent_encoding::percent_decode_str;
use serde_json::{Value, json};

use super::http::{HttpRequest, HttpResponse, StackTransport, TokenSource};
use crate::CoreError;

pub const BASE: &str = "https://alice.example";
const TOKEN: &str = "token";
const ROOT: &str = "io.cozy.files.root-dir";

#[derive(Default)]
struct State {
    docs: BTreeMap<String, Value>,
    references: BTreeMap<String, Vec<String>>,
    metadata: BTreeMap<String, Value>,
    next_id: u32,
    page_size: usize,
    requests: u32,
    failing: Option<u16>,
    adopting_meanwhile: Option<String>,
}

pub struct FakeStack {
    state: Mutex<State>,
}

impl FakeStack {
    pub fn new() -> Arc<Self> {
        let mut state = State {
            page_size: 1000,
            ..State::default()
        };
        state.docs.insert(ROOT.into(), dir_doc(ROOT, "", "", ""));
        Arc::new(Self {
            state: Mutex::new(state),
        })
    }

    pub fn requests(&self) -> u32 {
        self.state.lock().unwrap().requests
    }

    /// Another device adopts the folder between the next read and write.
    pub fn adopt_meanwhile(&self, device_id: &str) {
        self.state.lock().unwrap().adopting_meanwhile = Some(device_id.into());
    }

    /// Every request answers `status` from now on.
    pub fn fail_with(&self, status: u16) {
        self.state.lock().unwrap().failing = Some(status);
    }

    pub fn set_page_size(&self, size: usize) {
        self.state.lock().unwrap().page_size = size;
    }

    pub fn add_dir(&self, path: &str) -> String {
        self.add(path, |id, name, dir_id| dir_doc(id, name, path, dir_id))
    }

    pub fn drop_rev(&self, id: &str) {
        let mut state = self.state.lock().unwrap();
        state.docs.get_mut(id).unwrap()["meta"] = json!({});
    }

    pub fn add_device_dir(&self, path: &str, device_id: &str, created_at: &str) -> String {
        let id = self.add_dir(path);
        let mut state = self.state.lock().unwrap();
        let attributes = &mut state.docs.get_mut(&id).unwrap()["attributes"];
        attributes["metadata"] = json!({"backupDeviceIds": [device_id]});
        attributes["created_at"] = json!(created_at);
        id
    }

    pub fn add_file(&self, path: &str, md5: &str, id_from_library: Option<&str>) -> String {
        self.add(path, |id, name, dir_id| {
            json!({"type": "io.cozy.files", "id": id, "meta": {"rev": "1"}, "attributes": {
                "type": "file", "name": name, "path": path, "dir_id": dir_id,
                "md5sum": md5, "metadata": {"idFromLibrary": id_from_library}}})
        })
    }

    pub fn reference(&self, doc_id: &str, file_id: &str) {
        let mut state = self.state.lock().unwrap();
        state
            .references
            .entry(doc_id.into())
            .or_default()
            .push(file_id.into());
    }

    pub fn referenced(&self, doc_id: &str) -> Vec<String> {
        let state = self.state.lock().unwrap();
        state.references.get(doc_id).cloned().unwrap_or_default()
    }

    pub fn id_at(&self, path: &str) -> String {
        let state = self.state.lock().unwrap();
        find_by_path(&state, path).expect(path).to_string()
    }

    /// Creates the missing parents too, like a path given to `mkdir -p`.
    fn add(&self, path: &str, make: impl FnOnce(&str, &str, &str) -> Value) -> String {
        let (parent, name) = path.rsplit_once('/').unwrap();
        let dir_id = if parent.is_empty() {
            ROOT.to_string()
        } else {
            let existing = find_by_path(&self.state.lock().unwrap(), parent).map(String::from);
            existing.unwrap_or_else(|| self.add_dir(parent))
        };
        let mut state = self.state.lock().unwrap();
        state.next_id += 1;
        let id = format!("id{}", state.next_id);
        state.docs.insert(id.clone(), make(&id, name, &dir_id));
        id
    }

    fn route(
        &self,
        method: &str,
        path: &str,
        query: &BTreeMap<String, String>,
        body: Option<Value>,
        if_match: Option<String>,
    ) -> (u16, Value) {
        let mut state = self.state.lock().unwrap();
        let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
        match (method, parts.as_slice()) {
            ("GET", ["data", "io.cozy.apps", doc, "relationships", "references"]) => {
                let ids = state
                    .references
                    .get(&decode(doc))
                    .cloned()
                    .unwrap_or_default();
                let docs = ids
                    .iter()
                    .filter_map(|id| state.docs.get(id).cloned())
                    .collect();
                let (status, mut page) = paginate(&state, path, query, json!({}), docs);
                // Like the stack: the documents only with `include=files`.
                if query.get("include").map(String::as_str) != Some("files") {
                    page["included"] = json!([]);
                }
                (status, page)
            }
            ("POST", ["data", "io.cozy.apps", doc, "relationships", "references"]) => {
                let ids = body.unwrap()["data"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|r| r["id"].as_str().unwrap().to_string())
                    .collect::<Vec<_>>();
                state.references.entry(decode(doc)).or_default().extend(ids);
                (200, json!({}))
            }
            ("GET", ["files", "metadata"]) => match find_by_path(&state, &query["Path"]) {
                Some(id) => (200, json!({"data": state.docs[id]})),
                None => (404, json!({})),
            },
            ("POST", ["files", "upload", "metadata"]) => {
                state.next_id += 1;
                let id = format!("meta{}", state.next_id);
                state
                    .metadata
                    .insert(id.clone(), body.unwrap()["data"]["attributes"].clone());
                (201, json!({"data": {"id": id}}))
            }
            ("POST", ["files", dir])
                if query.get("Type").map(String::as_str) == Some("directory") =>
            {
                create_dir(&mut state, &decode(dir), query)
            }
            ("PATCH", ["files", id]) => {
                let id = decode(id);
                if let Some(other) = state.adopting_meanwhile.take() {
                    let doc = state.docs.get_mut(&id).unwrap();
                    let ids = &mut doc["attributes"]["metadata"]["backupDeviceIds"];
                    ids.as_array_mut().unwrap().push(json!(other));
                    bump(doc);
                }
                let doc = state.docs.get_mut(&id).unwrap();
                if if_match.is_some_and(|rev| doc["meta"]["rev"] != rev.as_str()) {
                    return (412, json!({}));
                }
                doc["attributes"]["metadata"] =
                    body.unwrap()["data"]["attributes"]["metadata"].clone();
                bump(doc);
                (200, json!({"data": doc}))
            }
            ("GET", ["files", id]) => {
                let id = decode(id);
                let children = state
                    .docs
                    .values()
                    .filter(|doc| doc["attributes"]["dir_id"] == id.as_str())
                    .cloned()
                    .collect();
                let dir = state.docs[&id].clone();
                paginate(&state, path, query, json!({"data": dir}), children)
            }
            _ => (404, json!({})),
        }
    }
}

impl StackTransport for FakeStack {
    fn send(&self, request: HttpRequest) -> Result<HttpResponse, CoreError> {
        let failing = {
            let mut state = self.state.lock().unwrap();
            state.requests += 1;
            state.failing
        };
        if let Some(status) = failing {
            return Ok(HttpResponse {
                status,
                body: vec![],
            });
        }
        let authorized = request
            .headers
            .iter()
            .any(|h| h.name == "Authorization" && h.value == format!("Bearer {TOKEN}"));
        if !authorized {
            return Ok(HttpResponse {
                status: 401,
                body: vec![],
            });
        }
        let url = request
            .url
            .strip_prefix(BASE)
            .expect("a request to the instance");
        let (path, raw_query) = url.split_once('?').unwrap_or((url, ""));
        let query = raw_query
            .split('&')
            .filter(|p| !p.is_empty())
            .map(|pair| {
                let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
                (decode(key), decode(value))
            })
            .collect();
        let body = request.body.map(|b| serde_json::from_slice(&b).unwrap());
        let if_match = request
            .headers
            .iter()
            .find(|h| h.name == "If-Match")
            .map(|h| h.value.clone());
        let (status, body) = self.route(&request.method, path, &query, body, if_match);
        Ok(HttpResponse {
            status,
            body: body.to_string().into_bytes(),
        })
    }
}

pub struct FakeTokens {
    current: Mutex<String>,
    refreshed_to: Mutex<String>,
    refreshes: Mutex<u32>,
}

impl FakeTokens {
    pub fn valid() -> Arc<Self> {
        Self::with(TOKEN)
    }

    pub fn stale() -> Arc<Self> {
        Self::with("stale")
    }

    /// A session the stack refuses, even after a refresh.
    pub fn revoked() -> Arc<Self> {
        let tokens = Self::with("revoked");
        *tokens.refreshed_to.lock().unwrap() = "still revoked".into();
        tokens
    }

    fn with(token: &str) -> Arc<Self> {
        Arc::new(Self {
            current: Mutex::new(token.into()),
            refreshed_to: Mutex::new(TOKEN.into()),
            refreshes: Mutex::new(0),
        })
    }

    pub fn refreshes(&self) -> u32 {
        *self.refreshes.lock().unwrap()
    }
}

impl TokenSource for FakeTokens {
    fn access_token(&self) -> Result<String, CoreError> {
        Ok(self.current.lock().unwrap().clone())
    }

    fn refresh(&self, _rejected: String) -> Result<String, CoreError> {
        *self.refreshes.lock().unwrap() += 1;
        let fresh = self.refreshed_to.lock().unwrap().clone();
        *self.current.lock().unwrap() = fresh.clone();
        Ok(fresh)
    }
}

fn decode(value: &str) -> String {
    percent_decode_str(value).decode_utf8_lossy().into_owned()
}

fn bump(doc: &mut Value) {
    let rev: u32 = doc["meta"]["rev"].as_str().unwrap().parse().unwrap();
    doc["meta"]["rev"] = json!((rev + 1).to_string());
}

fn dir_doc(id: &str, name: &str, path: &str, dir_id: &str) -> Value {
    json!({"type": "io.cozy.files", "id": id, "meta": {"rev": "1"}, "attributes": {
        "type": "directory", "name": name, "path": path, "dir_id": dir_id,
        "created_at": "2026-11-11T00:00:00Z"}})
}

fn find_by_path<'a>(state: &'a State, path: &str) -> Option<&'a str> {
    state
        .docs
        .iter()
        .find(|(_, doc)| doc["attributes"]["path"] == path)
        .map(|(id, _)| id.as_str())
}

fn create_dir(
    state: &mut State,
    parent_id: &str,
    query: &BTreeMap<String, String>,
) -> (u16, Value) {
    let name = &query["Name"];
    let parent_path = state.docs[parent_id]["attributes"]["path"]
        .as_str()
        .unwrap()
        .to_string();
    let path = format!("{parent_path}/{name}");
    if find_by_path(state, &path).is_some() {
        return (409, json!({}));
    }
    state.next_id += 1;
    let id = format!("id{}", state.next_id);
    let mut doc = dir_doc(&id, name, &path, parent_id);
    if let Some(meta) = query.get("MetadataID") {
        doc["attributes"]["metadata"] = state.metadata[meta].clone();
    }
    state.docs.insert(id, doc.clone());
    (201, json!({"data": doc}))
}

/// JSON:API pages: `page[cursor]` is the index of the first item.
fn paginate(
    state: &State,
    path: &str,
    query: &BTreeMap<String, String>,
    mut page: Value,
    items: Vec<Value>,
) -> (u16, Value) {
    let start: usize = query.get("page[cursor]").map_or(0, |c| c.parse().unwrap());
    let end = (start + state.page_size).min(items.len());
    page["included"] = json!(items[start..end]);
    if end < items.len() {
        page["links"] = json!({"next": format!("{path}?page%5Bcursor%5D={end}")});
    }
    (200, page)
}
