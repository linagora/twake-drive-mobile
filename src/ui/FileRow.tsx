import React from 'react'
import { StyleSheet } from 'react-native'
import { List } from 'react-native-paper'
import { formatDistanceToNow } from 'date-fns'

import { formatFileSize } from '@/utils/formatters'
import { FileThumbnail } from './FileThumbnail'

export interface FileItem {
  _id: string
  name: string
  type?: 'file' | 'directory'
  size: number | null
  mime?: string
  class?: string
  updated_at?: string
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

interface Props {
  file: FileItem
  onPress: (file: FileItem) => void
}

export const FileRow = ({ file, onPress }: Props) => {
  const size = formatFileSize(file.size)
  const date = file.updated_at
    ? formatDistanceToNow(new Date(file.updated_at), { addSuffix: true })
    : ''
  const description = date ? `${size} · ${date}` : size

  return (
    <List.Item
      title={file.name}
      description={description}
      left={() => <FileThumbnail file={file} size={40} />}
      onPress={() => onPress(file)}
      style={styles.row}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 }
})
