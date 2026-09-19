import { previousFolderId } from './upNavigation'

describe('previousFolderId', () => {
  it('has nothing behind it on the folder the picker opened on', () => {
    expect(previousFolderId([], 'source')).toBeUndefined()
  })

  it('names the folder it opened on after one step in', () => {
    expect(previousFolderId(['a'], 'source')).toBe('source')
  })

  it('names the folder one step back deeper in', () => {
    expect(previousFolderId(['a', 'b', 'c'], 'source')).toBe('b')
  })
})
