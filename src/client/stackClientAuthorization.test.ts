import CozyClient from 'cozy-client'

// Expo's fetch rejects a header whose value is null, so the stack client must
// leave Authorization out until it holds a token (patches/cozy-stack-client).
describe('cozy-stack-client Authorization header', () => {
  const sentHeaders = async (token?: string): Promise<Record<string, unknown>> => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new CozyClient({ uri: 'http://alice.example', token })
    await client.getStackClient().fetch('GET', '/status')
    return (fetchMock.mock.calls[0][1] as { headers: Record<string, unknown> }).headers
  }

  it('sends no Authorization before the client holds a token', async () => {
    expect(await sentHeaders()).not.toHaveProperty('Authorization')
  })

  it('sends the token once the client holds one', async () => {
    expect((await sentHeaders('abc')).Authorization).toBe('Bearer abc')
  })
})
