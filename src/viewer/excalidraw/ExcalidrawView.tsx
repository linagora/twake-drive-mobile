import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import Svg, { G, Image as SvgImage, Path, Text as SvgText } from 'react-native-svg'
import { useTheme } from 'react-native-paper'

import { drawElement, parseScene, sceneBounds } from './scene'

export interface ExcalidrawViewProps {
  /** The `.excalidraw` file, as it was downloaded. */
  content: string
  testID?: string
}

/**
 * Draws an Excalidraw scene with react-native-svg — no browser, nothing to
 * download, and the same hand-drawn shapes, since Excalidraw and this both
 * draw them with roughjs.
 */
export const ExcalidrawView = ({ content, testID }: ExcalidrawViewProps): React.ReactElement => {
  const theme = useTheme()
  const { elements, bounds } = useMemo(() => {
    const scene = parseScene(content)
    return {
      elements: scene.elements.map(element => drawElement(element, scene.files)),
      bounds: sceneBounds(scene.elements)
    }
  }, [content])

  return (
    <ScrollView
      testID={testID}
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
    >
      <View style={[styles.canvas, { aspectRatio: bounds.width / bounds.height }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {elements.map(element => (
            <G
              key={element.key}
              opacity={element.opacity}
              transform={`translate(${element.x}, ${element.y}) rotate(${
                (element.angle * 180) / Math.PI
              }, ${element.width / 2}, ${element.height / 2})`}
            >
              {element.parts.map((part, index) => {
                if (part.kind === 'path') {
                  return (
                    <Path
                      key={index}
                      d={part.d}
                      stroke={part.stroke}
                      strokeWidth={part.strokeWidth}
                      fill={part.fill}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={part.dash}
                    />
                  )
                }
                if (part.kind === 'image') {
                  return (
                    <SvgImage
                      key={index}
                      href={{ uri: part.uri }}
                      width={part.width}
                      height={part.height}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  )
                }
                return part.lines.map((line, lineIndex) => (
                  <SvgText
                    key={`${index}-${lineIndex}`}
                    x={
                      part.align === 'center'
                        ? part.width / 2
                        : part.align === 'right'
                          ? part.width
                          : 0
                    }
                    y={(lineIndex + 0.85) * part.fontSize * part.lineHeight}
                    fontSize={part.fontSize}
                    fill={part.color}
                    textAnchor={
                      part.align === 'center' ? 'middle' : part.align === 'right' ? 'end' : 'start'
                    }
                  >
                    {line}
                  </SvgText>
                ))
              })}
            </G>
          ))}
        </Svg>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center' },
  // The scene keeps its own proportions and fills the width; the ScrollView
  // takes care of the rest, zoom included.
  canvas: { width: '100%' }
})
