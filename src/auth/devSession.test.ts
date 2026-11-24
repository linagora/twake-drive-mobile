import { decodeDevSession } from './devSession'

const encode = (value: unknown): string =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

const session = {
  uri: 'http://alice.10-0-2-2.nip.io',
  oauthOptions: { clientID: 'id', clientSecret: 'secret', registrationAccessToken: 'reg' },
  token: { accessToken: 'a?>', refreshToken: 'r', tokenType: 'bearer', scope: '*' }
}

describe('decodeDevSession', () => {
  it('reads back the session a run encoded as base64url', () => {
    expect(decodeDevSession(encode(session))).toEqual(session)
  })

  it('refuses a session without the tokens', () => {
    expect(() => decodeDevSession(encode({ ...session, token: {} }))).toThrow(
      'The link does not carry a complete session'
    )
  })
})
