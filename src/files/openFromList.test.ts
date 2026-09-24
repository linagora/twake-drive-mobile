jest.mock('cozy-flags', () => ({ __esModule: true, default: jest.fn() }))

import type CozyClient from 'cozy-client'
import flag from 'cozy-flags'
import type { Router } from 'expo-router'

import { openFileFromList } from './openFromList'

const mockFlag = flag as unknown as jest.Mock
const client = {} as CozyClient
const router = { push: jest.fn() } as unknown as Router

describe('openFileFromList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFlag.mockReturnValue(false)
  })

  it('hands the Docs bridge the external id the document is addressed by', async () => {
    const openEditor = jest.fn().mockResolvedValue(undefined)

    await openFileFromList(
      client,
      router,
      { _id: 'f1', name: 'Compte rendu.docs-note', metadata: { externalId: 'ext-9' } },
      undefined,
      openEditor
    )

    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'f1', metadata: { externalId: 'ext-9' } }),
      undefined
    )
  })

  it('carries the external id into a shared drive too', async () => {
    const openEditor = jest.fn().mockResolvedValue(undefined)

    await openFileFromList(
      client,
      router,
      { _id: 'f2', name: 'Note.docs-note', metadata: { externalId: 'ext-4' } },
      'drive-1',
      openEditor
    )

    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { externalId: 'ext-4' } }),
      'drive-1'
    )
  })

  it('still opens a document that has no metadata at all', async () => {
    const openEditor = jest.fn().mockResolvedValue(undefined)

    await openFileFromList(
      client,
      router,
      { _id: 'f3', name: 'rapport.docx' },
      undefined,
      openEditor
    )

    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'f3', name: 'rapport.docx' }),
      undefined
    )
  })

  it('previews a type no editor claims', async () => {
    await openFileFromList(client, router, { _id: 'f4', name: 'photo.jpg', mime: 'image/jpeg' })

    expect(router.push).toHaveBeenCalledWith('/preview/f4')
  })
})
