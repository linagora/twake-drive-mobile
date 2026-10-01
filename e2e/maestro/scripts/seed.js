// Creates what a flow acts on, through the stack's API, under names no other
// flow uses, and records it for cleanup.js.
//
// SEED is a JSON list of { key, kind: 'folder' | 'file', prefix, parent?, ext?,
// content? }. Each entry lands in `output[key]` as { id, name }; `parent` is the
// key of a folder earlier in the same list.
// The run passes STACK_URL, STACK_HOST and STACK_TOKEN (e2e/scripts/run-flows.sh).

const headers = { Authorization: 'Bearer ' + STACK_TOKEN, Host: STACK_HOST }

JSON.parse(SEED).forEach(entry => {
  const parentId = entry.parent ? output[entry.parent].id : 'io.cozy.files.root-dir'
  const suffix = Math.random().toString(36).slice(2, 7)
  const name = entry.prefix + '-' + suffix + (entry.ext ? '.' + entry.ext : '')
  const isFile = entry.kind === 'file'
  const url =
    STACK_URL +
    '/files/' +
    parentId +
    '?Type=' +
    (isFile ? 'file' : 'directory') +
    '&Name=' +
    encodeURIComponent(name)

  const response = http.post(url, {
    headers: isFile ? Object.assign({ 'Content-Type': 'text/plain' }, headers) : headers,
    body: isFile ? entry.content || 'e2e ' + name + '\n' : ''
  })
  if (!response.ok) {
    throw new Error('seeding ' + name + ' failed: ' + response.status + ' ' + response.body)
  }

  const id = JSON.parse(response.body).data.id
  output[entry.key] = { id: id, name: name }
  output.seeded = (output.seeded || []).concat([id])
})
