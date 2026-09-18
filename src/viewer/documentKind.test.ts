const mockFlag = jest.fn()
jest.mock('cozy-flags', () => ({ __esModule: true, default: (name: string) => mockFlag(name) }))

import { hasWebEditor, localViewerFor, viewerKindOf } from './documentKind'

describe('viewerKindOf', () => {
  it('knows the types a local viewer is meant to render', () => {
    expect(viewerKindOf({ name: 'notes.md' })).toBe('markdown')
    expect(viewerKindOf({ name: 'Réunion.cozy-note' })).toBe('note')
    expect(viewerKindOf({ name: 'Compte rendu.docs-note' })).toBe('docsNote')
    expect(viewerKindOf({ name: 'schéma.excalidraw' })).toBe('excalidraw')
    expect(
      viewerKindOf({
        name: 'rapport.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
    ).toBe('office')
  })

  it('leaves anything else alone', () => {
    expect(viewerKindOf({ name: 'photo.jpg', mime: 'image/jpeg' })).toBeNull()
  })
})

describe('localViewerFor', () => {
  beforeEach(() => mockFlag.mockReset())

  it('opens a note locally once its instance turned the viewer on', () => {
    mockFlag.mockReturnValue(true)
    expect(localViewerFor({ name: 'a.cozy-note' })).toBe('note')
  })

  it('leaves the document to the web editor while the flag is off', () => {
    mockFlag.mockReturnValue(false)
    expect(localViewerFor({ name: 'a.cozy-note' })).toBeNull()
  })

  it('leaves alone the types whose viewer is not built yet, flag or not', () => {
    mockFlag.mockReturnValue(true)
    expect(localViewerFor({ name: 'schéma.excalidraw' })).toBeNull()
    expect(
      localViewerFor({
        name: 'rapport.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
    ).toBeNull()
  })
})

describe('hasWebEditor', () => {
  it('is true for the documents an editor can open', () => {
    expect(hasWebEditor({ name: 'a.cozy-note' })).toBe(true)
    expect(hasWebEditor({ name: 'b.docs-note' })).toBe(true)
  })

  it('is false for a plain markdown file, which no editor claims', () => {
    expect(hasWebEditor({ name: 'notes.md' })).toBe(false)
  })
})
