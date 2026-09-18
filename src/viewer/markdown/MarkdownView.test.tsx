import React from 'react'
import { Image } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

import { MarkdownView } from './MarkdownView'

const show = (markdown: string, resolveImage?: (src: string) => string | undefined) =>
  render(
    <PaperProvider>
      <MarkdownView markdown={markdown} resolveImage={resolveImage} />
    </PaperProvider>
  )

describe('MarkdownView', () => {
  it('renders a heading and a paragraph', () => {
    show('# Titre\n\nUn paragraphe.')
    expect(screen.getByText('Titre')).toBeOnTheScreen()
    expect(screen.getByText('Un paragraphe.')).toBeOnTheScreen()
  })

  it('marks up bold and italic runs', () => {
    show('Du **gras** et de l’*italique*.')
    expect(JSON.stringify(screen.getByText('gras').props.style)).toContain('"fontWeight":"700"')
    expect(JSON.stringify(screen.getByText('italique').props.style)).toContain(
      '"fontStyle":"italic"'
    )
  })

  it('numbers an ordered list and bullets an unordered one', () => {
    show('1. un\n2. deux\n\n- a\n- b')
    expect(screen.getByText('1.')).toBeOnTheScreen()
    expect(screen.getByText('2.')).toBeOnTheScreen()
    expect(screen.getAllByText('•')).toHaveLength(2)
  })

  it('keeps a list item on the line of its marker', () => {
    show('- premier')
    expect(screen.getByText('premier')).toBeOnTheScreen()
  })

  it('renders a code block as it was written', () => {
    show('```\nconst a = 1\n```')
    expect(screen.getByText('const a = 1')).toBeOnTheScreen()
  })

  it('renders a quote', () => {
    show('> cité')
    expect(screen.getByText('cité')).toBeOnTheScreen()
  })

  it('asks the document for the images it carries', () => {
    show('![alt](photo.png)', src =>
      src === 'photo.png' ? 'data:image/png;base64,AAA' : undefined
    )
    expect(screen.UNSAFE_getByType(Image).props.source).toEqual({
      uri: 'data:image/png;base64,AAA'
    })
  })

  it('leaves an image it cannot resolve to its own source', () => {
    show('![alt](https://example.test/a.png)')
    expect(screen.UNSAFE_getByType(Image).props.source).toEqual({
      uri: 'https://example.test/a.png'
    })
  })

  it('renders nothing rather than crash on an empty document', () => {
    show('')
    expect(screen.queryByText('undefined')).toBeNull()
  })
})
