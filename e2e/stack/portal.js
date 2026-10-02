// Stands in for the sign-up portal the `signup.url` flag points to. Like the
// real one, its logout page only follows a redirect it knows and sends any
// other to its own login page; it counts the visits so a flow can tell the
// app came by.

const http = require('http')

const KNOWN_REDIRECT = /^(cozy:\/\/|https:\/\/)/
const LOGIN_PAGE =
  '<!doctype html><meta name="viewport" content="width=device-width"><h1>Portal login</h1>'

let logouts = 0

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://portal')
    if (url.pathname === '/logout') {
      logouts += 1
      const target = url.searchParams.get('url') || ''
      res.writeHead(302, { Location: KNOWN_REDIRECT.test(target) ? target : '/?login' })
      res.end()
      return
    }
    if (url.pathname === '/logouts') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ count: logouts }))
      return
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(LOGIN_PAGE)
      return
    }
    res.writeHead(404)
    res.end()
  })
  .listen(8090)
