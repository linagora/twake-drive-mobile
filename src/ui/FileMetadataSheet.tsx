import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'
import { Button, Divider, Text, useTheme } from 'react-native-paper'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'

import { formatFileSize } from '@/utils/formatters'
import { getFileIcon } from '@/utils/fileIcons'

export interface FileMetadata {
  _id: string
  name: string
  size: number | null
  mime?: string
  updated_at?: string
  path?: string
  cozyMetadata?: {
    createdBy?: { account?: string }
  }
}

export interface FileMetadataSheetHandle {
  present: (file: FileMetadata) => void
  dismiss: () => void
}

export const FileMetadataSheet = forwardRef<FileMetadataSheetHandle>((_, ref) => {
  const theme = useTheme()
  const { t } = useTranslation()
  const bottomSheetRef = useRef<BottomSheet>(null)
  const [file, setFile] = React.useState<FileMetadata | null>(null)

  useImperativeHandle(ref, () => ({
    present: (f: FileMetadata) => {
      setFile(f)
      bottomSheetRef.current?.expand()
    },
    dismiss: () => bottomSheetRef.current?.close()
  }))

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['40%', '90%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
    >
      <BottomSheetView style={styles.container}>
        {file ? (
          <>
            <View style={styles.header}>
              <Icon
                name={getFileIcon('file', file.mime)}
                size={56}
                color={theme.colors.primary}
              />
              <Text variant="titleMedium" style={styles.name}>
                {file.name}
              </Text>
            </View>
            <Divider />
            <Row label={t('drive.fileMeta.type')} value={file.mime ?? '—'} />
            <Row label={t('drive.fileMeta.size')} value={formatFileSize(file.size)} />
            <Row
              label={t('drive.fileMeta.modified')}
              value={file.updated_at ? format(new Date(file.updated_at), 'PPp') : '—'}
            />
            <Row label={t('drive.fileMeta.path')} value={file.path ?? '—'} />
            <Row
              label={t('drive.fileMeta.owner')}
              value={file.cozyMetadata?.createdBy?.account ?? '—'}
            />
            <View style={styles.footer}>
              <Button mode="contained" onPress={() => bottomSheetRef.current?.close()}>
                {t('common.close')}
              </Button>
            </View>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  )
})

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text variant="labelMedium" style={styles.label}>
      {label}
    </Text>
    <Text variant="bodyMedium" style={styles.value}>
      {value}
    </Text>
  </View>
)

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  name: { textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  label: { flex: 1 },
  value: { flex: 2, textAlign: 'right' },
  footer: { marginTop: 24 }
})

FileMetadataSheet.displayName = 'FileMetadataSheet'
