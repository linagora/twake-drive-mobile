/** Shared by the tiles and the placeholders that end a short row: Yoga adds
 *  padding on top of a flex share, so a placeholder without the tile's padding
 *  would leave the last row's tiles wider than the columns above. */
export const gridTileBox = { flex: 1, margin: 4, padding: 8 }

/** Narrowest a grid tile may get before a column is dropped. */
const MIN_TILE_WIDTH = 130

/** Columns the grid fits in `width`, never fewer than the three a phone shows
 *  in portrait: the tile size is what stays roughly constant across a
 *  rotation, not the column count. */
export const gridColumnsForWidth = (width: number): number =>
  Math.max(3, Math.floor(width / MIN_TILE_WIDTH))
