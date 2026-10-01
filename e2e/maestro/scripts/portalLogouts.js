// Reads how many times the portal's logout page was opened. With MORE_THAN set,
// fails unless the count went past it.

const base = typeof PORTAL_URL === 'undefined' ? 'http://localhost:8090' : PORTAL_URL
const count = JSON.parse(http.get(base + '/logouts').body).count

if (typeof MORE_THAN !== 'undefined' && !(count > Number(MORE_THAN))) {
  throw new Error('The portal logout page was not opened: ' + count + ' visits')
}
output.portalLogouts = count
