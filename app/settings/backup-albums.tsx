import React, { useEffect, useRef, useState } from 'react'
import { ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { InlineBanner } from '@/ui/InlineBanner'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { SettingsRow } from '@/ui/SettingsRow'
import { SettingsSection } from '@/ui/SettingsSection'
import { useSideInset } from '@/ui/useSideInset'
import { backupCore, type AlbumChoice, type PhoneAlbum } from '@/native/twakeDriveCore'

/** A tap moves an album from neutral to picked, to left out, back to neutral. */
const NEXT: Record<'none' | AlbumChoice, AlbumChoice | null> = {
  none: 'picked',
  picked: 'leftOut',
  leftOut: null
}

export default function BackupAlbumsScreen(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  const sideInset = useSideInset()
  const [albums, setAlbums] = useState<PhoneAlbum[] | null>(null)
  const [failed, setFailed] = useState(false)
  // Two taps before a render both read the latest choice, not the rendered one.
  const latest = useRef<PhoneAlbum[]>([])

  const show = (next: PhoneAlbum[]): void => {
    latest.current = next
    setAlbums(next)
  }

  const load = (): void => {
    const core = backupCore()
    if (!core) {
      setFailed(true)
      return
    }
    core
      .listAlbums()
      .then(next => {
        setFailed(false)
        show(next)
      })
      .catch(() => setFailed(true))
  }

  useEffect(load, [])

  const toggle = (id: string): void => {
    const album = latest.current.find(a => a.id === id)
    if (!album) return
    const choice = NEXT[album.choice ?? 'none']
    show(latest.current.map(a => (a.id === id ? { ...a, choice: choice ?? undefined } : a)))
    // What the core kept, if the choice could not be saved.
    backupCore()?.setAlbumChoice(id, choice).catch(load)
  }

  const picked = albums?.some(album => album.choice === 'picked') ?? false

  return (
    <ScreenContainer bottomInset>
      <AppBar sheet title={t('backup.albums.title')} onBack={() => router.back()} />
      <ScrollView style={{ marginHorizontal: sideInset }}>
        <InlineBanner
          message={t(picked ? 'backup.albums.somePicked' : 'backup.albums.nonePicked')}
          testID="backup-albums-rule"
        />
        {failed ? (
          <InlineBanner
            tone="error"
            message={t('backup.albums.error')}
            testID="backup-albums-error"
          />
        ) : null}
        <SettingsSection title={t('backup.albums.listTitle')}>
          {(albums ?? []).map(album => (
            <SettingsRow
              key={album.id}
              testID={`backup-album-${album.id}`}
              title={album.title}
              description={t(`backup.albums.${album.choice ?? 'neutral'}`, { count: album.count })}
              trailing={album.choice === 'picked' ? 'check' : undefined}
              onPress={() => toggle(album.id)}
            />
          ))}
        </SettingsSection>
      </ScrollView>
    </ScreenContainer>
  )
}
