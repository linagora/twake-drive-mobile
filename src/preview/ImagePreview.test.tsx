import React from 'react'
import { render, screen } from '@testing-library/react-native'
import '@/i18n'

jest.mock('@/ui/ZoomableImage', () => ({
  __esModule: true,
  ZoomableImage: ({ onError }: { onError: (e: unknown) => void }) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react')
    useEffect(() => onError({ error: 'NSURLErrorDomain -1100' }), [onError])
    return null
  }
}))

import { ImagePreview } from './ImagePreview'

describe('ImagePreview', () => {
  // The native error is English, technical, and logged anyway; the user
  // gets the same translated message as every other failed preview.
  it('shows a translated message when the image fails to load', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ImagePreview
        source={{ uri: 'https://example.test/a.png', headers: {} }}
        thumbnailUrl={null}
      />
    )
    expect(screen.getByText("Impossible de charger l'aperçu")).toBeOnTheScreen()
    expect(screen.queryByText('NSURLErrorDomain -1100')).toBeNull()
  })
})
