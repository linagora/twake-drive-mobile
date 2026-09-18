import React from 'react'
import { useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { FileListView } from '@/ui/FileListView'
import { FileRow } from '@/ui/FileRow'
import { useAuth } from '@/auth/useAuth'
import { recentQuery, recentQueryAs, FileQueryResult, HIDDEN_ROOT_DIR_IDS } from '@/client/queries'
import { useFileRowActions } from '@/files/useFileRowActions'

export default function RecentScreen() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const query = useQuery(recentQuery(), { as: recentQueryAs })
  const actions = useFileRowActions({ screen: 'RecentScreen' })

  // recentQuery is index-backed on updated_at only (no partial index — see its
  // definition); apply the file / not-trashed / not-hidden-dir filter here.
  //
  // Also drop docs whose updated_at is in the FUTURE (beyond a 24h clock-skew
  // tolerance): a file can't be "recently modified" in the future, and such
  // migration/clock-skew artifacts otherwise dominate the updated_at-desc sort
  // (they render as "dans plus de 14 ans"). Dedup by _id defensively.
  const nowMs = Date.now()
  const seenIds = new Set<string>()
  const data = ((query.data as FileQueryResult[] | null | undefined) ?? [])
    .filter(d => d.type === 'file' && !d.trashed && !HIDDEN_ROOT_DIR_IDS.includes(d.dir_id ?? ''))
    .filter(d => !d.updated_at || new Date(d.updated_at).getTime() <= nowMs + 86_400_000)
    .filter(d => {
      if (seenIds.has(d._id)) return false
      seenIds.add(d._id)
      return true
    })

  return (
    <ScreenContainer>
      <AppBar title={t('drive.recent')} onLogout={logout} />
      <FileListView
        items={data}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <FileRow file={{ ...item, size: item.size ?? null }} {...actions.fileProps(item)} />
        )}
        loading={query.fetchStatus === 'loading'}
        error={query.fetchStatus === 'failed' ? query.lastError : undefined}
        onRetry={() => query.fetch()}
        refreshing={query.fetchStatus === 'loading'}
        onRefresh={() => query.fetch()}
        // The filters above drop folders and trashed rows, so a page can yield
        // few usable items: keep paging rather than capping the list.
        onEndReached={() => {
          void query.fetchMore?.()
        }}
        emptyMessage="drive.emptyRecent"
      />
      {actions.dialogs}
    </ScreenContainer>
  )
}
