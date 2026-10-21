import React, { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { AudioModule, AudioPlayer, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { Button, IconButton, ProgressBar, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { StreamSource } from '@/files/streamUrl'
import { openFileNatively } from '@/files/openFile'
import { surfaceOpenError } from '@/files/errors'
import { isUnsupportedAudio } from '@/files/audioSupport'
import { cozyTokens } from '@/ui/theme'
import { LoadingOverlay } from './PreviewOverlays'

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  fileId: string
  source: StreamSource
  name: string
  mime: string | undefined
  driveId?: string
}

const UnsupportedAudio = ({
  fileId,
  name,
  mime,
  driveId
}: Omit<Props, 'source'>): React.ReactElement => {
  const theme = useTheme()
  const { t } = useTranslation()
  const client = useClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presented, setPresented] = useState(false)
  const onOpenExternal = async (): Promise<void> => {
    if (!client) return
    setBusy(true)
    setError(null)
    setPresented(false)
    try {
      await openFileNatively(client, { _id: fileId, name, mime }, driveId)
      // FileViewer (UIDocumentInteractionController on iOS) resolves
      // silently even when no third-party app can handle the file. We
      // don't auto-dismiss the modal: show a hint instead so the user
      // knows whether a sheet actually appeared.
      setPresented(true)
    } catch (e) {
      surfaceOpenError(e, setError, t, 'AudioPreview')
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.unsupportedCard}>
        <CozyIcon name="info" size={56} color={cozyTokens.canvas.on} />
        <Text style={styles.title} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.unsupportedMessage}>{t('drive.audio.unsupportedCodec')}</Text>
        <Button
          mode="contained"
          icon="open-in-app"
          loading={busy}
          disabled={busy || !client}
          onPress={() => void onOpenExternal()}
        >
          {t('drive.audio.openWith')}
        </Button>
        {error ? (
          <Text style={[styles.unsupportedError, { color: theme.colors.error }]}>{error}</Text>
        ) : null}
        {presented ? (
          <Text style={styles.unsupportedHint}>{t('drive.audio.noAppHint')}</Text>
        ) : null}
      </View>
    </View>
  )
}

const SupportedAudioPlayer = ({
  source,
  name
}: {
  source: StreamSource
  name: string
}): React.ReactElement => {
  const { t } = useTranslation()
  const player = useAudioPlayer({ uri: source.uri, headers: source.headers })
  const status = useAudioPlayerStatus(player)
  // Releasing the player, on unmount or when the source changes, clears its session.
  const registered = useRef<AudioPlayer | null>(null)
  const ready = status.isLoaded
  const duration = ready ? status.duration : 0
  const position = ready ? status.currentTime : 0
  const onPlayPause = async (): Promise<void> => {
    if (status.playing) {
      player.pause()
      return
    }
    // A finished player stays at its end, and play() from there ends at once.
    if (status.didJustFinish || (duration > 0 && position >= duration)) await player.seekTo(0)
    if (registered.current !== player) {
      registered.current = player
      player.setActiveForLockScreen(
        true,
        { title: name },
        { showSeekBackward: true, showSeekForward: true }
      )
    }
    // Keep audio playing when the app is backgrounded or the device is silenced.
    // On iOS expo-audio defaults to mixWithOthers, and a mixing session never
    // becomes the Now Playing app. Set before every play: expo-video re-sets
    // the shared session whenever a video starts or stops.
    await AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'doNotMix'
    }).catch(e => console.warn('[AudioPreview] audio mode not applied', e))
    player.play()
  }
  return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.card}>
        <IconButton
          icon={status.playing ? 'pause' : 'play'}
          size={56}
          mode="contained"
          disabled={!ready}
          accessibilityLabel={status.playing ? t('a11y.pause') : t('a11y.play')}
          testID="audio-play-pause"
          onPress={() => void onPlayPause()}
        />
        <Text style={styles.title} numberOfLines={2}>
          {name}
        </Text>
        <View style={styles.progressRow}>
          <Text style={styles.time}>{formatTime(position)}</Text>
          <View style={styles.bar}>
            <ProgressBar
              accessibilityLabel={t('a11y.playbackPosition')}
              testID="audio-progress"
              progress={duration > 0 ? position / duration : 0}
              color={cozyTokens.canvas.on}
            />
          </View>
          <Text style={styles.time}>{formatTime(duration)}</Text>
        </View>
      </View>
      {!ready ? <LoadingOverlay /> : null}
    </View>
  )
}

export const AudioPreview = ({
  fileId,
  source,
  name,
  mime,
  driveId
}: Props): React.ReactElement => {
  if (isUnsupportedAudio(mime, name)) {
    return <UnsupportedAudio fileId={fileId} name={name} mime={mime} driveId={driveId} />
  }
  return <SupportedAudioPlayer source={source} name={name} />
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', padding: cozyTokens.spacing.xl, gap: cozyTokens.spacing.md },
  unsupportedCard: {
    alignItems: 'center',
    padding: cozyTokens.spacing.xl,
    gap: cozyTokens.spacing.md,
    maxWidth: 320
  },
  unsupportedMessage: {
    color: cozyTokens.canvas.on,
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.85
  },
  unsupportedHint: {
    color: cozyTokens.canvas.on,
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.65
  },
  unsupportedError: { fontSize: 12, textAlign: 'center' },
  title: { color: cozyTokens.canvas.on, fontSize: 16, textAlign: 'center', maxWidth: 280 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cozyTokens.spacing.sm,
    width: 280
  },
  bar: { flex: 1 },
  time: { color: cozyTokens.canvas.on, fontVariant: ['tabular-nums'], fontSize: 12 }
})
