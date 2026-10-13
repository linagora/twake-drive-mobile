import React from 'react'
import { render, screen } from '@testing-library/react-native'
import '@/i18n'

import { TextPreview } from './TextPreview'

describe('TextPreview', () => {
  it('shows a translated message when the file cannot be fetched', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'))
    render(<TextPreview source={{ uri: 'https://example.test/a.txt', headers: {} }} />)
    expect(await screen.findByText("Impossible de charger l'aperçu")).toBeOnTheScreen()
    expect(screen.queryByText('Network request failed')).toBeNull()
  })
})
