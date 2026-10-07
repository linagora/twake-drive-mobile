import { useWindowDimensions } from 'react-native'
import { gridColumnsForWidth } from './gridColumns'
import { useViewMode } from './useViewMode'

/**
 * What a file screen needs to draw its list as the user chose: whether it is
 * the grid, and the `numColumns` to give `FileListView` (undefined in list mode).
 */
export function useGridLayout(): { isGrid: boolean; numColumns: number | undefined } {
  const { mode } = useViewMode()
  const columns = gridColumnsForWidth(useWindowDimensions().width)
  const isGrid = mode === 'grid'
  return { isGrid, numColumns: isGrid ? columns : undefined }
}
