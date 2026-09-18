import { drawElement, parseScene, sceneBounds, SceneElement } from './scene'

const element = (over: Partial<SceneElement>): SceneElement => ({
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  seed: 1,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  strokeWidth: 2,
  ...over
})

describe('parseScene', () => {
  it('keeps what the file holds', () => {
    const scene = parseScene(
      JSON.stringify({ elements: [element({}), element({ type: 'ellipse' })], files: {} })
    )
    expect(scene.elements.map(e => e.type)).toEqual(['rectangle', 'ellipse'])
  })

  it('drops the elements the drawing deleted', () => {
    const scene = parseScene(JSON.stringify({ elements: [element({ isDeleted: true })] }))
    expect(scene.elements).toHaveLength(0)
  })

  it('reads a file with no elements at all', () => {
    expect(parseScene(JSON.stringify({ type: 'excalidraw' })).elements).toEqual([])
  })
})

describe('drawElement', () => {
  it('draws a rectangle as paths', () => {
    const drawn = drawElement(element({}), {})
    expect(drawn.parts.every(part => part.kind === 'path')).toBe(true)
    expect(drawn.parts.length).toBeGreaterThan(0)
  })

  it('fills a shape that has a background', () => {
    const drawn = drawElement(element({ backgroundColor: '#ffc9c9', fillStyle: 'solid' }), {})
    const filled = drawn.parts.find(part => part.kind === 'path' && part.fill === '#ffc9c9')
    expect(filled).toBeDefined()
  })

  it('gives an arrow its head', () => {
    const arrow = element({
      type: 'arrow',
      points: [
        [0, 0],
        [100, 0]
      ]
    })
    const drawn = drawElement(arrow, {})
    // The line itself plus the two strokes of the head.
    expect(drawn.parts.length).toBeGreaterThan(1)
  })

  it('carries the text of a label, line by line', () => {
    const drawn = drawElement(element({ type: 'text', text: 'deux\nlignes', fontSize: 20 }), {})
    expect(drawn.parts[0]).toMatchObject({ kind: 'text', lines: ['deux', 'lignes'], fontSize: 20 })
  })

  it('shows an image the scene embeds', () => {
    const drawn = drawElement(element({ type: 'image', fileId: 'f1' }), {
      f1: { dataURL: 'data:image/png;base64,AAA' }
    })
    expect(drawn.parts[0]).toMatchObject({ kind: 'image', uri: 'data:image/png;base64,AAA' })
  })

  it('draws nothing rather than guess at an element it does not know', () => {
    expect(drawElement(element({ type: 'frame' }), {}).parts).toEqual([])
  })

  it('keeps the opacity as a ratio', () => {
    expect(drawElement(element({ opacity: 30 }), {}).opacity).toBe(0.3)
  })
})

describe('sceneBounds', () => {
  it('fits every element, with air around them', () => {
    const bounds = sceneBounds(
      [element({ x: 10, y: 20, width: 100, height: 50 }), element({ x: 200, y: 0 })],
      10
    )
    expect(bounds).toEqual({ minX: 0, minY: -10, width: 310, height: 90 })
  })

  it('has a box to draw in even when the scene is empty', () => {
    expect(sceneBounds([])).toEqual({ minX: 0, minY: 0, width: 1, height: 1 })
  })
})
