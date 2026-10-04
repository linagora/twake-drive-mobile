// Creates what a flow acts on, through the stack's API, under names no other
// flow uses, and records it for cleanup.js.
//
// SEED is a JSON list of { key, kind: 'folder' | 'file', prefix, parent?, ext?,
// content?, silence? }. Each entry lands in `output[key]` as { id, name };
// `parent` is the key of a folder earlier in the same list. `silence: true`
// makes the file a WAV of silence instead of text (give it ext "wav").
// The run passes STACK_URL, STACK_HOST and STACK_TOKEN (e2e/scripts/run-flows.sh).

const headers = { Authorization: 'Bearer ' + STACK_TOKEN, Host: STACK_HOST }

// 30 seconds of 16-bit mono silence. The body goes out as a string, so no
// byte may be above 0x7f: the samples are zeros, and the rate and the sizes
// are picked so that none of their bytes is.
const SAMPLE_RATE = 0x1f00
const DATA_BYTES = 0x074400
const le32 = n => String.fromCharCode(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff)
const le16 = n => String.fromCharCode(n & 0xff, (n >> 8) & 0xff)
const silenceWav = () =>
  'RIFF' +
  le32(36 + DATA_BYTES) +
  'WAVEfmt ' +
  le32(16) +
  le16(1) + // PCM
  le16(1) + // mono
  le32(SAMPLE_RATE) +
  le32(SAMPLE_RATE * 2) +
  le16(2) +
  le16(16) +
  'data' +
  le32(DATA_BYTES) +
  new Array(DATA_BYTES + 1).join(String.fromCharCode(0))

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

  const contentType = entry.silence ? 'audio/wav' : 'text/plain'
  const content = entry.silence ? silenceWav() : entry.content || 'e2e ' + name + '\n'
  const response = http.post(url, {
    headers: isFile ? Object.assign({ 'Content-Type': contentType }, headers) : headers,
    body: isFile ? content : ''
  })
  if (!response.ok) {
    throw new Error('seeding ' + name + ' failed: ' + response.status + ' ' + response.body)
  }

  const id = JSON.parse(response.body).data.id
  output[entry.key] = { id: id, name: name }
  output.seeded = (output.seeded || []).concat([id])
})
