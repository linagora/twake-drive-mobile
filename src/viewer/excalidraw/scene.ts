import rough from 'roughjs'
import type { Options } from 'roughjs/bin/core'

/**
 * Turns an Excalidraw scene into plain drawing instructions.
 *
 * Excalidraw's own renderer is a browser bundle of 17 MB, fonts included, and
 * an ESM one at that — awkward to run from a WebView with no network. The
 * shapes it draws come from roughjs though, which is 170 KB of plain
 * JavaScript, so the scene is turned into paths here and handed to
 * react-native-svg. No browser, no bundle to ship, and it works offline.
 */

export interface SceneElement {
  type: string
  x: number
  y: number
  width: number
  height: number
  angle?: number
  strokeColor?: string
  backgroundColor?: string
  fillStyle?: string
  strokeWidth?: number
  strokeStyle?: string
  roughness?: number
  opacity?: number
  seed?: number
  isDeleted?: boolean
  points?: [number, number][]
  roundness?: { type: number } | null
  text?: string
  fontSize?: number
  lineHeight?: number
  textAlign?: string
  startArrowhead?: string | null
  endArrowhead?: string | null
  fileId?: string
}

export interface SceneFile {
  mimeType?: string
  dataURL?: string
}

export interface Scene {
  elements: SceneElement[]
  files: Record<string, SceneFile>
}

export interface DrawnPath {
  kind: 'path'
  d: string
  stroke: string
  strokeWidth: number
  fill: string
  dash?: number[]
}

export interface DrawnText {
  kind: 'text'
  lines: string[]
  fontSize: number
  lineHeight: number
  color: string
  align: 'left' | 'center' | 'right'
  width: number
}

export interface DrawnImage {
  kind: 'image'
  uri: string
  width: number
  height: number
}

export interface DrawnElement {
  key: string
  x: number
  y: number
  angle: number
  width: number
  height: number
  opacity: number
  parts: (DrawnPath | DrawnText | DrawnImage)[]
}

export interface SceneBounds {
  minX: number
  minY: number
  width: number
  height: number
}

const generator = rough.generator()

/** Parses what a `.excalidraw` file holds, ignoring what it does not draw. */
export const parseScene = (raw: string): Scene => {
  const parsed = JSON.parse(raw) as Partial<Scene>
  const elements = Array.isArray(parsed.elements) ? parsed.elements : []
  return {
    elements: elements.filter(element => element && !element.isDeleted),
    files: parsed.files ?? {}
  }
}

const dashFor = (element: SceneElement): number[] | undefined => {
  if (element.strokeStyle === 'dashed') return [8, 8]
  if (element.strokeStyle === 'dotted') return [2, 4]
  return undefined
}

const optionsFor = (element: SceneElement): Options => ({
  seed: element.seed || 1,
  roughness: element.roughness ?? 1,
  stroke: element.strokeColor ?? '#1e1e1e',
  strokeWidth: element.strokeWidth ?? 1,
  fill: element.backgroundColor === 'transparent' ? undefined : element.backgroundColor,
  fillStyle: element.fillStyle ?? 'hachure'
})

// An Excalidraw rectangle is rounded by default; roughjs only draws square
// ones, so the rounded outline is described as a path and roughed up.
const roundedRectPath = (width: number, height: number): string => {
  const radius = Math.min(32, Math.min(Math.abs(width), Math.abs(height)) * 0.25)
  return [
    `M ${radius} 0`,
    `L ${width - radius} 0`,
    `Q ${width} 0 ${width} ${radius}`,
    `L ${width} ${height - radius}`,
    `Q ${width} ${height} ${width - radius} ${height}`,
    `L ${radius} ${height}`,
    `Q 0 ${height} 0 ${height - radius}`,
    `L 0 ${radius}`,
    `Q 0 0 ${radius} 0`
  ].join(' ')
}

const toPathData = (ops: { op: string; data: number[] }[]): string => {
  let d = ''
  for (const op of ops) {
    if (op.op === 'move') d += `M${op.data[0]} ${op.data[1]} `
    else if (op.op === 'lineTo') d += `L${op.data[0]} ${op.data[1]} `
    else if (op.op === 'bcurveTo')
      d += `C${op.data[0]} ${op.data[1]}, ${op.data[2]} ${op.data[3]}, ${op.data[4]} ${op.data[5]} `
  }
  return d.trim()
}

const ARROWHEAD_LENGTH = 20
const ARROWHEAD_ANGLE = Math.PI / 7

const arrowheadPath = (from: [number, number], to: [number, number]): string | null => {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  if (length === 0) return null
  const angle = Math.atan2(dy, dx)
  const size = Math.min(ARROWHEAD_LENGTH, length / 2)
  const left: [number, number] = [
    to[0] - size * Math.cos(angle - ARROWHEAD_ANGLE),
    to[1] - size * Math.sin(angle - ARROWHEAD_ANGLE)
  ]
  const right: [number, number] = [
    to[0] - size * Math.cos(angle + ARROWHEAD_ANGLE),
    to[1] - size * Math.sin(angle + ARROWHEAD_ANGLE)
  ]
  return `M${left[0]} ${left[1]} L${to[0]} ${to[1]} L${right[0]} ${right[1]}`
}

const shapeFor = (element: SceneElement): ReturnType<typeof generator.rectangle> | null => {
  const options = optionsFor(element)
  const width = element.width || 0
  const height = element.height || 0
  switch (element.type) {
    case 'rectangle':
      return element.roundness
        ? generator.path(roundedRectPath(width, height), options)
        : generator.rectangle(0, 0, width, height, options)
    case 'ellipse':
      return generator.ellipse(width / 2, height / 2, width, height, options)
    case 'diamond':
      return generator.polygon(
        [
          [width / 2, 0],
          [width, height / 2],
          [width / 2, height],
          [0, height / 2]
        ],
        options
      )
    case 'line':
    case 'arrow':
      return element.points && element.points.length > 1
        ? generator.linearPath(element.points, options)
        : null
    case 'freedraw':
      return element.points && element.points.length > 1
        ? generator.curve(element.points, { ...options, fill: undefined })
        : null
    default:
      return null
  }
}

const drawnPathsOf = (element: SceneElement): DrawnPath[] => {
  const shape = shapeFor(element)
  if (!shape) return []
  const stroke = element.strokeColor ?? '#1e1e1e'
  const background = element.backgroundColor ?? 'transparent'
  const strokeWidth = element.strokeWidth ?? 1
  const dash = dashFor(element)

  const paths: DrawnPath[] = shape.sets
    .map(set => {
      const d = toPathData(set.ops as { op: string; data: number[] }[])
      if (!d) return null
      if (set.type === 'fillPath') {
        return { kind: 'path' as const, d, stroke: 'none', strokeWidth: 0, fill: background }
      }
      if (set.type === 'fillSketch') {
        return {
          kind: 'path' as const,
          d,
          stroke: background,
          strokeWidth: Math.max(1, strokeWidth / 2),
          fill: 'none'
        }
      }
      return { kind: 'path' as const, d, stroke, strokeWidth, fill: 'none', dash }
    })
    .filter((path): path is DrawnPath => path !== null)

  if (element.type === 'arrow' && element.points && element.points.length > 1) {
    const points = element.points
    const end = arrowheadPath(points[points.length - 2], points[points.length - 1])
    if (end && element.endArrowhead !== null) {
      paths.push({ kind: 'path', d: end, stroke, strokeWidth, fill: 'none' })
    }
    if (element.startArrowhead) {
      const start = arrowheadPath(points[1], points[0])
      if (start) paths.push({ kind: 'path', d: start, stroke, strokeWidth, fill: 'none' })
    }
  }

  return paths
}

/** What to draw for one element: its paths, its text, or the image it holds. */
export const drawElement = (
  element: SceneElement,
  files: Record<string, SceneFile>
): DrawnElement => {
  const parts: (DrawnPath | DrawnText | DrawnImage)[] = []

  if (element.type === 'text') {
    parts.push({
      kind: 'text',
      lines: (element.text ?? '').split('\n'),
      fontSize: element.fontSize ?? 16,
      lineHeight: element.lineHeight ?? 1.25,
      color: element.strokeColor ?? '#1e1e1e',
      align: (element.textAlign as DrawnText['align']) ?? 'left',
      width: element.width || 0
    })
  } else if (element.type === 'image' && element.fileId) {
    const file = files[element.fileId]
    if (file?.dataURL) {
      parts.push({
        kind: 'image',
        uri: file.dataURL,
        width: element.width || 0,
        height: element.height || 0
      })
    }
  } else {
    parts.push(...drawnPathsOf(element))
  }

  return {
    key: `${element.type}-${element.x}-${element.y}-${element.seed ?? 0}`,
    x: element.x,
    y: element.y,
    angle: element.angle ?? 0,
    width: element.width || 0,
    height: element.height || 0,
    opacity: (element.opacity ?? 100) / 100,
    parts
  }
}

/** The box the whole scene fits in, with a little air around it. */
export const sceneBounds = (elements: SceneElement[], padding = 20): SceneBounds => {
  if (elements.length === 0) return { minX: 0, minY: 0, width: 1, height: 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of elements) {
    minX = Math.min(minX, element.x)
    minY = Math.min(minY, element.y)
    maxX = Math.max(maxX, element.x + (element.width || 0))
    maxY = Math.max(maxY, element.y + (element.height || 0))
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2)
  }
}
