import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import { FAB } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { CreateActionName, createActionNames } from './createActions'
import { CreatedEntry, useCreateHandlers } from './useCreateHandlers'

import { cozyTokens } from '@/ui/theme'
import { CozyIcon } from '@/ui/icons/CozyIcon'
import { FileTypeIcon } from '@/ui/icons/FileTypeIcon'
import { CreateFolderDialog } from '@/ui/CreateFolderDialog'
import { CreatableFileClass, CreateOfficeFileDialog } from '@/ui/CreateOfficeFileDialog'
import { CreateShortcutDialog } from '@/ui/CreateShortcutDialog'
import { useFlag } from '@/client/useFlag'
import { OFFICE_FLAGS, officeCreationEnabledFrom } from '@/viewer/viewerFlags'
import { useIsOnline } from '@/network/useIsOnline'

interface Props {
  /** Directory the new document lands in. */
  dirId: string
  /** Set when the directory is browsed through `/sharings/drives/<id>`: every
   *  create is then scoped to that drive instead of our own instance. */
  driveId?: string
  /** Whether the current member may write here — see `hasWriteAccess`. */
  canWrite: boolean
  notify: (message: string) => void
  /** Screens that hold their listing in local state rather than in a cozy
   *  query refresh it from here; the store-backed ones do not need it. */
  onCreated?: (created?: CreatedEntry) => void
  /** Hidden while a multi-selection is running, as the FAB would overlap it. */
  hidden?: boolean
}

type IconProps = { size: number; color?: string }

// Same illustrations as the "New" menu of twake-drive web: the cozy-ui file
// type icon of what the entry creates, not a monochrome glyph.
const ICONS: Record<CreateActionName, (p: IconProps) => React.ReactElement> = {
  folder: p => <FileTypeIcon icon="folder" size={p.size} />,
  note: p => <FileTypeIcon icon="note" size={p.size} />,
  docs: p => <FileTypeIcon icon="docs" size={p.size} />,
  text: p => <FileTypeIcon icon="text" size={p.size} />,
  sheet: p => <FileTypeIcon icon="sheet" size={p.size} />,
  slide: p => <FileTypeIcon icon="slide" size={p.size} />,
  excalidraw: p => <CozyIcon name="excalidraw" size={p.size} color={p.color} />,
  shortcut: p => <CozyIcon name="deviceBrowser" size={p.size} color={p.color} />
}

const LABELS: Record<CreateActionName, string> = {
  folder: 'drive.createMenu.folder',
  note: 'drive.createMenu.note',
  docs: 'drive.createMenu.docs',
  text: 'drive.createMenu.text',
  sheet: 'drive.createMenu.sheet',
  slide: 'drive.createMenu.slide',
  excalidraw: 'drive.createMenu.excalidraw',
  shortcut: 'drive.createMenu.shortcut'
}

export const CreateMenu = ({
  dirId,
  driveId,
  canWrite,
  notify,
  onCreated,
  hidden = false
}: Props): React.ReactElement | null => {
  const { t } = useTranslation()
  const isOnline = useIsOnline()

  const [fabOpen, setFabOpen] = useState(false)
  const [createFolderVisible, setCreateFolderVisible] = useState(false)
  const [createShortcutVisible, setCreateShortcutVisible] = useState(false)
  const [creatingClass, setCreatingClass] = useState<CreatableFileClass | null>(null)

  const docsEnabled = !!useFlag('drive.lasuitedocs.enabled')
  const officeEnabled = officeCreationEnabledFrom({
    touchScreen: useFlag(OFFICE_FLAGS.touchScreen),
    legacy: useFlag(OFFICE_FLAGS.legacy),
    readOnly: useFlag(OFFICE_FLAGS.touchScreenReadOnly),
    write: useFlag(OFFICE_FLAGS.write)
  })
  const excalidrawEnabled = !!useFlag('drive.excalidraw.enabled')

  const handlers = useCreateHandlers({ dirId, driveId, notify, onCreated })

  const handleCreateFolder = async (name: string): Promise<void> => {
    await handlers.createFolderNamed(name)
    setCreateFolderVisible(false)
  }

  const handleCreateOffice = async (name: string): Promise<void> => {
    if (!creatingClass) return
    await handlers.createOfficeNamed(creatingClass, name)
    setCreatingClass(null)
  }

  const handleCreateShortcut = async (name: string, url: string): Promise<void> => {
    await handlers.createShortcutNamed(name, url)
    setCreateShortcutVisible(false)
  }

  const onPressFor = (name: CreateActionName): (() => void) => {
    switch (name) {
      case 'folder':
        return () => setCreateFolderVisible(true)
      case 'note':
        return () => void handlers.createNote()
      case 'docs':
        return () => void handlers.createDocs()
      case 'shortcut':
        return () => setCreateShortcutVisible(true)
      default:
        return () => setCreatingClass(name)
    }
  }

  if (!canWrite) return null

  const actions = createActionNames({
    driveId,
    docsEnabled,
    officeEnabled,
    excalidrawEnabled
  }).map(name => {
    return {
      icon: ICONS[name],
      label: t(LABELS[name]),
      accessibilityLabel: t(LABELS[name]),
      testID: `create-${name}`,
      onPress: onPressFor(name)
    }
  })

  return (
    <>
      <FAB.Group
        style={styles.fabGroup}
        fabStyle={styles.fab}
        testID="drive-fab"
        open={fabOpen}
        visible={!hidden && isOnline}
        icon={fabOpen ? 'close' : 'plus'}
        // The app's main action carries only an icon: without a label a screen
        // reader announces it as "Button".
        accessibilityLabel={t(fabOpen ? 'common.close' : 'drive.createMenu.open')}
        actions={actions}
        onStateChange={({ open }) => setFabOpen(open)}
      />
      <CreateFolderDialog
        visible={createFolderVisible}
        onDismiss={() => setCreateFolderVisible(false)}
        onSubmit={handleCreateFolder}
      />
      <CreateOfficeFileDialog
        visible={creatingClass !== null}
        fileClass={creatingClass}
        onDismiss={() => setCreatingClass(null)}
        onSubmit={handleCreateOffice}
      />
      <CreateShortcutDialog
        visible={createShortcutVisible}
        onDismiss={() => setCreateShortcutVisible(false)}
        onSubmit={handleCreateShortcut}
      />
    </>
  )
}

const styles = StyleSheet.create({
  fabGroup: { zIndex: cozyTokens.zIndex.fab },
  // Same gutter as the list and the bar: the right edge lines up with the
  // content, and the button sits one gutter above the bottom navigation.
  fab: { marginHorizontal: cozyTokens.spacing.md, marginBottom: cozyTokens.spacing.md }
})
