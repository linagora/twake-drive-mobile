import React from 'react'
import { Image } from 'react-native'
import { render, waitFor } from '@testing-library/react-native'

const mockGet = jest.fn()
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({
    getStackClient: () => ({
      uri: 'https://alice.example',
      collection: () => ({ get: mockGet })
    })
  })
}))
let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))
jest.mock('@/ui/icons/FileTypeIcon', () => ({ FileTypeIcon: () => null }))

import { FileThumbnail } from './FileThumbnail'

const photo = { _id: 'img-1', name: 'sample.jpg', type: 'file' as const, class: 'image' }

test('fetches the thumbnail again once the network is back', async () => {
  mockOnline = false
  mockGet.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue({
    data: { links: { tiny: '/files/img-1/thumbnails/tiny' } }
  })
  const view = () => <FileThumbnail file={photo} />

  const { rerender, UNSAFE_queryAllByType } = render(view())
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
  expect(UNSAFE_queryAllByType(Image)).toHaveLength(0)

  mockOnline = true
  rerender(view())
  await waitFor(() => expect(UNSAFE_queryAllByType(Image)).toHaveLength(1))
  expect(UNSAFE_queryAllByType(Image)[0].props.source).toEqual({
    uri: 'https://alice.example/files/img-1/thumbnails/tiny'
  })
})

test('does not ask the stack again for a file it refused', async () => {
  mockOnline = true
  mockGet.mockReset().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
  const view = () => <FileThumbnail file={{ ...photo, _id: 'img-404' }} />

  const first = render(view())
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
  first.unmount()

  render(view())
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(mockGet).toHaveBeenCalledTimes(1)
})
