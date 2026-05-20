import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

const mockUseQuery = jest.fn()

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({}),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  Q: () => ({
    getById: () => ({}),
    where: () => ({
      partialIndex: () => ({
        indexFields: () => ({
          sortBy: () => ({ limitBy: () => ({}) })
        })
      })
    })
  })
}))

jest.mock('@/files/createFolder', () => ({
  createFolder: jest.fn().mockResolvedValue({ _id: 'new-id', name: 'New', type: 'directory' })
}))

import { createFolder } from '@/files/createFolder'
import { FolderPicker } from './FolderPicker'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

const subfolder = (id: string, name: string) => ({
  _id: id,
  name,
  type: 'directory' as const
})

const file = (id: string, name: string) => ({
  _id: id,
  name,
  type: 'file' as const
})

const setupQueries = (folderName: string, children: ReadonlyArray<unknown>): void => {
  // 1st call: fileByIdQuery (the folder doc itself)
  // 2nd call: folderSubfoldersQuery
  // 3rd call: folderFilesQuery (we still show them disabled)
  mockUseQuery.mockImplementation(() => {
    return { data: undefined, fetchStatus: 'loading', fetch: jest.fn() }
  })
  // Configure the sequence; useQuery is called in order during render.
  const sequence = [
    {
      data: { _id: 'src', name: folderName, type: 'directory', path: '/' + folderName },
      fetchStatus: 'loaded',
      fetch: jest.fn()
    },
    {
      data: children.filter((c: any) => c.type === 'directory'),
      fetchStatus: 'loaded',
      fetch: jest.fn()
    },
    {
      data: children.filter((c: any) => c.type === 'file'),
      fetchStatus: 'loaded',
      fetch: jest.fn()
    }
  ]
  let i = 0
  mockUseQuery.mockImplementation(() => sequence[Math.min(i++, sequence.length - 1)])
}

describe('FolderPicker', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
    ;(createFolder as jest.Mock).mockClear()
  })

  it('renders the initial folder name and its subfolders', () => {
    setupQueries('Work', [subfolder('a', 'Q1'), subfolder('b', 'Q2')])
    render(
      wrap(
        <FolderPicker
          initialFolderId="src"
          excludeIds={new Set()}
          confirmLabel="Move here"
          isBusy={false}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      )
    )
    expect(screen.getByText('Work')).toBeOnTheScreen()
    expect(screen.getByText('Q1')).toBeOnTheScreen()
    expect(screen.getByText('Q2')).toBeOnTheScreen()
  })

  it('disables "Move here" when current folder is in excludeIds', () => {
    setupQueries('Work', [])
    render(
      wrap(
        <FolderPicker
          initialFolderId="src"
          excludeIds={new Set(['src'])}
          confirmLabel="Move here"
          isBusy={false}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      )
    )
    // Use getByRole so we get the Pressable element that carries accessibilityState.
    const button = screen.getByRole('button', { name: 'Move here' })
    expect(button.props.accessibilityState?.disabled).toBe(true)
  })

  it('calls onConfirm with the current folder on tap', () => {
    setupQueries('Work', [])
    const onConfirm = jest.fn()
    render(
      wrap(
        <FolderPicker
          initialFolderId="src"
          excludeIds={new Set()}
          confirmLabel="Move here"
          isBusy={false}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      )
    )
    fireEvent.press(screen.getByText('Move here'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ _id: 'src', name: 'Work' }))
  })

  it('calls onCancel when the Cancel button is tapped', () => {
    setupQueries('Work', [])
    const onCancel = jest.fn()
    render(
      wrap(
        <FolderPicker
          initialFolderId="src"
          excludeIds={new Set()}
          confirmLabel="Move here"
          isBusy={false}
          onConfirm={jest.fn()}
          onCancel={onCancel}
        />
      )
    )
    fireEvent.press(screen.getByText('common.cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders disabled files in the list', () => {
    setupQueries('Work', [subfolder('a', 'Q1'), file('f', 'budget.xlsx')])
    render(
      wrap(
        <FolderPicker
          initialFolderId="src"
          excludeIds={new Set()}
          confirmLabel="Move here"
          isBusy={false}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      )
    )
    expect(screen.getByText('budget.xlsx')).toBeOnTheScreen()
  })

  it('drills into a folder when its row is tapped', () => {
    setupQueries('Work', [subfolder('a', 'Q1')])
    const onConfirm = jest.fn()
    render(
      wrap(
        <FolderPicker
          initialFolderId="src"
          excludeIds={new Set()}
          confirmLabel="Move here"
          isBusy={false}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      )
    )
    // Tap the Q1 row to drill in, then immediately confirm.
    // This proves the stack was updated (confirm fires with Q1's id 'a').
    fireEvent.press(screen.getByText('Q1'))
    fireEvent.press(screen.getByText('Move here'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ _id: 'a' }))
  })

  it('does not render the back arrow at the root level', () => {
    // At root the only way to dismiss the modal is the Cancel button in the
    // footer; hiding the back arrow avoids the back-vs-cancel confusion that
    // led users to think the back was broken.
    setupQueries('Work', [])
    render(
      wrap(
        <FolderPicker
          initialFolderId="src"
          excludeIds={new Set()}
          confirmLabel="Move here"
          isBusy={false}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      )
    )
    expect(screen.queryByLabelText('common.back')).toBeNull()
  })

  it('opens the create-folder dialog when the "+ New folder" button is tapped', () => {
    setupQueries('Work', [])
    render(
      wrap(
        <FolderPicker
          initialFolderId="src"
          excludeIds={new Set()}
          confirmLabel="Move here"
          isBusy={false}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      )
    )
    fireEvent.press(screen.getByLabelText('drive.move.newFolder'))
    // CreateFolderDialog renders a title whose translation key is returned as-is.
    expect(screen.getByText('drive.createFolder.title')).toBeOnTheScreen()
  })
})
