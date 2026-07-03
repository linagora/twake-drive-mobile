package com.linagora.twakedrive.fileprovider

import android.database.MatrixCursor
import android.provider.DocumentsContract.Document
import android.provider.DocumentsContract.Root

object DocumentMapper {
    const val AUTHORITY = "com.linagora.twakedrive.documents"
    const val ROOT_ID = "twake"
    const val ROOT_DOC_ID = "io.cozy.files.root-dir"
    val HIDDEN_IDS = setOf("io.cozy.files.trash-dir", "io.cozy.files.shared-drives-dir")

    val DEFAULT_ROOT_PROJECTION = arrayOf(
        Root.COLUMN_ROOT_ID, Root.COLUMN_FLAGS, Root.COLUMN_TITLE,
        Root.COLUMN_DOCUMENT_ID, Root.COLUMN_ICON, Root.COLUMN_SUMMARY
    )
    val DEFAULT_DOCUMENT_PROJECTION = arrayOf(
        Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE,
        Document.COLUMN_FLAGS, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED
    )

    fun mimeOf(f: CozyFile): String =
        if (f.isDir) Document.MIME_TYPE_DIR else (f.mime ?: "application/octet-stream")

    fun flagsFor(f: CozyFile): Int {
        var flags = Document.FLAG_SUPPORTS_DELETE or
            Document.FLAG_SUPPORTS_RENAME or
            Document.FLAG_SUPPORTS_MOVE or
            Document.FLAG_SUPPORTS_REMOVE
        if (f.isDir) {
            flags = flags or Document.FLAG_DIR_SUPPORTS_CREATE
        } else {
            flags = flags or Document.FLAG_SUPPORTS_WRITE
            if (f.hasThumbnail()) flags = flags or Document.FLAG_SUPPORTS_THUMBNAIL
        }
        return flags
    }

    // Only populate the columns the caller actually requested. MatrixCursor's
    // add(columnName, value) THROWS on a column absent from the cursor's
    // projection, and SAF consumers (e.g. Gmail) query with a minimal
    // projection like [DISPLAY_NAME, SIZE] — adding every column unconditionally
    // would crash queryDocument and surface as "undefined" in the picker.
    private fun fill(cursor: MatrixCursor, values: Map<String, Any?>) {
        val row = cursor.newRow()
        for (col in cursor.columnNames) {
            if (values.containsKey(col)) row.add(col, values[col])
        }
    }

    fun addFileRow(cursor: MatrixCursor, f: CozyFile) {
        fill(
            cursor,
            mapOf(
                Document.COLUMN_DOCUMENT_ID to f.id,
                Document.COLUMN_DISPLAY_NAME to f.name,
                Document.COLUMN_MIME_TYPE to mimeOf(f),
                Document.COLUMN_FLAGS to flagsFor(f),
                Document.COLUMN_SIZE to f.size,
                Document.COLUMN_LAST_MODIFIED to if (f.updatedAt > 0) f.updatedAt else null
            )
        )
    }

    fun addRootRow(cursor: MatrixCursor, domain: String) {
        fill(
            cursor,
            mapOf(
                Root.COLUMN_ROOT_ID to ROOT_ID,
                Root.COLUMN_DOCUMENT_ID to ROOT_DOC_ID,
                Root.COLUMN_TITLE to "Twake Drive",
                Root.COLUMN_SUMMARY to domain,
                Root.COLUMN_FLAGS to (Root.FLAG_SUPPORTS_CREATE or Root.FLAG_SUPPORTS_IS_CHILD),
                Root.COLUMN_ICON to com.linagora.twakedrive.R.mipmap.ic_launcher_foreground
            )
        )
    }
}
