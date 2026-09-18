import { normalizeDriveChild } from './sharedDriveChild'

describe('normalizeDriveChild', () => {
  it('reads a document replicated from the drive, fields at the top level', () => {
    const child = normalizeDriveChild({
      _id: 'f1',
      name: 'rapport.pdf',
      type: 'file',
      size: 420733,
      updated_at: '2026-07-20T09:33:35.862Z'
    })
    expect(child).toMatchObject({ _id: 'f1', name: 'rapport.pdf', size: 420733 })
  })

  it('reads a document served by the stack, fields under attributes', () => {
    const child = normalizeDriveChild({
      _id: 'f2',
      attributes: { name: 'note.cozy-note', type: 'file', size: '625' }
    })
    expect(child).toMatchObject({ _id: 'f2', name: 'note.cozy-note', size: 625 })
  })

  it('has no size to show when the document carries none', () => {
    expect(normalizeDriveChild({ _id: 'f3', name: 'folder', type: 'directory' }).size).toBeNull()
  })
})
