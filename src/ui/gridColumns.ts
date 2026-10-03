/** Narrowest a grid tile may get before a column is dropped. */
const MIN_TILE_WIDTH = 130

/** Columns the grid fits in `width`, never fewer than the three a phone shows
 *  in portrait: the tile size is what stays roughly constant across a
 *  rotation, not the column count. */
export const gridColumnsForWidth = (width: number): number =>
  Math.max(3, Math.floor(width / MIN_TILE_WIDTH))
