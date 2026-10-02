// Puts a share waiting to be accepted on the instance, and records its shortcut
// for cleanup.js.
//
// A second instance is not needed: this is the request the owner's stack sends
// to the recipient's one to announce a share (cozy-stack `Member.SendShortcut`),
// a route that takes no token. The stack answers it by creating the inactive
// sharing and its shortcut, `metadata.sharing.status: new`, in the
// shared-with-me directory.
//
// PREFIX names the share. It lands in `output.share` as { id, name, sharing }:
// the shortcut's id and file name, and the id of the sharing.
// The run passes STACK_URL and STACK_HOST (e2e/scripts/run-flows.sh).

const random = () => Math.random().toString(36).slice(2, 10)

const sharingId = 'e2e' + random() + random()
const description = PREFIX + '-' + random().slice(0, 5)
// What opening the shortcut resolves to. The real one is the owner's discovery
// page; this one stays on the instance of the run.
const link = 'http://' + STACK_HOST + '/sharings/' + sharingId + '/discovery?state=e2e'

const response = http.request(
  STACK_URL + '/sharings/' + sharingId + '?shortcut=true&url=' + encodeURIComponent(link),
  {
    method: 'PUT',
    headers: {
      Host: STACK_HOST,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json'
    },
    body: JSON.stringify({
      data: {
        type: 'io.cozy.sharings',
        id: sharingId,
        attributes: {
          description: description,
          app_slug: 'drive',
          rules: [
            {
              title: description,
              doctype: 'io.cozy.files',
              // the owner's id for the folder, which exists nowhere here
              values: ['e2e' + random() + random()],
              add: 'sync',
              update: 'sync',
              remove: 'sync'
            }
          ],
          members: [
            {
              status: 'owner',
              public_name: 'E2E owner',
              email: 'e2e-owner@example.org',
              instance: 'http://e2e-owner.example.org'
            },
            { status: 'pending', email: 'e2e@example.com', instance: 'http://' + STACK_HOST }
          ]
        }
      }
    })
  }
)
if (!response.ok) {
  throw new Error('seeding the share failed: ' + response.status + ' ' + response.body)
}

const shortcutId = JSON.parse(response.body).data.attributes.shortcut_id
if (!shortcutId) {
  throw new Error('the stack created no shortcut for the share: ' + response.body)
}

output.share = { id: shortcutId, name: description + '.url', sharing: sharingId }
output.seeded = (output.seeded || []).concat([shortcutId])
