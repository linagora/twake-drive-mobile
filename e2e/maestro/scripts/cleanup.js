// Deletes for good what seed.js created, and the root entries named in NAMES
// (comma separated) for what a flow creates through the UI. Anything already
// gone is not an error: the flow may have deleted it itself.

const headers = { Authorization: 'Bearer ' + STACK_TOKEN, Host: STACK_HOST }
const ids = (output.seeded || []).slice()

const names = typeof NAMES === 'undefined' ? '' : NAMES
names
  .split(',')
  .filter(name => name)
  .forEach(name => {
    const found = http.get(STACK_URL + '/files/metadata?Path=' + encodeURIComponent('/' + name), {
      headers: headers
    })
    if (found.ok) ids.push(JSON.parse(found.body).data.id)
  })

ids.forEach(id => {
  http.request(STACK_URL + '/files/' + id, { method: 'DELETE', headers: headers })
  http.request(STACK_URL + '/files/trash/' + id, { method: 'DELETE', headers: headers })
})
output.seeded = []
