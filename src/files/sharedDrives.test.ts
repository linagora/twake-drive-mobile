import { fetchSharedDrives } from './sharedDrives'

const buildClient = (response: unknown) => {
  const fetchJSON = jest.fn().mockResolvedValue(response)
  return {
    client: { getStackClient: () => ({ fetchJSON }) } as never,
    fetchJSON
  }
}

describe('fetchSharedDrives', () => {
  it('GETs /sharings/drives', async () => {
    const { client, fetchJSON } = buildClient({ data: [] })
    await fetchSharedDrives(client)
    expect(fetchJSON).toHaveBeenCalledWith('GET', '/sharings/drives')
  })

  it('maps JSON-API responses into directory-shaped entries', async () => {
    const { client } = buildClient({
      data: [
        {
          id: 'sharing-A',
          type: 'io.cozy.sharings',
          attributes: {
            rules: [
              {
                title: 'Marketing',
                values: ['root-folder-A'],
                doctype: 'io.cozy.files'
              }
            ]
          }
        },
        {
          id: 'sharing-B',
          type: 'io.cozy.sharings',
          attributes: {
            rules: [
              { title: 'Engineering', values: ['root-folder-B'] }
            ]
          }
        }
      ]
    })
    expect(await fetchSharedDrives(client)).toEqual([
      { driveId: 'sharing-A', _id: 'root-folder-A', name: 'Marketing', type: 'directory' },
      { driveId: 'sharing-B', _id: 'root-folder-B', name: 'Engineering', type: 'directory' }
    ])
  })

  it('reads pre-normalized rules at the top level (cozy-stack-client v60 shape)', async () => {
    const { client } = buildClient({
      data: [
        {
          _id: 'sharing-X',
          _type: 'io.cozy.sharings',
          rules: [{ title: 'Design', values: ['root-X'] }]
        }
      ]
    })
    expect(await fetchSharedDrives(client)).toEqual([
      { driveId: 'sharing-X', _id: 'root-X', name: 'Design', type: 'directory' }
    ])
  })

  it('filters out malformed sharings', async () => {
    const { client } = buildClient({
      data: [
        { id: 'a', attributes: { rules: [] } },
        { id: 'b', attributes: { rules: [{ title: 'No values' }] } },
        { id: 'c', attributes: { rules: [{ values: ['root'] }] } },
        { id: 'd', attributes: { rules: [{ title: 'OK', values: ['root-d'] }] } }
      ]
    })
    expect(await fetchSharedDrives(client)).toEqual([
      { driveId: 'd', _id: 'root-d', name: 'OK', type: 'directory' }
    ])
  })

  it('returns an empty array when the stack returns no data', async () => {
    const { client } = buildClient(undefined)
    expect(await fetchSharedDrives(client)).toEqual([])
  })
})
