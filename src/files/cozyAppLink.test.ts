import { buildCozyAppUrl, isInstanceUrl, instanceOriginWhitelist } from './cozyAppLink'

const STACK = 'https://mmaudet.twake.linagora.com'

describe('buildCozyAppUrl', () => {
  it('targets the flat app subdomain of the instance', () => {
    const url = buildCozyAppUrl(STACK, 'notes', 'code123', '/n/abc')
    expect(url).toBe('https://mmaudet-notes.twake.linagora.com/?session_code=code123#/n/abc')
  })
})

describe('isInstanceUrl', () => {
  it('accepts the stack itself', () => {
    expect(isInstanceUrl(STACK, `${STACK}/files`)).toBe(true)
  })

  it('accepts the instance app subdomains', () => {
    expect(isInstanceUrl(STACK, 'https://mmaudet-notes.twake.linagora.com/?x=1')).toBe(true)
    expect(isInstanceUrl(STACK, 'https://mmaudet-drive.twake.linagora.com/#/onlyoffice/1')).toBe(
      true
    )
  })

  // The editor WebView carries a session, so anything off the instance must not
  // be able to take over its top-level navigation.
  it('rejects an unrelated host', () => {
    expect(isInstanceUrl(STACK, 'https://evil.example.com/')).toBe(false)
  })

  // A neighbouring tenant on the same hosting domain is not us.
  it('rejects another instance on the same parent domain', () => {
    expect(isInstanceUrl(STACK, 'https://someoneelse.twake.linagora.com/')).toBe(false)
    expect(isInstanceUrl(STACK, 'https://someoneelse-drive.twake.linagora.com/')).toBe(false)
  })

  // Guards against `mmaudet-notes.twake.linagora.com.evil.com`.
  it('rejects a host that merely starts with the instance prefix', () => {
    expect(isInstanceUrl(STACK, 'https://mmaudet-notes.twake.linagora.com.evil.com/')).toBe(false)
  })

  it('rejects a downgrade to http', () => {
    expect(isInstanceUrl(STACK, 'http://mmaudet-notes.twake.linagora.com/')).toBe(false)
  })

  it('rejects non-http schemes', () => {
    expect(isInstanceUrl(STACK, 'javascript:alert(1)')).toBe(false)
    expect(isInstanceUrl(STACK, 'file:///etc/passwd')).toBe(false)
  })

  it('rejects garbage rather than throwing', () => {
    expect(isInstanceUrl(STACK, 'not a url')).toBe(false)
    expect(isInstanceUrl('not a url', `${STACK}/`)).toBe(false)
  })

  it('allows no app subdomain for a single-label host', () => {
    expect(isInstanceUrl('http://localhost:8080', 'http://localhost:8080/x')).toBe(true)
    expect(isInstanceUrl('http://localhost:8080', 'http://localhost-drive:8080/x')).toBe(false)
  })
})

describe('instanceOriginWhitelist', () => {
  it('lists the stack and its app subdomains', () => {
    expect(instanceOriginWhitelist(STACK)).toEqual([
      'https://mmaudet.twake.linagora.com',
      'https://mmaudet-*.twake.linagora.com'
    ])
  })

  // Falling back to '*' here would silently restore the hole this closes.
  it('returns nothing for an unparseable uri', () => {
    expect(instanceOriginWhitelist('not a url')).toEqual([])
  })
})
