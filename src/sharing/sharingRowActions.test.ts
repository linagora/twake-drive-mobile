import { fileRowHandlersFor, folderRowHandlersFor } from './sharingRowActions'

type Doc = { _id: string; name: string }

const all = () => ({
  onPress: jest.fn(),
  onShare: jest.fn(),
  onRename: jest.fn(),
  onDelete: jest.fn(),
  onMove: jest.fn(),
  onInfo: jest.fn(),
  onTogglePin: jest.fn()
})

const open = { canReshare: true, canLeave: true }
const closed = { canReshare: false, canLeave: false }
const leave = jest.fn()
const download = jest.fn()

describe('fileRowHandlersFor', () => {
  it('keeps every action on what the user shared', () => {
    const base = all()
    expect(fileRowHandlersFor<Doc, typeof base>('by-me', base, open, leave)).toBe(base)
  })

  it('offers a recipient share, details and leave, and nothing of the owner', () => {
    const handlers = fileRowHandlersFor<Doc, ReturnType<typeof all>>('with-me', all(), open, leave)
    expect(handlers.onShare).toBeDefined()
    expect(handlers.onInfo).toBeDefined()
    expect(handlers.onLeave).toBe(leave)
    expect(handlers.canFavorite).toBe(false)
    expect(handlers.onRename).toBeUndefined()
    expect(handlers.onDelete).toBeUndefined()
    expect(handlers.onMove).toBeUndefined()
    expect(handlers.onTogglePin).toBeUndefined()
  })

  it('hides share and leave when the member may not', () => {
    const handlers = fileRowHandlersFor<Doc, ReturnType<typeof all>>(
      'with-me',
      all(),
      closed,
      leave
    )
    expect(handlers.onShare).toBeUndefined()
    expect(handlers.onLeave).toBeUndefined()
    expect(handlers.onInfo).toBeDefined()
  })

  it('keeps a folder opened from the tab from being renamed or trashed', () => {
    const handlers = fileRowHandlersFor<Doc, ReturnType<typeof all>>('nested', all(), open, leave)
    expect(handlers.onRename).toBeUndefined()
    expect(handlers.onDelete).toBeUndefined()
    expect(handlers.onMove).toBeDefined()
    expect(handlers.onLeave).toBeUndefined()
  })
})

describe('folderRowHandlersFor', () => {
  const folderBase = () => {
    const { onInfo: _onInfo, ...rest } = all()
    return rest
  }

  it('keeps every action on what the user shared', () => {
    const base = folderBase()
    expect(folderRowHandlersFor<Doc, typeof base>('by-me', base, open, { leave, download })).toBe(
      base
    )
  })

  it('offers a recipient download, share and leave', () => {
    const handlers = folderRowHandlersFor<Doc, ReturnType<typeof folderBase>>(
      'with-me',
      folderBase(),
      open,
      { leave, download }
    )
    expect(handlers.onDownload).toBe(download)
    expect(handlers.onShare).toBeDefined()
    expect(handlers.onLeave).toBe(leave)
    expect(handlers.onRename).toBeUndefined()
    expect(handlers.onMove).toBeUndefined()
    expect(handlers.onTogglePin).toBeUndefined()
    expect(handlers.canFavorite).toBe(false)
  })

  it('hides share when the member may not reshare', () => {
    const handlers = folderRowHandlersFor<Doc, ReturnType<typeof folderBase>>(
      'with-me',
      folderBase(),
      { canReshare: false, canLeave: true },
      { leave, download }
    )
    expect(handlers.onShare).toBeUndefined()
    expect(handlers.onLeave).toBe(leave)
    expect(handlers.onDownload).toBe(download)
  })
})
