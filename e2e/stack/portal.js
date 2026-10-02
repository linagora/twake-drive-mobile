// Stands in for the sign-up portal the `signup.url` flag points to. Like the
// real one, its logout page is a page whose script sends the browser on, to
// the redirect it was given when it knows it and to its own login page
// otherwise; it counts the visits so a flow can tell the app came by.

const http = require('http')

const KNOWN_REDIRECT = /^(twakedrive:\/\/|cozy:\/\/|https:\/\/)/
const page = body => '<!doctype html><meta name="viewport" content="width=device-width">' + body

let logouts = 0

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://portal')
    if (url.pathname === '/logout') {
      logouts += 1
      const asked = url.searchParams.get('url') || ''
      const target = KNOWN_REDIRECT.test(asked) ? asked : '/?login'
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(page('<script>window.location.replace(' + JSON.stringify(target) + ')</script>'))
      return
    }
    if (url.pathname === '/logouts') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ count: logouts }))
      return
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(page('<h1>Portal login</h1>'))
      return
    }
    res.writeHead(404)
    res.end()
  })
  .listen(8090)
