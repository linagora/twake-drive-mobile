import type { Href } from 'expo-router'

export const makeFolderRoute = (folder: { _id: string; driveId?: string }): Href =>
  folder.driveId
    ? `/(drive)/shared/drive/${folder.driveId}/${folder._id}`
    : `/(drive)/files/${folder._id}`
