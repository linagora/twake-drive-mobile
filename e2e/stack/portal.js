// Stands in for the sign-up portal the `signup.url` flag points to: its logout
// page sends the browser back where it was asked to, as the real one does, and
// counts the visits so a flow can tell the app came by.

const http = require('http')

let logouts = 0

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://portal')
    if (url.pathname === '/logout') {
      logouts += 1
      res.writeHead(302, { Location: url.searchParams.get('url') || '/logouts' })
      res.end()
      return
    }
    if (url.pathname === '/logouts') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ count: logouts }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  .listen(8090)
