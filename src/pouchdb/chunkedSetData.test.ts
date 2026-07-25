import { installChunkedSetData } from './chunkedSetData'

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve))
}

const makeDocs = (n: number): { _id: string }[] =>
  Array.from({ length: n }, (_, i) => ({ _id: String(i) }))

describe('installChunkedSetData', () => {
  it('passes small payloads through in a single call', () => {
    const setData = jest.fn()
    const client = { setData }
    installChunkedSetData(client)
    client.setData({ 'io.cozy.files': makeDocs(2) })
    expect(setData).toHaveBeenCalledTimes(1)
  })

  it('splits large payloads into chunks that cover every document', async () => {
    const setData = jest.fn()
    const client = { setData }
    installChunkedSetData(client)
    client.setData({ 'io.cozy.files': makeDocs(600) })
    await flush()
    expect(setData).toHaveBeenCalledTimes(3)
    const dispatched = setData.mock.calls.reduce(
      (n, call) => n + (call[0] as Record<string, unknown[]>)['io.cozy.files'].length,
      0
    )
    expect(dispatched).toBe(600)
  })

  it('does not double-wrap on a second install', () => {
    const setData = jest.fn()
    const client = { setData }
    installChunkedSetData(client)
    const wrapped = client.setData
    installChunkedSetData(client)
    expect(client.setData).toBe(wrapped)
  })
})
