import React, { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { DocumentAction, DocumentScreen } from '@/ui/DocumentScreen'
import { download } from '@/files/download'
import { useIsOnline } from '@/network/useIsOnline'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'
import {
  buildFileStreamSource,
  buildThumbnailUrl,
  getPreviewKind,
  StreamSource
} from '@/files/streamUrl'
import { openFileNatively } from '@/files/openFile'
import { DocumentViewer } from '@/viewer/DocumentViewer'
import { localViewerFor } from '@/viewer/documentKind'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { useOfflineState } from '@/offline/useOfflineState'
import { AudioPreview } from '@/preview/AudioPreview'
import { ImagePreview } from '@/preview/ImagePreview'
import { PdfPreview } from '@/preview/PdfPreview'
import { TextPreview } from '@/preview/TextPreview'
import { VideoPreview } from '@/preview/VideoPreview'
import { cozyTokens } from '@/ui/theme'

export default function PreviewScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const client = useClient()
  const { fileId, driveId } = useLocalSearchParams<{ fileId: string; driveId?: string }>()
  const [externalError, setExternalError] = useState<string | null>(null)
  const isOnline = useIsOnline()
  const fallbackTriggered = useRef(false)

  // A file from a shared drive lives in that drive's own database, which the
  // driveId option is what reaches.
  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: driveId
      ? `${fileByIdQueryAs(fileId ?? '')}/drive/${driveId}`
      : fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId,
    ...(driveId ? { driveId } : {})
  })
  const lookupData = fileLookup.data
  const file = (Array.isArray(lookupData) ? lookupData[0] : lookupData) as
    | FileQueryResult
    | null
    | undefined

  // Re-renders when the offline state of this file changes (so a download
  // completing while the screen is open swaps the source to the local blob).
  const offlineEntry = useOfflineState(fileId ?? undefined)

  const thumbnailUrl = useMemo(
    () => (client && file?.links ? buildThumbnailUrl(client, file.links, 'large') : null),
    [client, file?.links]
  )

  const kind = getPreviewKind(file ?? null)

  // AVPlayer (video) and the audio player rely on the file URL's extension
  // to choose the right codec. The persistent offline blob is stored as
  // `offline/{fileId}` with no extension, so for those kinds we eagerly
  // copy the blob to the OS cache under `{fileId}-{name}` and serve from
  // there. Image / PDF / text don't need this — they sniff the content.
  const [pinnedAliasPath, setPinnedAliasPath] = useState<string | null>(null)
  useEffect(() => {
    setPinnedAliasPath(null)
    if (!fileId || !file) return
    if (kind !== 'video' && kind !== 'audio') return
    if (!OfflineFilesStore.isPinnedAndDownloaded(fileId)) return
    const cacheDir = FileSystem.cacheDirectory
    if (!cacheDir) return
    let cancelled = false
    void (async () => {
      try {
        const dir = `${cacheDir}twake-drive/`
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
        const sanitized = file.name.replace(/[/\\?%*:|"<>]/g, '_')
        const target = `${dir}${fileId}-${sanitized}`
        const info = await FileSystem.getInfoAsync(target)
        if (!info.exists) {
          await FileSystem.copyAsync({
            from: FileSystemRepo.localPath(fileId),
            to: target
          })
        }
        if (!cancelled) setPinnedAliasPath(target)
      } catch (e) {
        console.error('[PreviewScreen] pinned alias copy failed', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fileId, file, kind])

  const source = useMemo<StreamSource | null>(() => {
    if (!fileId) return null
    // Prefer the local blob when available: works offline, no auth, instant.
    if (OfflineFilesStore.isPinnedAndDownloaded(fileId)) {
      // Video / audio need the extension-bearing alias to start decoding;
      // wait for the copy to land before returning anything (preview screen
      // shows LoadingState meanwhile).
      if (kind === 'video' || kind === 'audio') {
        if (!pinnedAliasPath) return null
        return { uri: pinnedAliasPath, headers: {} }
      }
      return { uri: FileSystemRepo.localPath(fileId), headers: {} }
    }
    if (!client) return null
    try {
      return buildFileStreamSource(client, fileId, driveId)
    } catch {
      return null
    }
  }, [client, driveId, fileId, kind, pinnedAliasPath, offlineEntry?.state])

  // Unsupported types: download then native intent, then back.
  useEffect(() => {
    if (!client || !file || kind !== 'unsupported' || fallbackTriggered.current) return
    if (localViewerFor(file)) return
    fallbackTriggered.current = true
    void (async () => {
      try {
        await openFileNatively(client, { _id: file._id, name: file.name, mime: file.mime }, driveId)
        router.back()
      } catch (e) {
        console.error('[PreviewScreen] native fallback failed', e)
        setExternalError((e as Error).message ?? t('drive.preview.loadFailed'))
        fallbackTriggered.current = false
      }
    })()
  }, [client, file, kind, router, t])

  // A lookup that ends without a document — a failed fetch, or a file deleted
  // server-side — must surface an error. Testing only `loading` + "no data yet"
  // left those two cases indistinguishable from a pending fetch, so the screen
  // span on the spinner forever. Mirrors metadata/[fileId].tsx.
  const lookupFailed =
    fileLookup.fetchStatus === 'failed' || (fileLookup.fetchStatus === 'loaded' && !file)
  const isLoadingFile = !lookupFailed && (fileLookup.fetchStatus === 'loading' || !file)
  const title = file?.name ?? t('drive.preview.title')

  const renderViewer = (): React.ReactElement => {
    // Types with a local viewer are read from the bytes the app has, so they
    // open with no network and never touch the web editor to be read.
    if (file && localViewerFor(file)) {
      return (
        <DocumentViewer
          file={{ _id: file._id, _rev: file._rev, name: file.name, mime: file.mime }}
          driveId={driveId}
        />
      )
    }
    if (!source) return <LoadingState />
    switch (kind) {
      case 'pdf':
        return <PdfPreview source={source} thumbnailUrl={thumbnailUrl} />
      case 'image':
        return <ImagePreview source={source} thumbnailUrl={thumbnailUrl} />
      case 'video':
        return <VideoPreview fileId={fileId!} source={source} />
      case 'audio':
        return (
          <AudioPreview
            fileId={fileId!}
            source={source}
            name={file?.name ?? ''}
            mime={file?.mime}
            driveId={driveId}
          />
        )
      case 'text':
        return <TextPreview source={source} />
      case 'unsupported':
      default:
        return externalError ? (
          <ErrorState
            message={externalError}
            onRetry={() => {
              setExternalError(null)
              fallbackTriggered.current = false
            }}
          />
        ) : (
          <View style={styles.fallbackPanel}>
            <LoadingState />
          </View>
        )
    }
  }

  // A photo, a video or a PDF is read full-bleed on the dark canvas; every
  // other kind is a page, and reads better under the app bar.
  const isImmersive = kind === 'image' || kind === 'video' || kind === 'pdf'

  const actions: DocumentAction[] = !file
    ? []
    : [
        {
          icon: 'shareExternal',
          label: t('drive.fileMeta.share'),
          disabled: !isOnline,
          testID: 'document-share',
          onPress: () => router.push(`/share/${file._id}`)
        },
        {
          icon: 'download',
          label: t('drive.fileMeta.download'),
          disabled: !isOnline || !client,
          testID: 'document-download',
          onPress: () => {
            if (!client) return
            void download(
              client,
              { _id: file._id, name: file.name, mime: file.mime },
              driveId
            ).catch(e => {
              if ((e as Error).name === 'DownloadCancelledError') return
              setExternalError((e as Error).message ?? t('drive.preview.loadFailed'))
            })
          }
        },
        {
          icon: 'info',
          label: t('drive.fileMeta.info'),
          testID: 'document-info',
          onPress: () => router.push(`/metadata/${file._id}`)
        }
      ]

  return (
    <DocumentScreen
      title={title}
      onBack={() => router.back()}
      chrome={isImmersive ? 'immersive' : 'bar'}
      actions={actions}
    >
      {isLoadingFile ? (
        <LoadingState />
      ) : lookupFailed ? (
        <ErrorState
          message={t('drive.preview.loadFailed')}
          onRetry={() => void fileLookup.fetch()}
        />
      ) : (
        renderViewer()
      )}
      {externalError ? <Text style={styles.actionError}>{externalError}</Text> : null}
    </DocumentScreen>
  )
}

const styles = StyleSheet.create({
  fallbackPanel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionError: {
    color: cozyTokens.canvas.error,
    textAlign: 'center',
    marginTop: cozyTokens.spacing.xs,
    fontSize: 12
  }
})
