import type { Href } from 'expo-router'

export const makeFolderRoute = (folder: { _id: string; driveId?: string }): Href =>
  folder.driveId
    ? `/(drive)/shared/${folder.driveId}/${folder._id}`
    : `/(drive)/files/${folder._id}`
