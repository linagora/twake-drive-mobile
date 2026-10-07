import { createActionNames } from './createActions'

const opts = {
  docsEnabled: false,
  officeEnabled: false,
  excalidrawEnabled: false
}

describe('createActionNames', () => {
  it('always offers a folder and a note', () => {
    expect(createActionNames(opts)).toEqual(['folder', 'note', 'shortcut', 'upload'])
  })

  it('adds the office entries behind their flag', () => {
    expect(createActionNames({ ...opts, officeEnabled: true })).toEqual([
      'folder',
      'note',
      'text',
      'sheet',
      'slide',
      'shortcut',
      'upload'
    ])
  })

  it('adds docs and excalidraw behind their own flags', () => {
    expect(createActionNames({ ...opts, docsEnabled: true, excalidrawEnabled: true })).toEqual([
      'folder',
      'note',
      'docs',
      'excalidraw',
      'shortcut',
      'upload'
    ])
  })

  it('drops the shortcut inside a shared drive, which the stack refuses to create', () => {
    expect(createActionNames({ ...opts, driveId: 'drive-1' })).toEqual(['folder', 'note'])
  })

  it('drops docs inside a shared drive, as its bridge writes to our own instance', () => {
    expect(createActionNames({ ...opts, docsEnabled: true, driveId: 'drive-1' })).toEqual([
      'folder',
      'note'
    ])
  })

  it('keeps office and excalidraw inside a shared drive, both go through io.cozy.files', () => {
    expect(
      createActionNames({
        ...opts,
        officeEnabled: true,
        excalidrawEnabled: true,
        driveId: 'drive-1'
      })
    ).toEqual(['folder', 'note', 'text', 'sheet', 'slide', 'excalidraw'])
  })
})
