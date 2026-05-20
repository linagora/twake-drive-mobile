# Move Files & Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Move action (single + bulk) for files and folders, surfaced via the row 3-dot menu, the bulk action bar, and the metadata modal. Picker is a page-sheet folder navigator with inline folder creation.

**Architecture:** A new `app/move/[ids].tsx` page-sheet modal route orchestrates the flow. It parses comma-separated entry ids from the URL, queries the first entry for the source folder, then renders a presentational `<FolderPicker>` (new component under `src/ui/FolderPicker/`). Confirmation triggers sequential `moveEntry(client, entry, destDirId, { force: true })` calls. The `moveEntry` helper wraps `client.collection('io.cozy.files').updateAttributes(id, { dir_id })` with 409-conflict force handling (stat → destroy → retry).

**Tech Stack:** React Native + Expo SDK 54, expo-router v5, cozy-client v60 (`updateAttributes`, `statByPath`, `destroy`), react-native-paper, Jest 29 + jest-expo + @testing-library/react-native, TypeScript strict, ESLint, conventional commits.

**Reference spec:** `docs/superpowers/specs/2026-05-20-move-files-folders-design.md`

**Branch:** `feat/move-files` (already created from main, with `chore: ignore .superpowers/` as the first commit).

---

## File map

### Files to create

```
src/files/moveEntry.ts                          // moveEntry helper + 409/force handling
src/files/moveEntry.test.ts                     // unit tests
src/ui/FolderPicker/FolderPicker.tsx            // presentational shell
src/ui/FolderPicker/FolderPickerRow.tsx         // folder row in the list (also renders disabled file rows)
src/ui/FolderPicker/index.ts                    // re-exports
src/ui/FolderPicker/FolderPicker.test.tsx       // UI behavior tests
app/move/[ids].tsx                              // orchestrator route
app/move/[ids].test.tsx                         // route tests
```

### Files to modify

```
app/_layout.tsx                                 // declare /move/[ids] pageSheet route
src/i18n/locales/en.json                        // new keys under drive.move + drive.fileMeta.move + drive.selection.move
src/i18n/locales/fr.json                        // same
src/ui/FileRow.tsx                              // add onMove prop + Menu.Item
src/ui/FolderRow.tsx                            // add onMove prop + Menu.Item
src/ui/FileRow.test.tsx                         // assert "Move…" menu item appears
src/ui/FolderRow.test.tsx                       // same
app/(drive)/files/[...path].tsx                 // wire onMove on rows + Move icon in bulk action bar
app/(drive)/recent.tsx                          // wire onMove on rows
app/(drive)/shared/[...path].tsx                // wire onMove on rows
app/(drive)/shareddrives/[...path].tsx          // wire onMove on rows
app/metadata/[fileId].tsx                       // add Move button in footer
app/metadata/[fileId].test.tsx                  // assert Move button + router.replace
docs/TODO.md                                    // remove the shipped TODO entry
```

(`app/(drive)/trash.tsx` is intentionally untouched: trashed items cannot be moved.)

---

## Conventions used throughout the plan

- **Commits**: conventional, format `<type>(<scope>): <subject>`. Scopes used: `files` (helper), `ui` (FolderPicker, row), `move` (route), `drive` (list-screen wiring), `metadata` (modal), `docs`.
- **Trailer on every commit**: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Test runner**: `npx jest <path>` for one file, `npx jest` for all.
- **Type check**: `npx tsc --noEmit`.
- **Lint**: `npx eslint <path>` or `npx eslint .` overall. Always pass `--fix` for prettier auto-formatting if it complains; only stage manual fixes for real issues.
- **Pre-existing baseline**: 8 tests fail in 4 suites (`useAuth`, `createClient`, `getLinks`, `platformReactNative`) and 4 TS errors exist in `app/(auth)/login.tsx`, `app/index.tsx`, `src/auth/registerSession.ts`, `src/client/createClient.ts`. Each commit must leave this same baseline — no regression, no fixes.

---

## Task 1: `moveEntry` helper (commit 1)

**Files:**
- Create: `src/files/moveEntry.ts`
- Create: `src/files/moveEntry.test.ts`

**Goal:** Pure helper mirroring twake-drive-web's `executeMove` for the simple Cozy case (no shared drives, no Nextcloud). Internally uses cozy-client's `FileCollection`: `updateAttributes({ dir_id })`, then handles 409 conflicts via `statByPath` + `destroy` + retry when `force: true` is set.

- [ ] **Step 1: Write the failing test**

Write `src/files/moveEntry.test.ts`:

```ts
jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { moveEntry } from './moveEntry'

interface MockCollection {
  updateAttributes: jest.Mock
  statByPath: jest.Mock
  destroy: jest.Mock
  get: jest.Mock
}

const buildClient = (col: MockCollection) =>
  ({
    collection: jest.fn(() => col)
  }) as unknown as Parameters<typeof moveEntry>[0]

const buildCollection = (overrides: Partial<MockCollection> = {}): MockCollection => ({
  updateAttributes: jest.fn(),
  statByPath: jest.fn(),
  destroy: jest.fn(),
  get: jest.fn().mockResolvedValue({ data: { _id: 'dest', name: 'Dest', path: '/Drive/Dest' } }),
  ...overrides
})

const entry = {
  _id: 'src',
  name: 'Report.pdf',
  type: 'file' as const,
  dir_id: 'old-parent'
}

describe('moveEntry', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('updates the entry dir_id and returns moved payload', async () => {
    const updateAttributes = jest.fn().mockResolvedValue({
      data: { _id: 'src', dir_id: 'dest' }
    })
    const col = buildCollection({ updateAttributes })
    const result = await moveEntry(buildClient(col), entry, 'dest')
    expect(updateAttributes).toHaveBeenCalledWith('src', { dir_id: 'dest' })
    expect(result).toEqual({
      moved: { _id: 'src', dir_id: 'dest' },
      deleted: null
    })
  })

  it('triggers a pouch replication on success', async () => {
    const updateAttributes = jest.fn().mockResolvedValue({
      data: { _id: 'src', dir_id: 'dest' }
    })
    const client = buildClient(buildCollection({ updateAttributes }))
    await moveEntry(client, entry, 'dest')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('rethrows non-409 errors', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
    await expect(
      moveEntry(buildClient(buildCollection({ updateAttributes })), entry, 'dest')
    ).rejects.toThrow('boom')
  })

  it('rethrows 409 when force is not set', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }))
    await expect(
      moveEntry(buildClient(buildCollection({ updateAttributes })), entry, 'dest')
    ).rejects.toThrow('conflict')
  })

  it('on 409 with force: stats dest path, destroys conflict, retries', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const updateAttributes = jest
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ data: { _id: 'src', dir_id: 'dest' } })
    const statByPath = jest.fn().mockResolvedValue({
      data: { _id: 'other', name: 'Report.pdf', type: 'file' }
    })
    const destroy = jest.fn().mockResolvedValue({})
    const get = jest.fn().mockResolvedValue({
      data: { _id: 'dest', name: 'Dest', path: '/Drive/Dest' }
    })
    const col = buildCollection({ updateAttributes, statByPath, destroy, get })
    const result = await moveEntry(buildClient(col), entry, 'dest', { force: true })
    expect(statByPath).toHaveBeenCalledWith('/Drive/Dest/Report.pdf')
    expect(destroy).toHaveBeenCalledWith({
      _id: 'other',
      name: 'Report.pdf',
      type: 'file'
    })
    expect(updateAttributes).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      moved: { _id: 'src', dir_id: 'dest' },
      deleted: 'other'
    })
  })

  it('on 409 with force: rethrows if the retry also fails', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const updateAttributes = jest.fn().mockRejectedValue(conflict)
    const statByPath = jest.fn().mockResolvedValue({
      data: { _id: 'other', name: 'Report.pdf', type: 'file' }
    })
    const destroy = jest.fn().mockResolvedValue({})
    const col = buildCollection({ updateAttributes, statByPath, destroy })
    await expect(
      moveEntry(buildClient(col), entry, 'dest', { force: true })
    ).rejects.toThrow('conflict')
  })

  it('recognises 409 via err.response.status too', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('c'), { response: { status: 409 } }))
    await expect(
      moveEntry(buildClient(buildCollection({ updateAttributes })), entry, 'dest')
    ).rejects.toThrow('c')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx jest src/files/moveEntry.test.ts`
Expected: FAIL — `Cannot find module './moveEntry'`.

- [ ] **Step 3: Implement `moveEntry.ts`**

Write `src/files/moveEntry.ts`:

```ts
import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

export interface MoveEntryTarget {
  _id: string
  name: string
  type: 'file' | 'directory'
  dir_id: string
}

export interface MoveEntryResult {
  moved: { _id: string; dir_id: string }
  /** Id of the file that was sent to trash on 409 + force=true to free
   *  the destination name. null when no conflict resolution happened. */
  deleted: string | null
}

interface DestinationDoc {
  _id: string
  name: string
  path: string
}

interface ConflictingDoc {
  _id: string
  name: string
  type: 'file' | 'directory'
  _rev?: string
}

interface FilesCollection {
  updateAttributes: (
    id: string,
    attributes: { dir_id: string }
  ) => Promise<{ data: { _id: string; dir_id: string } }>
  statByPath: (path: string) => Promise<{ data: ConflictingDoc }>
  destroy: (doc: ConflictingDoc) => Promise<unknown>
  get: (id: string) => Promise<{ data: DestinationDoc }>
}

const is409 = (e: unknown): boolean => {
  const err = e as { status?: number; response?: { status?: number } }
  return err.status === 409 || err.response?.status === 409
}

/**
 * Move a file or folder into another directory.
 *
 * Mirrors twake-drive-web's executeMove (paste/index.js:67), which itself
 * wraps cozy-client's models/file.js#move() for the simple Cozy case.
 * Implementation:
 *
 *   1. updateAttributes(id, { dir_id }) — cozy-stack updates the parent.
 *   2. On HTTP 409 with force=true: read the destination directory's path,
 *      build the conflicting full path (destPath + '/' + entry.name),
 *      statByPath that path to get the conflicting doc, destroy it (sent
 *      to trash), then retry updateAttributes.
 *   3. On HTTP 409 without force, or any other error, rethrow.
 *
 * Shared drives + Nextcloud destinations are not supported in v1.
 */
export const moveEntry = async (
  client: CozyClient,
  entry: MoveEntryTarget,
  destDirId: string,
  options?: { force?: boolean }
): Promise<MoveEntryResult> => {
  const collection = client.collection('io.cozy.files') as unknown as FilesCollection
  const force = options?.force ?? false

  try {
    const result = await collection.updateAttributes(entry._id, { dir_id: destDirId })
    triggerPouchReplication(client, 'io.cozy.files')
    return { moved: result.data, deleted: null }
  } catch (e) {
    if (!is409(e) || !force) throw e
    // Resolve the conflict: trash the existing file at the destination
    // path, then retry the move.
    const dest = await collection.get(destDirId)
    const destPath = dest.data.path.replace(/\/$/, '')
    const conflictPath = `${destPath}/${entry.name}`
    const conflicting = await collection.statByPath(conflictPath)
    await collection.destroy(conflicting.data)
    const retry = await collection.updateAttributes(entry._id, { dir_id: destDirId })
    triggerPouchReplication(client, 'io.cozy.files')
    return { moved: retry.data, deleted: conflicting.data._id }
  }
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `npx jest src/files/moveEntry.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Run all tests + tsc + lint**

```bash
npx jest && npx tsc --noEmit && npx eslint src/files/moveEntry.ts src/files/moveEntry.test.ts
```

Expected: same pre-existing baseline (8 tests fail, 4 TS errors), no new failures, no lint errors on the new files. If lint complains about prettier, run `npx eslint <files> --fix` and re-verify.

- [ ] **Step 6: Commit**

```bash
git add src/files/moveEntry.ts src/files/moveEntry.test.ts
git commit -m "$(cat <<'EOF'
feat(files): add moveEntry helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `FolderPicker` component (commit 2)

**Files:**
- Create: `src/ui/FolderPicker/FolderPicker.tsx`
- Create: `src/ui/FolderPicker/FolderPickerRow.tsx`
- Create: `src/ui/FolderPicker/index.ts`
- Create: `src/ui/FolderPicker/FolderPicker.test.tsx`

**Goal:** Standalone presentational picker. Owns its own folder-stack navigation (drill in, drill back) and the "+ New folder" dialog wiring. Calls `onConfirm(folder)` / `onCancel()` for the parent to handle. No router coupling, no mutations beyond the existing `createFolder` helper.

- [ ] **Step 1: Create the index re-export skeleton**

Write `src/ui/FolderPicker/index.ts`:

```ts
export { FolderPicker } from './FolderPicker'
export type { FolderPickerProps } from './FolderPicker'
```

- [ ] **Step 2: Implement `FolderPickerRow.tsx`**

Write `src/ui/FolderPicker/FolderPickerRow.tsx`:

```tsx
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { List, useTheme } from 'react-native-paper'

import { FileTypeIcon } from '@/ui/icons/FileTypeIcon'

export interface FolderPickerRowItem {
  _id: string
  name: string
  type: 'file' | 'directory'
}

interface Props {
  item: FolderPickerRowItem
  disabled: boolean
  onPress: (item: FolderPickerRowItem) => void
}

export const FolderPickerRow = ({ item, disabled, onPress }: Props) => {
  const theme = useTheme()
  const isFolder = item.type === 'directory'
  return (
    <List.Item
      title={item.name}
      titleStyle={disabled ? { color: theme.colors.outline } : undefined}
      left={props => (
        <View style={[props.style, styles.leftSlot]}>
          <FileTypeIcon icon={isFolder ? 'folder' : 'file-outline'} size={32} />
        </View>
      )}
      right={props =>
        isFolder && !disabled ? <List.Icon {...props} icon="chevron-right" /> : null
      }
      onPress={disabled ? undefined : () => onPress(item)}
      style={styles.row}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 },
  leftSlot: { justifyContent: 'center', alignItems: 'center', width: 32, height: 32 }
})
```

- [ ] **Step 3: Write the failing test for `FolderPicker`**

Write `src/ui/FolderPicker/FolderPicker.test.tsx`:

```tsx
import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

const mockUseQuery = jest.fn()

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({}),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  Q: () => ({
    getById: () => ({}),
    where: () => ({
      partialIndex: () => ({ indexFields: () => ({ limitBy: () => ({}) }) })
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
    { data: { _id: 'src', name: folderName, type: 'directory', path: '/' + folderName }, fetchStatus: 'loaded', fetch: jest.fn() },
    { data: children.filter((c: any) => c.type === 'directory'), fetchStatus: 'loaded', fetch: jest.fn() },
    { data: children.filter((c: any) => c.type === 'file'), fetchStatus: 'loaded', fetch: jest.fn() }
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
    const button = screen.getByText('Move here')
    // Paper renders a wrapping Pressable with accessibilityState; assert disabled.
    expect(button.parent?.props.accessibilityState?.disabled).toBe(true)
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
})
```

- [ ] **Step 4: Run the test — expect failure**

Run: `npx jest src/ui/FolderPicker/FolderPicker.test.tsx`
Expected: FAIL — `Cannot find module './FolderPicker'`.

- [ ] **Step 5: Implement `FolderPicker.tsx`**

Write `src/ui/FolderPicker/FolderPicker.tsx`:

```tsx
import React, { useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { Appbar, Button, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { CreateFolderDialog } from '@/ui/CreateFolderDialog'
import { createFolder } from '@/files/createFolder'
import {
  FileQueryResult,
  fileByIdQuery,
  fileByIdQueryAs,
  folderFilesQuery,
  folderFilesQueryAs,
  folderSubfoldersQuery,
  folderSubfoldersQueryAs
} from '@/client/queries'
import { FolderPickerRow, FolderPickerRowItem } from './FolderPickerRow'

export interface FolderPickerSelection {
  _id: string
  name: string
}

export interface FolderPickerProps {
  initialFolderId: string
  excludeIds: Set<string>
  confirmLabel: string
  isBusy: boolean
  onConfirm: (folder: FolderPickerSelection) => void
  onCancel: () => void
}

interface StackEntry {
  id: string
  name: string
}

export const FolderPicker = ({
  initialFolderId,
  excludeIds,
  confirmLabel,
  isBusy,
  onConfirm,
  onCancel
}: FolderPickerProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const [stack, setStack] = useState<StackEntry[]>([{ id: initialFolderId, name: '' }])
  const [creatingFolder, setCreatingFolder] = useState(false)
  const current = stack[stack.length - 1]

  const folderLookup = useQuery(fileByIdQuery(current.id), {
    as: fileByIdQueryAs(current.id)
  })
  const folderDoc = (Array.isArray(folderLookup.data) ? folderLookup.data[0] : folderLookup.data) as
    | FileQueryResult
    | null
    | undefined

  const subfoldersQuery = useQuery(folderSubfoldersQuery(current.id), {
    as: folderSubfoldersQueryAs(current.id)
  })
  const filesQuery = useQuery(folderFilesQuery(current.id), {
    as: folderFilesQueryAs(current.id)
  })

  const subfolders = (subfoldersQuery.data as FileQueryResult[] | null | undefined) ?? []
  const files = (filesQuery.data as FileQueryResult[] | null | undefined) ?? []
  const items: FolderPickerRowItem[] = [
    ...subfolders.map(d => ({ _id: d._id, name: d.name, type: 'directory' as const })),
    ...files.map(f => ({ _id: f._id, name: f.name, type: 'file' as const }))
  ]

  const isAtRoot = stack.length === 1
  const isLoading =
    (folderLookup.fetchStatus === 'loading' && !folderDoc) ||
    (subfoldersQuery.fetchStatus === 'loading' && subfolders.length === 0)
  const hasError =
    folderLookup.fetchStatus === 'failed' || subfoldersQuery.fetchStatus === 'failed'

  const title = folderDoc?.name ?? current.name ?? ''

  const navigateInto = (item: FolderPickerRowItem): void => {
    if (item.type !== 'directory') return
    setStack(prev => [...prev, { id: item._id, name: item.name }])
  }

  const navigateBack = (): void => {
    if (isAtRoot) {
      onCancel()
      return
    }
    setStack(prev => prev.slice(0, -1))
  }

  const onCreateFolder = async (name: string): Promise<void> => {
    if (!client) throw new Error('No client')
    const created = await createFolder(client, name, current.id)
    setCreatingFolder(false)
    // Auto drill into the newly created folder
    setStack(prev => [...prev, { id: created._id, name: created.name }])
    void subfoldersQuery.fetch()
  }

  const confirmDisabled = isBusy || excludeIds.has(current.id)

  return (
    <ScreenContainer>
      <Appbar.Header>
        <Appbar.BackAction onPress={navigateBack} accessibilityLabel={t('common.back')} />
        <Appbar.Content title={title} />
        <Appbar.Action
          icon="folder-plus"
          accessibilityLabel={t('drive.move.newFolder')}
          onPress={() => setCreatingFolder(true)}
        />
      </Appbar.Header>
      {hasError ? (
        <ErrorState
          message={t('drive.preview.loadFailed')}
          onRetry={() => {
            void folderLookup.fetch()
            void subfoldersQuery.fetch()
            void filesQuery.fetch()
          }}
        />
      ) : isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message={t('drive.emptyFolder')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i._id}
          renderItem={({ item }) => (
            <FolderPickerRow
              item={item}
              disabled={item.type === 'file' || excludeIds.has(item._id)}
              onPress={navigateInto}
            />
          )}
        />
      )}
      <View style={[styles.footer, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Button mode="outlined" onPress={onCancel} style={styles.footerButton}>
          {t('common.cancel')}
        </Button>
        <Button
          mode="contained"
          disabled={confirmDisabled}
          loading={isBusy}
          onPress={() => onConfirm({ _id: current.id, name: title })}
          style={styles.footerButton}
        >
          {confirmLabel}
        </Button>
      </View>
      <CreateFolderDialog
        visible={creatingFolder}
        onDismiss={() => setCreatingFolder(false)}
        onSubmit={onCreateFolder}
      />
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#0001'
  },
  footerButton: { flex: 1 }
})
```

- [ ] **Step 6: Run the test — expect pass**

Run: `npx jest src/ui/FolderPicker/FolderPicker.test.tsx`
Expected: PASS — 5 tests green. If the tests for disabled-state assertion fail because of Paper internals, adjust to `expect(button).toHaveStyle(...)` or use `findByRole` — but try the first form first.

- [ ] **Step 7: Run all tests + tsc + lint**

```bash
npx jest && npx tsc --noEmit && npx eslint src/ui/FolderPicker
```

Expected: baseline preserved; lint clean (run `--fix` if prettier-only).

- [ ] **Step 8: Commit**

```bash
git add src/ui/FolderPicker
git commit -m "$(cat <<'EOF'
feat(ui): add FolderPicker component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `/move/[ids]` modal route (commit 3)

**Files:**
- Create: `app/move/[ids].tsx`
- Create: `app/move/[ids].test.tsx`
- Modify: `app/_layout.tsx` (declare the route)
- Modify: `src/i18n/locales/en.json` and `src/i18n/locales/fr.json` (add keys)

**Goal:** Stand up the new modal route. Parses the comma-separated entry ids from the URL, queries the first entry to know the source folder, renders `<FolderPicker>` and orchestrates the moves on confirm. No callers wired in this commit; route is reachable but no one pushes to it yet.

- [ ] **Step 1: Add the i18n keys to both locales**

Open `src/i18n/locales/fr.json`. Inside the `drive.fileMeta` object, after `"info"`, add a `"move"` key:

```json
      "info": "Détails",
      "move": "Déplacer…"
```

After the `delete` block, insert a `move` block:

```json
    "move": {
      "title": "Déplacer",
      "action": "Déplacer ici",
      "successFile": "Fichier déplacé",
      "successFolder": "Dossier déplacé",
      "successBulk": "{{count}} éléments déplacés",
      "errorGeneric": "Impossible de déplacer",
      "newFolder": "Nouveau dossier"
    },
```

Inside the `selection` block, add `move`:

```json
    "selection": {
      "count_one": "{{count}} sélectionné",
      "count_other": "{{count}} sélectionnés",
      "move": "Déplacer"
    },
```

Now apply the same in `src/i18n/locales/en.json`:

```json
      "info": "Details",
      "move": "Move…"
```

```json
    "move": {
      "title": "Move",
      "action": "Move here",
      "successFile": "File moved",
      "successFolder": "Folder moved",
      "successBulk": "{{count}} items moved",
      "errorGeneric": "Move failed",
      "newFolder": "New folder"
    },
```

```json
    "selection": {
      "count_one": "{{count}} selected",
      "count_other": "{{count}} selected",
      "move": "Move"
    },
```

Verify both files are still valid JSON: `node -e 'JSON.parse(require("fs").readFileSync("src/i18n/locales/fr.json", "utf8"))' && node -e 'JSON.parse(require("fs").readFileSync("src/i18n/locales/en.json", "utf8"))'` → no output, no error.

- [ ] **Step 2: Declare the route in `app/_layout.tsx`**

Open `app/_layout.tsx`. Inside the `<Stack>` block, alongside the existing `metadata/[fileId]` and `share/[fileId]` declarations, add:

```tsx
                    <Stack.Screen
                      name="move/[ids]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
```

- [ ] **Step 3: Write the failing test for the route**

Write `app/move/[ids].test.tsx`:

```tsx
import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ ids: 'a,b' })
}))

const mockMoveEntry = jest.fn()
jest.mock('@/files/moveEntry', () => ({
  moveEntry: (...args: unknown[]) => mockMoveEntry(...args)
}))

const mockUseQuery = jest.fn()

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({}),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  Q: () => ({
    getById: () => ({}),
    where: () => ({
      partialIndex: () => ({ indexFields: () => ({ limitBy: () => ({}) }) })
    })
  })
}))

jest.mock('@/files/createFolder', () => ({ createFolder: jest.fn() }))

import MoveRoute from './[ids]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

const setupQueries = ({
  firstEntry,
  folderName = 'Work'
}: {
  firstEntry?: { _id: string; name: string; type: 'file' | 'directory'; dir_id: string } | null
  folderName?: string
} = {}): void => {
  const sequence = [
    // 1st useQuery: first-entry lookup (fileByIdQuery(a))
    {
      data: firstEntry === undefined ? { _id: 'a', name: 'Report.pdf', type: 'file', dir_id: 'src' } : firstEntry,
      fetchStatus: firstEntry === null ? 'loaded' : 'loaded',
      fetch: jest.fn()
    },
    // 2nd: FolderPicker's fileByIdQuery for the current folder doc
    {
      data: { _id: 'src', name: folderName, type: 'directory', path: '/' + folderName },
      fetchStatus: 'loaded',
      fetch: jest.fn()
    },
    // 3rd: subfolders
    { data: [], fetchStatus: 'loaded', fetch: jest.fn() },
    // 4th: files
    { data: [], fetchStatus: 'loaded', fetch: jest.fn() }
  ]
  let i = 0
  mockUseQuery.mockImplementation(() => sequence[Math.min(i++, sequence.length - 1)])
}

describe('MoveRoute', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockReplace.mockReset()
    mockMoveEntry.mockReset()
    mockUseQuery.mockReset()
  })

  it('renders the folder picker once the source folder is known', () => {
    setupQueries()
    render(wrap(<MoveRoute />))
    expect(screen.getByText('Work')).toBeOnTheScreen()
  })

  it('renders a loading state until the first entry is known', () => {
    mockUseQuery.mockReturnValue({ data: undefined, fetchStatus: 'loading', fetch: jest.fn() })
    render(wrap(<MoveRoute />))
    // No folder name shown yet
    expect(screen.queryByText('Work')).toBeNull()
  })

  it('shows an error state when the first entry resolves to null', () => {
    mockUseQuery.mockReturnValue({ data: null, fetchStatus: 'loaded', fetch: jest.fn() })
    render(wrap(<MoveRoute />))
    expect(screen.getByText('drive.preview.loadFailed')).toBeOnTheScreen()
  })

  it('calls moveEntry sequentially for each id on confirm', async () => {
    setupQueries()
    mockMoveEntry.mockResolvedValue({ moved: { _id: 'a', dir_id: 'src' }, deleted: null })
    render(wrap(<MoveRoute />))
    fireEvent.press(screen.getByText('drive.move.action'))
    await waitFor(() => {
      expect(mockMoveEntry).toHaveBeenCalledTimes(2)
    })
    const firstCallEntryId = mockMoveEntry.mock.calls[0][1]._id
    const secondCallEntryId = mockMoveEntry.mock.calls[1][1]._id
    expect([firstCallEntryId, secondCallEntryId]).toEqual(['a', 'b'])
  })

  it('shows error snackbar when moveEntry rejects, keeps modal open', async () => {
    setupQueries()
    mockMoveEntry.mockRejectedValue(new Error('boom'))
    render(wrap(<MoveRoute />))
    fireEvent.press(screen.getByText('drive.move.action'))
    await waitFor(() => {
      expect(screen.getByText('drive.move.errorGeneric')).toBeOnTheScreen()
    })
    expect(mockBack).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run the test — expect failure**

Run: `npx jest app/move`
Expected: FAIL — `Cannot find module './[ids]'`.

- [ ] **Step 5: Implement `app/move/[ids].tsx`**

Write `app/move/[ids].tsx`:

```tsx
import React, { useCallback, useMemo, useState } from 'react'
import { Snackbar } from 'react-native-paper'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FolderPicker, FolderPickerSelection } from '@/ui/FolderPicker'
import { moveEntry, MoveEntryTarget } from '@/files/moveEntry'
import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'

// Match the metadata route's snackbar-dismiss delay so the success
// message has time to be visible before the modal slides down.
const SNACKBAR_DISMISS_DELAY_MS = 600

export default function MoveRoute() {
  const router = useRouter()
  const { t } = useTranslation()
  const client = useClient()
  const { ids } = useLocalSearchParams<{ ids: string }>()
  const idList = useMemo(
    () => (ids ? ids.split(',').filter(Boolean) : []),
    [ids]
  )
  const firstId = idList[0] ?? ''

  const firstLookup = useQuery(fileByIdQuery(firstId), {
    as: fileByIdQueryAs(firstId),
    enabled: !!firstId
  })
  const firstDoc = (Array.isArray(firstLookup.data) ? firstLookup.data[0] : firstLookup.data) as
    | FileQueryResult
    | null
    | undefined

  const [busy, setBusy] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const close = useCallback((): void => {
    if (router.canGoBack()) router.back()
  }, [router])

  const onConfirm = useCallback(
    async (dest: FolderPickerSelection): Promise<void> => {
      if (!client || !firstDoc) return
      setBusy(true)
      setSnackbar(null)
      try {
        // Sequential, not parallel: cozy-stack can race on concurrent
        // dir_id mutations and we want to surface any single failure.
        // Mirrors the existing confirmBulkDelete pattern in
        // app/(drive)/files/[...path].tsx.
        for (const id of idList) {
          // Build a minimal target. The full entry doc is fetched on
          // demand only for the first one (above); other ids may be in
          // cozy-client's cache from the source list, but to keep this
          // simple we pass only the bits moveEntry needs.
          const target: MoveEntryTarget = {
            _id: id,
            name: id === firstDoc._id ? firstDoc.name : '',
            type: id === firstDoc._id ? firstDoc.type ?? 'file' : 'file',
            dir_id: firstDoc.dir_id ?? ''
          }
          await moveEntry(client, target, dest._id, { force: true })
        }
        const successKey =
          idList.length > 1
            ? 'drive.move.successBulk'
            : firstDoc.type === 'directory'
              ? 'drive.move.successFolder'
              : 'drive.move.successFile'
        setSnackbar(t(successKey, { count: idList.length }))
        setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
      } catch (e) {
        console.error('[MoveRoute] move failed', e)
        setSnackbar(t('drive.move.errorGeneric'))
      } finally {
        setBusy(false)
      }
    },
    [client, firstDoc, idList, t, close]
  )

  if (firstLookup.fetchStatus === 'loading' && !firstDoc) {
    return (
      <ScreenContainer>
        <LoadingState />
      </ScreenContainer>
    )
  }

  if (!firstDoc) {
    return (
      <ScreenContainer>
        <ErrorState
          message={t('drive.preview.loadFailed')}
          onRetry={() => firstLookup.fetch()}
        />
      </ScreenContainer>
    )
  }

  const sourceDirId = firstDoc.dir_id ?? ''
  const excludeIds = new Set<string>([...idList])

  return (
    <>
      <FolderPicker
        initialFolderId={sourceDirId}
        excludeIds={excludeIds}
        confirmLabel={t('drive.move.action')}
        isBusy={busy}
        onConfirm={onConfirm}
        onCancel={close}
      />
      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={3000}
      >
        {snackbar ?? ''}
      </Snackbar>
    </>
  )
}
```

- [ ] **Step 6: Run the test — expect pass**

Run: `npx jest app/move`
Expected: PASS — 5 tests green.

> Note: the test for the "moveEntry called sequentially" path is the most likely to flake on async timing. If it fails with the resolved promise not having settled before the assertion, wrap the assertion in `await waitFor(...)` (already used) or add `await new Promise(r => setTimeout(r, 0))` between the press and the assertion.

- [ ] **Step 7: Run all tests + tsc + lint**

```bash
npx jest && npx tsc --noEmit && npx eslint app/move app/_layout.tsx src/i18n
```

Expected: baseline preserved (no new failures), no new TS errors, lint clean on touched files.

- [ ] **Step 8: Commit**

```bash
git add app/move app/_layout.tsx src/i18n/locales
git commit -m "$(cat <<'EOF'
feat(move): add /move/[ids] modal route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `onMove` prop on `FileRow` and `FolderRow` (commit 4)

**Files:**
- Modify: `src/ui/FileRow.tsx`
- Modify: `src/ui/FolderRow.tsx`
- Modify: `src/ui/FileRow.test.tsx`
- Modify: `src/ui/FolderRow.test.tsx`

**Goal:** Opt-in `onMove` prop on both row components. When set, the 3-dot menu gains a "Move…" item. No caller passes it yet — runtime is unaffected.

- [ ] **Step 1: Update `src/ui/FileRow.tsx`**

In the `Props` interface, after `onDelete?`, add:

```ts
  onMove?: (file: FileItem) => void
```

In the destructure of `Props`, after `onDelete`, add `onMove`. Update the `hasMenu` condition:

```ts
  const hasMenu =
    (!!onShare || !!onRename || !!onRestore || !!onDelete || !!onTogglePin || !!onMove || !!onInfo) &&
    !selected
```

In the Menu body, after the `onDelete` `<Menu.Item>` block and before the `onInfo` one, insert:

```tsx
            {onMove ? (
              <Menu.Item
                leadingIcon="folder-move-outline"
                title={t('drive.fileMeta.move')}
                disabled={!isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onMove(file)
                }}
              />
            ) : null}
```

- [ ] **Step 2: Update `src/ui/FolderRow.tsx`**

Mirror the same change: add `onMove?: (folder: FolderItem) => void` to `Props`, include it in the destructure, update `hasMenu`, and insert a `<Menu.Item>` block in the same position. Use `t('drive.fileMeta.move')` and the same `folder-move-outline` icon. Same `disabled={!isOnline}` gate.

- [ ] **Step 3: Update `src/ui/FileRow.test.tsx`**

After the existing tests, add:

```tsx
  it('renders a Move… menu item when onMove is provided', () => {
    render(wrap(<FileRow file={file} onPress={() => {}} onMove={jest.fn()} />))
    expect(screen.getByLabelText('file actions')).toBeOnTheScreen()
  })

  it('calls onMove when the menu item is tapped', () => {
    const onMove = jest.fn()
    render(wrap(<FileRow file={file} onPress={() => {}} onMove={onMove} />))
    fireEvent.press(screen.getByLabelText('file actions'))
    fireEvent.press(screen.getByText('drive.fileMeta.move'))
    expect(onMove).toHaveBeenCalledWith(file)
  })
```

- [ ] **Step 4: Update `src/ui/FolderRow.test.tsx`**

Add similar tests at the end of the describe block. Use `screen.getByLabelText('folder actions')` and a `folder` fixture matching the existing shape (`{ _id, name }`).

If `FolderRow.test.tsx` doesn't exist (only `FileRow.test.tsx`), skip this step — but verify with `ls src/ui/FolderRow.test.tsx`.

- [ ] **Step 5: Run tests + tsc + lint**

```bash
npx jest src/ui/FileRow src/ui/FolderRow && npx tsc --noEmit && npx eslint src/ui/FileRow.tsx src/ui/FolderRow.tsx
```

Expected: all pass, baseline preserved.

- [ ] **Step 6: Commit**

```bash
git add src/ui/FileRow.tsx src/ui/FolderRow.tsx src/ui/FileRow.test.tsx src/ui/FolderRow.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add onMove prop to FileRow and FolderRow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire Move action from list screens (commit 5)

**Files:**
- Modify: `app/(drive)/files/[...path].tsx`
- Modify: `app/(drive)/recent.tsx`
- Modify: `app/(drive)/shared/[...path].tsx`
- Modify: `app/(drive)/shareddrives/[...path].tsx`

**Goal:** Each list screen pushes `/move/<ids>` from row 3-dot menus and (for the files screen) from a Move icon in the bulk action bar.

- [ ] **Step 1: Update `app/(drive)/files/[...path].tsx`**

In the FolderRow render in `renderItem`, after `onDelete`, add:

```tsx
          onMove={
            selection.isSelecting
              ? undefined
              : folder => router.push(`/move/${folder._id}`)
          }
```

In the FileRow render, after `onDelete`, add:

```tsx
          onMove={
            selection.isSelecting
              ? undefined
              : file => router.push(`/move/${file._id}`)
          }
```

In the AppBar `selection.actions` array (currently has only the delete icon), add a Move action **before** the delete entry:

```tsx
                actions: [
                  {
                    icon: 'folder-move-outline',
                    onPress: () => {
                      const ids = Array.from(selection.selectedIds).join(',')
                      router.push(`/move/${ids}`)
                    },
                    accessibilityLabel: t('drive.selection.move')
                  },
                  {
                    icon: 'trash-can-outline',
                    onPress: () => setBulkConfirmVisible(true),
                    accessibilityLabel: t('drive.fileMeta.delete'),
                    destructive: true
                  }
                ]
```

> Verify `useMultiSelect` exposes `selectedIds` as a `Set<string>`. If the field is named differently (e.g. `selection.ids`, or there's a `selection.toArray()`), use that instead. Check the existing usages in the file (e.g. `data.filter(d => selection.isSelected(d._id))` in `confirmBulkDelete`) — if `isSelected` is the only public API, build the array via `data.filter(d => selection.isSelected(d._id)).map(d => d._id)` inside `onPress`.

- [ ] **Step 2: Update `app/(drive)/recent.tsx`**

Add `onMove` to the FileRow render in `renderItem`:

```tsx
      onMove={file => router.push(`/move/${file._id}`)}
```

(Recent has no bulk action bar and no folders.)

- [ ] **Step 3: Update `app/(drive)/shared/[...path].tsx`**

Add `onMove` to both FolderRow and FileRow in `renderItem`, gated on `!selection.isSelecting` if a selection feature is present here (check first — if not, just pass unconditionally). Look at the existing `onShare` pattern in the same file as the reference.

- [ ] **Step 4: Update `app/(drive)/shareddrives/[...path].tsx`**

Mirror the same pattern. Shared drives may have the same `selection` flow as files; check the existing onShare prop and copy the conditional shape.

- [ ] **Step 5: Run all tests + tsc + lint**

```bash
npx jest && npx tsc --noEmit && npx eslint app/'(drive)'
```

Expected: baseline preserved. The TS check should pass for the new `/move/${file._id}` route since we declared it in Task 3.

- [ ] **Step 6: Commit**

```bash
git add app/'(drive)'/
git commit -m "$(cat <<'EOF'
feat(drive): wire Move action from list screens

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Move button in metadata modal (commit 6)

**Files:**
- Modify: `app/metadata/[fileId].tsx`
- Modify: `app/metadata/[fileId].test.tsx`

**Goal:** Add a "Move…" button in the metadata modal footer between Share and Rename. Tap calls `router.replace('/move/' + fileId)` (swap modal, no stacking).

- [ ] **Step 1: Locate the footer block in `app/metadata/[fileId].tsx`**

Find the JSX block where the existing buttons live (Open / Share / Rename / Delete / Close). Between the Share button and the Rename button, insert:

```tsx
          <Button
            mode="outlined"
            onPress={() => router.replace(`/move/${file._id}`)}
            icon="folder-move-outline"
            disabled={!isOnline}
          >
            {t('drive.fileMeta.move')}
          </Button>
```

`isOnline` is already in scope (from `useIsOnline`). `router` is already in scope (from `useRouter`). `file._id` is non-null at that point because the early-out `if (!file) return <ErrorState ... />` runs before this JSX.

- [ ] **Step 2: Add the test in `app/metadata/[fileId].test.tsx`**

After the existing tests, add:

```tsx
  it('calls router.replace with /move/<fileId> when Move is tapped', () => {
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('drive.fileMeta.move'))
    expect(replace).toHaveBeenCalledWith('/move/f1')
  })
```

(Adjust `replace` to whatever the existing test calls it — likely `replace` or `mockReplace`.)

- [ ] **Step 3: Run tests + tsc + lint**

```bash
npx jest app/metadata && npx tsc --noEmit && npx eslint app/metadata
```

Expected: PASS, baseline preserved.

- [ ] **Step 4: Commit**

```bash
git add app/metadata
git commit -m "$(cat <<'EOF'
feat(metadata): add Move button to metadata modal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Mark TODO entry as shipped (commit 7)

**Files:**
- Modify: `docs/TODO.md`

**Goal:** Remove the "Move files / folders" entry from the backlog since it's now shipped.

- [ ] **Step 1: Edit `docs/TODO.md`**

Find the section:

```markdown
- **Move files / folders inside the drive.** Long-press → "Move…" → folder picker → confirm. Requires a `moveEntry` helper (mirror twake-drive-web's `client.collection('io.cozy.files').updateAttributes(id, { dir_id })`) + a folder-picker UI. Multi-select integration too.
```

Delete the bullet entirely.

- [ ] **Step 2: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs(todo): move files/folders shipped, remove from backlog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Step 1: Run the full check**

```bash
npx jest && npx tsc --noEmit && npx eslint .
```

Expected: baseline preserved — 8 pre-existing test failures, 4 pre-existing TS errors, no lint errors on touched files.

- [ ] **Step 2: Manual smoke (iOS device or simulator)**

```bash
npx expo run:ios
```

Run through:
- [ ] Tap a file row 3-dot menu → "Move…" → page-sheet opens at the source folder. Drill into a subfolder. Tap "Move here". Modal closes, snackbar reads "File moved", list refreshes (the moved file disappears from the source).
- [ ] Same for a folder row.
- [ ] Multi-select 3 files via long-press → bulk action bar shows a Move icon (`folder-move-outline`) → tap → modal opens. Confirm. Snackbar reads "3 items moved".
- [ ] Tap "+ New folder" in the picker AppBar → input "Archive" → submit → picker auto-drills into the new "Archive" folder → "Move here" enabled → confirm → file in Archive.
- [ ] Open the metadata modal on a file → tap "Move…" → modal swaps to /move (no stacking visible). Confirm → returns to the list (not to metadata).
- [ ] Move `Report.pdf` into a folder that already contains `Report.pdf` → silent overwrite; verify the previous file is in the trash tab.
- [ ] Try to move a folder into one of its own subfolders → snackbar shows the generic error; modal stays open.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/move-files
gh pr create --base main --title "feat(drive): move files and folders" --body "$(cat <<'EOF'
## Summary
- Adds Move action surfaced from the row 3-dot menu, the multi-select bulk action bar (files screen), and the metadata modal footer
- New \`app/move/[ids].tsx\` page-sheet modal route hosts a \`FolderPicker\` (drill-in navigation with inline "+ New folder")
- New \`moveEntry\` helper wraps \`updateAttributes({ dir_id })\` with 409 conflict + force handling (stat → destroy → retry), mirroring twake-drive-web's \`executeMove\`
- Single + bulk supported; bulk moves are sequential to match the existing \`confirmBulkDelete\` pattern
- 412 ForbiddenDocMove (moving a folder into one of its descendants) surfaces as a generic error message — cozy-stack rejects, no client-side pre-check

## Test plan
- [ ] Jest: \`npx jest\` baseline preserved (same 8 pre-existing failures, no new ones)
- [ ] Move from row 3-dot → picker opens at source → drill in → Move here → list refreshes
- [ ] Multi-select → bulk Move icon → all selected items moved, snackbar count
- [ ] "+ New folder" inside the picker → auto-drill into it → Move here
- [ ] Move from inside metadata modal → router.replace swap, no stacking
- [ ] Conflict + force: existing file goes to trash, new file lands in destination
- [ ] Folder cycle (move into self/descendant) → generic error snackbar

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for the implementer

- **DRY**: Task 5 repeats the same pattern across 4 list screens. Get one right (start with `app/(drive)/files/[...path].tsx` since it's the only screen with the bulk action bar), then mechanically apply to the others.
- **YAGNI**: don't add Move support for Nextcloud / shared drives in this PR — they're explicitly out of scope. Don't add the "Annuler" snackbar for force=true overwrites either.
- **TDD**: tasks 1, 2, and 3 follow strict TDD (write test → red → implement → green). Tasks 4–6 are integration changes where new tests verify the new behavior alongside existing ones.
- **Frequent commits**: 7 atomic commits in this plan. Each commit must leave the app green relative to the pre-existing baseline.
- **No new test failures**: if a test starts failing after your change and it wasn't in the pre-existing list (`useAuth`, `createClient`, `getLinks`, `platformReactNative`), it's a real regression you introduced — fix it before committing.
