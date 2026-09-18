import React, { useMemo } from 'react'
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

import { cozyTokens } from '@/ui/theme'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export interface MarkdownViewProps {
  markdown: string
  /** Turns an image path of the document into something Image can load, e.g. a
   *  data URI built from the images a note carries. */
  resolveImage?: (src: string) => string | undefined
  testID?: string
}

const HEADING_SIZES: Record<string, number> = {
  h1: 26,
  h2: 22,
  h3: 19,
  h4: 17,
  h5: 15,
  h6: 14
}

interface InlineStyle {
  bold?: boolean
  italic?: boolean
  code?: boolean
  href?: string
}

/**
 * Renders a document's Markdown with the app's own components.
 *
 * The parser is markdown-it, the same one twake-drive web reads notes with, so
 * what is supported does not drift between the two; the rendering is ours, to
 * keep the type scale and the spacing of the rest of the app.
 */
export const MarkdownView = ({
  markdown,
  resolveImage,
  testID
}: MarkdownViewProps): React.ReactElement => {
  const theme = useTheme()
  const tokens = useMemo(() => md.parse(markdown, {}), [markdown])

  const renderInline = (children: Token[], keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = []
    const style: InlineStyle = {}
    children.forEach((token, index) => {
      const key = `${keyPrefix}-${index}`
      switch (token.type) {
        case 'strong_open':
          style.bold = true
          break
        case 'strong_close':
          style.bold = false
          break
        case 'em_open':
          style.italic = true
          break
        case 'em_close':
          style.italic = false
          break
        case 'link_open':
          style.href = token.attrGet('href') ?? undefined
          break
        case 'link_close':
          style.href = undefined
          break
        case 'softbreak':
        case 'hardbreak':
          nodes.push(<Text key={key}>{'\n'}</Text>)
          break
        case 'code_inline':
          nodes.push(
            <Text
              key={key}
              style={[styles.codeInline, { backgroundColor: theme.colors.surfaceVariant }]}
            >
              {token.content}
            </Text>
          )
          break
        case 'image': {
          const src = token.attrGet('src') ?? ''
          const uri = resolveImage?.(src) ?? src
          nodes.push(
            <Image
              key={key}
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={token.content || undefined}
            />
          )
          break
        }
        case 'text': {
          const href = style.href
          nodes.push(
            <Text
              key={key}
              onPress={href ? () => void Linking.openURL(href) : undefined}
              style={[
                style.bold ? styles.bold : null,
                style.italic ? styles.italic : null,
                href ? { color: theme.colors.primary } : null
              ]}
            >
              {token.content}
            </Text>
          )
          break
        }
        default:
          break
      }
    })
    return nodes
  }

  // The token stream is flat: each *_open token owns everything up to its
  // matching *_close, so blocks are rendered by walking ranges rather than by
  // reacting to tokens one by one — which is what made list markers land on
  // their own line.
  const closingIndex = (start: number, openType: string, closeType: string): number => {
    let depth = 0
    for (let i = start; i < tokens.length; i++) {
      if (tokens[i].type === openType) depth += 1
      else if (tokens[i].type === closeType) {
        depth -= 1
        if (depth === 0) return i
      }
    }
    return tokens.length - 1
  }

  const renderBlocks = (from: number, to: number, keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = []
    let index = from
    let ordinal = 1

    while (index < to) {
      const token = tokens[index]
      const key = `${keyPrefix}-${index}`

      if (token.type === 'heading_open') {
        const inline = tokens[index + 1]
        nodes.push(
          <Text
            key={key}
            style={[
              styles.heading,
              { fontSize: HEADING_SIZES[token.tag] ?? 16, color: theme.colors.onSurface }
            ]}
          >
            {renderInline(inline?.children ?? [], key)}
          </Text>
        )
        index += 3
        continue
      }

      if (token.type === 'paragraph_open') {
        const inline = tokens[index + 1]
        nodes.push(
          <Text key={key} style={[styles.paragraph, { color: theme.colors.onSurface }]}>
            {renderInline(inline?.children ?? [], key)}
          </Text>
        )
        index += 3
        continue
      }

      if (token.type === 'inline') {
        nodes.push(
          <Text key={key} style={[styles.paragraph, { color: theme.colors.onSurface }]}>
            {renderInline(token.children ?? [], key)}
          </Text>
        )
        index += 1
        continue
      }

      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        const ordered = token.type === 'ordered_list_open'
        const close = closingIndex(
          index,
          token.type,
          ordered ? 'ordered_list_close' : 'bullet_list_close'
        )
        nodes.push(<View key={key}>{renderBlocks(index + 1, close, `${key}-list`)}</View>)
        index = close + 1
        ordinal = 1
        continue
      }

      if (token.type === 'list_item_open') {
        const close = closingIndex(index, 'list_item_open', 'list_item_close')
        const marker = tokens[index].info ? `${tokens[index].info}.` : null
        nodes.push(
          <View key={key} style={styles.listItem}>
            <Text style={[styles.marker, { color: theme.colors.onSurface }]}>
              {marker ??
                (tokens[index].markup === '.' || tokens[index].markup === ')'
                  ? `${ordinal}.`
                  : '•')}
            </Text>
            <View style={styles.listItemBody}>{renderBlocks(index + 1, close, `${key}-item`)}</View>
          </View>
        )
        ordinal += 1
        index = close + 1
        continue
      }

      if (token.type === 'blockquote_open') {
        const close = closingIndex(index, 'blockquote_open', 'blockquote_close')
        nodes.push(
          <View key={key} style={styles.quote}>
            <View style={[styles.quoteBar, { backgroundColor: theme.colors.primary }]} />
            <View style={styles.quoteBody}>{renderBlocks(index + 1, close, `${key}-quote`)}</View>
          </View>
        )
        index = close + 1
        continue
      }

      if (token.type === 'fence' || token.type === 'code_block') {
        nodes.push(
          <View
            key={key}
            style={[styles.codeBlock, { backgroundColor: theme.colors.surfaceVariant }]}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.codeText}>{token.content.replace(/\n$/, '')}</Text>
            </ScrollView>
          </View>
        )
        index += 1
        continue
      }

      if (token.type === 'hr') {
        nodes.push(
          <View key={key} style={[styles.rule, { backgroundColor: theme.colors.outline }]} />
        )
        index += 1
        continue
      }

      index += 1
    }

    return nodes
  }

  const blocks = renderBlocks(0, tokens.length, 'block')

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.content}
      style={{ backgroundColor: theme.colors.background }}
    >
      {blocks}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: cozyTokens.spacing.md, paddingBottom: cozyTokens.spacing.xxl },
  heading: {
    fontWeight: '700',
    marginTop: cozyTokens.spacing.md,
    marginBottom: cozyTokens.spacing.xs
  },
  paragraph: { fontSize: 15, lineHeight: 22, marginBottom: cozyTokens.spacing.sm },
  marker: { fontSize: 15, lineHeight: 22, width: 22 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start' },
  listItemBody: { flex: 1 },
  quote: { flexDirection: 'row', marginBottom: cozyTokens.spacing.sm },
  quoteBody: { flex: 1, paddingLeft: cozyTokens.spacing.sm },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  codeInline: { fontFamily: 'Courier', fontSize: 14, borderRadius: cozyTokens.radius.sm },
  codeBlock: {
    borderRadius: cozyTokens.radius.sm,
    padding: cozyTokens.spacing.sm,
    marginBottom: cozyTokens.spacing.sm
  },
  codeText: { fontFamily: 'Courier', fontSize: 13 },
  rule: { height: 1, marginVertical: cozyTokens.spacing.md },
  quoteBar: { width: 3, borderRadius: 2 },
  image: { width: '100%', height: 200, marginBottom: cozyTokens.spacing.sm }
})
