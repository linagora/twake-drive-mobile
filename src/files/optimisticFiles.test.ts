import { optimisticTrashed } from './optimisticFiles'

describe('optimisticTrashed', () => {
  it('moves a file to the trash and flags it', () => {
    expect(optimisticTrashed({ _id: 'f', type: 'file' }, 'trash')).toEqual({
      _id: 'f',
      type: 'file',
      dir_id: 'trash',
      trashed: true
    })
  })

  it('moves a folder without a trashed flag the stack would never clear on restore', () => {
    const out = optimisticTrashed({ _id: 'd', type: 'directory' }, 'trash')
    expect(out).toEqual({ _id: 'd', type: 'directory', dir_id: 'trash' })
    expect('trashed' in out).toBe(false)
  })
})
