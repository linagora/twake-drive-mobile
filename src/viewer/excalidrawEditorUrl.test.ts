import { buildDriveExcalidrawUrl } from '../../app/excalidraw/[fileId]'

describe('buildDriveExcalidrawUrl', () => {
  it('opens the drawing in the drive web app, with a session code', () => {
    const url = buildDriveExcalidrawUrl('https://alice.cozy.test', 'f1', 'CODE')
    expect(url).toBe('https://alice-drive.cozy.test/?session_code=CODE#/excalidraw/f1')
  })

  it('opens a drawing of a shared drive on the route that scopes it', () => {
    const url = buildDriveExcalidrawUrl('https://alice.cozy.test', 'f1', 'CODE', 'drive-1')
    expect(url).toBe('https://alice-drive.cozy.test/?session_code=CODE#/excalidraw/drive-1/f1')
  })
})
