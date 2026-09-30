import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Button,
  Divider,
  IconButton,
  SegmentedButtons,
  Snackbar,
  Switch,
  Text,
  TextInput,
  useTheme
} from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'
import * as Clipboard from 'expo-clipboard'

import { useFlag } from '@/client/useFlag'
import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'
import { filterContactSuggestions, findContactIdByEmail } from '@/files/contactSuggestions'
import { useReachableContacts } from '@/files/useReachableContacts'
import {
  LinkEditingRights,
  absoluteMemberIndex,
  addRecipient,
  buildPublicLinkUrl,
  createPublicLink,
  createSharingForFile,
  findSharingForFile,
  getLinkEditingRights,
  getRecipients,
  revokePublicLink,
  revokeSharingMember
} from '@/files/sharing'
import { RecipientView, fetchEffectiveRecipients } from '@/files/effectiveRecipients'
import { FEDERATED_SHARED_FOLDER_FLAG, SHARED_DRIVE_FLAG } from '@/files/sharingFlags'
import { useFileSharing, useRefreshSharings } from '@/sharing/SharingProvider'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FileThumbnail } from '@/ui/FileThumbnail'

interface ShareSheetFile {
  _id: string
  name: string
  type?: 'file' | 'directory'
  mime?: string
  class?: string
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

const truncateMiddle = (s: string, max = 56): string => {
  if (s.length <= max) return s
  const head = Math.ceil((max - 3) / 2)
  const tail = Math.floor((max - 3) / 2)
  return `${s.slice(0, head)}...${s.slice(-tail)}`
}

export default function ShareRoute() {
  const router = useRouter()
  const theme = useTheme()
  const { t } = useTranslation()
  const client = useClient()
  const refreshSharings = useRefreshSharings()
  const isOnline = useIsOnline()
  const { fileId, driveId } = useLocalSearchParams<{ fileId: string; driveId?: string }>()

  // Flags mirrored from twake-drive web's ShareFileView / ShareDisplayedFolderView:
  // - sharing.generate-link-button.enabled gates the public link toggle. The web
  //   default is "visible": cozy-sharing's modal only HIDES the button when the
  //   flag is explicitly false. We mirror that — null/undefined/true → show,
  //   false → hide.
  // - sharing.auto-open-settings.enabled is a no-op here for now since the mobile
  //   sheet doesn't have an "advanced settings" panel; recorded for parity.
  const generateLinkFlag = useFlag('sharing.generate-link-button.enabled')
  const generateLinkEnabled = generateLinkFlag !== false
  // Sharing with people by email belongs to the shared drive feature, which the
  // instance turns on explicitly. Default off: an instance that never set the
  // flag does not get it.
  const emailSharingEnabled = useFlag(SHARED_DRIVE_FLAG) === true
  const federatedSharing = useFlag(FEDERATED_SHARED_FOLDER_FLAG) === true
  // TODO: when an advanced-settings panel is added, gate it on this flag too.
  // const autoOpenSettingsEnabled = !!useFlag('sharing.auto-open-settings.enabled')

  // A document from a shared drive lives in that drive's own database, which the
  // driveId option is what reaches.
  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: driveId
      ? `${fileByIdQueryAs(fileId ?? '')}/drive/${driveId}`
      : fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId,
    ...(driveId ? { driveId } : {})
  })
  const lookupData = fileLookup.data
  const fileFromQuery = (Array.isArray(lookupData) ? lookupData[0] : lookupData) as
    | FileQueryResult
    | null
    | undefined
  const file: ShareSheetFile | null = fileFromQuery
    ? {
        _id: fileFromQuery._id,
        name: fileFromQuery.name,
        type: fileFromQuery.type,
        mime: fileFromQuery.mime,
        class: fileFromQuery.class,
        links: fileFromQuery.links
      }
    : null

  const [mutating, setMutating] = useState(false)
  const [linkMutating, setLinkMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snack, setSnack] = useState<string | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [readOnlyInput, setReadOnlyInput] = useState(true)
  // Editor/Viewer choice for the public link. Mirrors twake-drive web's
  // ShareRestrictionModal/BoxEditingRights. Defaults to readOnly to match the
  // web default; kept in sync with `linkPermission` via the effect below so
  // re-opening the sheet on a file with an existing editor link reflects it.
  const [editingRights, setEditingRights] = useState<LinkEditingRights>('readOnly')

  // Read sharing + link from the global SharingProvider — no local fetch.
  // The provider has already fetched both once at drive layout mount, and
  // refreshSharings() invalidates it after each mutation here.
  const { loaded: contextLoaded, entry } = useFileSharing(file?._id)
  const sharing = entry?.sharing ?? null
  const linkPermission = entry?.linkPermission ?? null
  // Only the very first session-open before the provider has resolved should
  // show a placeholder. Subsequent opens hit the warm context and are instant.
  const initialLoading = !contextLoaded && !entry

  // Federated mode reads the access a document effectively has, inherited
  // access included, instead of one sharing's members.
  const [effectiveRecipients, setEffectiveRecipients] = useState<RecipientView[]>([])
  const [recipientsTick, setRecipientsTick] = useState(0)

  useEffect(() => {
    if (!federatedSharing || !client || !fileId) return
    let cancelled = false
    void fetchEffectiveRecipients(client, fileId, driveId)
      .then(list => {
        if (!cancelled) setEffectiveRecipients(list)
      })
      .catch(e => console.error('[ShareRoute] effective recipients failed', e))
    return () => {
      cancelled = true
    }
  }, [client, driveId, federatedSharing, fileId, recipientsTick])

  const refreshRecipients = useCallback(async (): Promise<void> => {
    setRecipientsTick(tick => tick + 1)
    await refreshSharings()
  }, [refreshSharings])

  const stackUri = client?.getStackClient()?.uri as string | undefined
  const linkUrl = linkPermission && stackUri ? buildPublicLinkUrl(stackUri, linkPermission) : null

  // Re-sync the segmented control whenever the loaded permission changes:
  // - opening the sheet on a fresh file → resets to 'readOnly'
  // - opening on a file that already has an editor link → starts at 'write'
  // - after a successful swap (revoke+recreate) refreshSharings updates
  //   linkPermission, which lands us back here in the matching state
  useEffect(() => {
    setEditingRights(getLinkEditingRights(linkPermission))
  }, [linkPermission])

  const close = useCallback((): void => {
    if (router.canGoBack()) router.back()
  }, [router])

  const onToggleLink = async (next: boolean): Promise<void> => {
    if (!requireOnline(isOnline, setSnack, t)) return
    if (!client || !file || linkMutating) return
    setLinkMutating(true)
    setMutating(true)
    setError(null)
    try {
      if (next) {
        await createPublicLink(client, file, editingRights)
      } else {
        await revokePublicLink(client, file)
      }
      await refreshSharings()
    } catch (e) {
      console.error('[ShareRoute] toggle link failed', e)
      setError(t('drive.share.errorMutate'))
    } finally {
      setLinkMutating(false)
      setMutating(false)
    }
  }

  const onChangeEditingRights = async (next: LinkEditingRights): Promise<void> => {
    if (next === editingRights) return
    // Always echo the local state immediately so the segmented control feels
    // responsive even when the link doesn't yet exist.
    setEditingRights(next)
    if (!requireOnline(isOnline, setSnack, t)) return
    if (!linkPermission || !client || !file) return // local-only change before link exists
    if (linkMutating) return
    // Existing link: swap rights via revoke + recreate. This changes the
    // public URL — the simplest correct path until cozy-stack exposes a way
    // to mutate `attributes.permissions[*].verbs` in place.
    // TODO: replace with PermissionCollection.add/destroy verbs once available
    //       to avoid invalidating the existing sharecode.
    setLinkMutating(true)
    setMutating(true)
    setError(null)
    try {
      await revokePublicLink(client, file)
      await createPublicLink(client, file, next)
      await refreshSharings()
    } catch (e) {
      console.error('[ShareRoute] swap link rights failed', e)
      setError(t('drive.share.errorMutate'))
      // Revert the local state since the swap failed; the effect on
      // linkPermission will re-confirm but doing it here avoids a flash.
      setEditingRights(getLinkEditingRights(linkPermission))
    } finally {
      setLinkMutating(false)
      setMutating(false)
    }
  }

  const onCopyLink = async (): Promise<void> => {
    if (!linkUrl) return
    try {
      await Clipboard.setStringAsync(linkUrl)
      setSnack(t('drive.share.linkCopied'))
    } catch (e) {
      console.error('[ShareRoute] copy failed', e)
      setError(t('drive.share.errorMutate'))
    }
  }

  const onSubmitRecipient = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnack, t)) return
    const email = emailInput.trim()
    if (!client || !file || !email || mutating) return
    setMutating(true)
    setError(null)
    try {
      // Reuse the recipient's existing address-book contact when we have it
      // (picked from the autocomplete, or matching a reachable contact by
      // email) instead of minting a throwaway contact the stack can't yet
      // resolve — see findContactIdByEmail.
      const existingContactId = findContactIdByEmail(contacts, email)
      // A document inside a shared drive has no sharing of its own: the
      // drive's is what carries its recipients.
      const target =
        sharing ?? (driveId ? await findSharingForFile(client, file._id, driveId) : null)
      if (target) {
        await addRecipient(client, target, email, readOnlyInput, existingContactId)
      } else {
        await createSharingForFile(client, file, email, readOnlyInput, existingContactId, {
          sharedDrive: federatedSharing
        })
      }
      setEmailInput('')
      setShowAddForm(false)
      await refreshRecipients()
    } catch (e) {
      console.error('[ShareRoute] add recipient failed', e)
      setError(t('drive.share.errorMutate'))
    } finally {
      setMutating(false)
    }
  }

  const onRemoveRecipient = async (recipient: RecipientView): Promise<void> => {
    if (!requireOnline(isOnline, setSnack, t)) return
    if (!client || !file || mutating) return
    if (!recipient.sharingId || recipient.memberIndex === undefined) return
    setMutating(true)
    setError(null)
    try {
      await revokeSharingMember(client, recipient.sharingId, recipient.memberIndex)
      await refreshRecipients()
    } catch (e) {
      console.error('[ShareRoute] revoke recipient failed', e)
      setError(t('drive.share.errorMutate'))
    } finally {
      setMutating(false)
    }
  }

  // One shape for both modes: a member is reachable at its index in the sharing
  // we hold, an effective recipient carries the sharing the stack picked for it.
  const recipientViews = useMemo<RecipientView[]>(
    () =>
      federatedSharing
        ? effectiveRecipients
        : getRecipients(sharing).map((member, index) => ({
            key: `${member.email ?? member.name ?? 'recipient'}-${index}`,
            name: member.name ?? member.public_name,
            email: member.email,
            instance: member.instance,
            status: member.status,
            readOnly: member.read_only === true,
            sharingId: sharing?._id,
            memberIndex: sharing ? absoluteMemberIndex(sharing, index) : undefined,
            manageable: true
          })),
    [effectiveRecipients, federatedSharing, sharing]
  )

  // Contact autocomplete: only fetch when the add form is visible. Mirrors
  // cozy-sharing's web ShareAutosuggest — client-side filtering of the
  // reachable contacts collection.
  // Fetch the recipient autocomplete list from the stack (not local Pouch) —
  // see useReachableContacts for why.
  const { contacts, loading: contactsLoading } = useReachableContacts(showAddForm)
  const excludeEmails = useMemo(
    () => recipientViews.map(r => r.email).filter((e): e is string => !!e),
    [recipientViews]
  )
  const suggestions = useMemo(
    () => filterContactSuggestions(contacts, emailInput, excludeEmails),
    [contacts, emailInput, excludeEmails]
  )

  const statusLabel = (status: string): string => {
    switch (status) {
      case 'pending':
      case 'mail-not-sent':
      case 'seen':
        return t('drive.share.statusPending')
      case 'ready':
        return t('drive.share.statusReady')
      case 'revoked':
        return t('drive.share.statusRevoked')
      default:
        return status
    }
  }

  if (fileLookup.fetchStatus === 'loading' && !file) {
    return (
      <ScreenContainer sheet>
        <LoadingState />
      </ScreenContainer>
    )
  }
  if (!file) {
    return (
      <ScreenContainer sheet>
        <ErrorState message={t('drive.preview.loadFailed')} onRetry={() => fileLookup.fetch()} />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer sheet>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <FileThumbnail file={file} size={64} />
          <Text variant="titleMedium" style={styles.name} numberOfLines={2}>
            {file.name}
          </Text>
        </View>
        <Divider />

        {initialLoading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator animating />
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
            <Button mode="text" onPress={() => refreshSharings()}>
              {t('common.retry')}
            </Button>
          </View>
        ) : null}

        {/* Public link section — gated by sharing.generate-link-button.enabled */}
        {generateLinkEnabled ? (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text variant="titleSmall">{t('drive.share.linkTitle')}</Text>
                <View style={styles.linkSwitchSlot}>
                  {linkMutating ? (
                    <ActivityIndicator animating />
                  ) : (
                    <Switch
                      value={linkPermission !== null}
                      onValueChange={onToggleLink}
                      disabled={initialLoading}
                    />
                  )}
                </View>
              </View>
              <View style={styles.editingRightsRow}>
                <SegmentedButtons
                  value={editingRights}
                  onValueChange={v => void onChangeEditingRights(v as LinkEditingRights)}
                  density="small"
                  buttons={[
                    {
                      value: 'readOnly',
                      label: t('drive.share.linkRightsReader'),
                      icon: 'eye-outline',
                      disabled: linkMutating || initialLoading,
                      accessibilityLabel: t('drive.share.linkRightsReader')
                    },
                    {
                      value: 'write',
                      label: t('drive.share.linkRightsEditor'),
                      icon: 'pencil-outline',
                      disabled: linkMutating || initialLoading,
                      accessibilityLabel: t('drive.share.linkRightsEditor')
                    }
                  ]}
                />
              </View>
              {linkPermission ? (
                <>
                  <Text variant="bodySmall" style={styles.sectionHint}>
                    {t('drive.share.linkOn')}
                  </Text>
                  <View style={styles.linkRow}>
                    <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="middle">
                      {linkUrl ? truncateMiddle(linkUrl) : ''}
                    </Text>
                    <IconButton
                      icon="content-copy"
                      onPress={() => void onCopyLink()}
                      disabled={!linkUrl}
                      accessibilityLabel={t('drive.share.linkCopy')}
                    />
                  </View>
                </>
              ) : null}
            </View>

            <Divider />
          </>
        ) : null}

        {/* Recipients section */}
        <View style={styles.section}>
          <Text variant="titleSmall" testID="share-recipients-title">
            {t('drive.share.recipientsTitle')}
          </Text>
          {recipientViews.length === 0 ? (
            <Text variant="bodySmall" style={styles.sectionHint}>
              —
            </Text>
          ) : (
            recipientViews.map(recipient => (
              <RecipientRow
                key={recipient.key}
                recipient={recipient}
                statusLabel={statusLabel(recipient.status)}
                disabled={mutating}
                onRemove={() => void onRemoveRecipient(recipient)}
              />
            ))
          )}

          {showAddForm && emailSharingEnabled ? (
            <View style={styles.addForm}>
              <TextInput
                mode="outlined"
                testID="share-email-input"
                label={t('drive.share.emailPlaceholder')}
                value={emailInput}
                onChangeText={setEmailInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.emailInput}
              />
              {contactsLoading && contacts.length === 0 ? (
                <Text variant="bodySmall" style={styles.suggestionsHint}>
                  {t('drive.share.suggestionsLoading')}
                </Text>
              ) : null}
              {suggestions.length > 0 ? (
                <View style={[styles.suggestionsBox, { borderColor: theme.colors.outlineVariant }]}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    style={styles.suggestionsScroll}
                  >
                    {suggestions.map(s => (
                      <Pressable
                        key={s._id}
                        onPress={() => setEmailInput(s.email)}
                        style={({ pressed }) => [
                          styles.suggestionRow,
                          pressed && {
                            backgroundColor: theme.colors.surfaceVariant
                          }
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.displayName} ${s.email}`}
                      >
                        <View
                          style={[
                            styles.suggestionAvatar,
                            { backgroundColor: theme.colors.primaryContainer }
                          ]}
                        >
                          <Text
                            style={[
                              styles.suggestionInitial,
                              { color: theme.colors.onPrimaryContainer }
                            ]}
                          >
                            {s.displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.suggestionText}>
                          <Text variant="bodyMedium" numberOfLines={1}>
                            {s.displayName}
                          </Text>
                          <Text
                            variant="bodySmall"
                            numberOfLines={1}
                            style={styles.suggestionEmail}
                          >
                            {s.email}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <View style={styles.readOnlyRow}>
                <Text>{t('drive.share.readOnly')}</Text>
                <Switch
                  value={readOnlyInput}
                  onValueChange={setReadOnlyInput}
                  disabled={mutating}
                />
              </View>
              <View style={styles.addButtons}>
                <Button
                  mode="text"
                  onPress={() => {
                    setShowAddForm(false)
                    setEmailInput('')
                  }}
                  disabled={mutating}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  mode="contained"
                  testID="share-send"
                  onPress={() => void onSubmitRecipient()}
                  loading={mutating}
                  disabled={mutating || !emailInput.trim()}
                >
                  {t('drive.share.send')}
                </Button>
              </View>
            </View>
          ) : emailSharingEnabled ? (
            <Button
              mode="outlined"
              icon="account-plus"
              testID="share-add-recipient"
              onPress={() => setShowAddForm(true)}
              style={styles.addButton}
              disabled={initialLoading}
            >
              {t('drive.share.addRecipient')}
            </Button>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Button mode="outlined" onPress={close} testID="share-close">
            {t('common.close')}
          </Button>
        </View>
      </ScrollView>
      <Snackbar
        visible={snack !== null}
        onDismiss={() => setSnack(null)}
        duration={2500}
        style={styles.snackbar}
      >
        {snack ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

interface RecipientRowProps {
  recipient: RecipientView
  statusLabel: string
  disabled: boolean
  onRemove: () => void
}

const RecipientRow = ({ recipient, statusLabel, disabled, onRemove }: RecipientRowProps) => {
  const { t } = useTranslation()
  const label = recipient.name ?? recipient.email ?? '—'
  return (
    <View style={styles.recipientRow} testID="recipient-row">
      <View style={styles.recipientText}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="bodySmall" style={styles.recipientStatus}>
          {statusLabel}
          {recipient.readOnly ? ' · ☓' : ''}
        </Text>
        {recipient.inheritedFrom ? (
          <Text variant="bodySmall" style={styles.recipientStatus} numberOfLines={1}>
            {t('drive.share.inheritedFrom', { name: recipient.inheritedFrom })}
          </Text>
        ) : null}
      </View>
      {/* Access granted by a parent share is revoked where it was granted. */}
      {recipient.manageable ? (
        <IconButton
          icon="delete"
          onPress={onRemove}
          disabled={disabled}
          accessibilityLabel={t('a11y.removeRecipient')}
          testID="remove-recipient"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  name: { textAlign: 'center' },
  section: { paddingVertical: 12, gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionHint: { opacity: 0.7 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Slot keeps a fixed width matching Paper's Switch so swapping in the
  // spinner during a mutation doesn't shift the title left.
  linkSwitchSlot: {
    width: 52,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  linkText: { flex: 1 },
  editingRightsRow: { paddingTop: 4 },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  recipientText: { flex: 1, paddingRight: 8 },
  recipientStatus: { opacity: 0.6 },
  addForm: { gap: 8, paddingTop: 8 },
  emailInput: {},
  suggestionsHint: { opacity: 0.7 },
  suggestionsBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden'
  },
  suggestionsScroll: { maxHeight: 200 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12
  },
  suggestionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  suggestionInitial: { fontWeight: '600' },
  suggestionText: { flex: 1 },
  suggestionEmail: { opacity: 0.7 },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  addButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  addButton: { marginTop: 8 },
  loaderRow: { paddingVertical: 12, alignItems: 'center' },
  errorBox: {
    paddingVertical: 8,
    alignItems: 'center'
  },
  errorText: { textAlign: 'center' },
  footer: { marginTop: 16 },
  snackbar: { marginBottom: 16 }
})
