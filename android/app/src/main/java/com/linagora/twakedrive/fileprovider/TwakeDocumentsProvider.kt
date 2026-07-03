package com.linagora.twakedrive.fileprovider

import android.content.res.AssetFileDescriptor
import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsProvider

class TwakeDocumentsProvider : DocumentsProvider() {

    private lateinit var session: SessionStore
    private lateinit var api: CozyStackApi
    private lateinit var cache: DocumentCache

    override fun onCreate(): Boolean {
        val ctx = context ?: return false
        session = SessionStore(EncryptedCredentialStore(ctx), okhttp3.OkHttpClient())
        api = CozyStackApi(session)
        cache = DocumentCache(ctx)
        return true
    }

    override fun queryRoots(projection: Array<out String>?): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_ROOT_PROJECTION)
        val uri = session.baseUri() ?: return cursor // no session → hide root
        if (session.creds() == null) return cursor
        val domain = uri.substringAfter("://").substringBefore('/')
        DocumentMapper.addRootRow(cursor, domain)
        return cursor
    }

    override fun queryDocument(documentId: String?, projection: Array<out String>?): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)
        val id = documentId ?: return cursor
        DocumentMapper.addFileRow(cursor, api.get(id))
        return cursor
    }

    override fun queryChildDocuments(
        parentDocumentId: String?,
        projection: Array<out String>?,
        sortOrder: String?
    ): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)
        val parent = parentDocumentId ?: return cursor
        for (f in api.list(parent)) DocumentMapper.addFileRow(cursor, f)
        // Register for change notifications so notifyChange() after a mutation
        // refreshes this listing in the picker.
        context?.let {
            cursor.setNotificationUri(
                it.contentResolver,
                android.provider.DocumentsContract.buildChildDocumentsUri(
                    DocumentMapper.AUTHORITY, parent)
            )
        }
        return cursor
    }

    override fun openDocument(
        documentId: String?,
        mode: String?,
        signal: CancellationSignal?
    ): ParcelFileDescriptor {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val wantsWrite = (mode ?: "r").contains('w')
        if (wantsWrite) return openForWrite(id, mode!!) // Task 9
        val local = cache.ensureLocal(id, api)
        return ParcelFileDescriptor.open(local, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun openDocumentThumbnail(
        documentId: String?,
        sizeHint: android.graphics.Point?,
        signal: CancellationSignal?
    ): AssetFileDescriptor? {
        val id = documentId ?: return null
        val f = cache.cachedFile("$id.thumb")
        if (!f.exists() || f.length() == 0L) {
            if (!api.thumbnail(api.get(id), f)) return null
        }
        val pfd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
        return AssetFileDescriptor(pfd, 0, AssetFileDescriptor.UNKNOWN_LENGTH)
    }

    private fun openForWrite(id: String, mode: String): ParcelFileDescriptor {
        val tmp = cache.tempFor(id)
        // Seed the temp file with current content for read-modify-write modes.
        if (mode.contains('r') || mode.contains('a')) {
            try { cache.ensureLocal(id, api).copyTo(tmp, overwrite = true) }
            catch (e: Exception) { tmp.writeBytes(ByteArray(0)) }
        } else if (!tmp.exists()) {
            tmp.writeBytes(ByteArray(0))
        }
        val handler = android.os.Handler(handlerThread.looper)
        val mimeType = try { api.get(id).mime } catch (e: Exception) {
            android.util.Log.w("TwakeDP", "mime lookup failed for $id, defaulting", e)
            null
        } ?: "application/octet-stream"
        return ParcelFileDescriptor.open(
            tmp,
            ParcelFileDescriptor.parseMode(mode),
            handler
        ) { err ->
            try {
                if (err == null) {
                    api.upload(id, tmp, mimeType)
                    cache.stageWritten(id, tmp) // stage the written bytes so a pinned read isn't stale
                    notifyChange(parentOf(id))
                } else android.util.Log.w("TwakeDP", "write FD closed with error for $id", err)
            } catch (e: Exception) {
                android.util.Log.e("TwakeDP", "upload on close failed for $id", e)
            } finally { tmp.delete() }
        }
    }

    private val handlerThread by lazy {
        android.os.HandlerThread("twake-dp-write").apply { start() }
    }

    private fun parentOf(id: String): String =
        try { api.get(id).dirId ?: DocumentMapper.ROOT_DOC_ID } catch (e: Exception) {
            android.util.Log.w("TwakeDP", "parentOf lookup failed for $id, defaulting to root", e)
            DocumentMapper.ROOT_DOC_ID
        }

    override fun createDocument(
        parentDocumentId: String?,
        mimeType: String?,
        displayName: String?
    ): String {
        val parent = parentDocumentId ?: throw java.io.FileNotFoundException("null parent")
        val name = displayName ?: "untitled"
        val created = if (mimeType == android.provider.DocumentsContract.Document.MIME_TYPE_DIR)
            api.createDirectory(parent, name)
        else api.createFile(parent, name, mimeType ?: "application/octet-stream")
        notifyChange(parent)
        return created.id
    }

    private fun notifyChange(parentDocumentId: String) {
        val uri = android.provider.DocumentsContract.buildChildDocumentsUri(
            DocumentMapper.AUTHORITY, parentDocumentId)
        context?.contentResolver?.notifyChange(uri, null)
    }

    override fun renameDocument(documentId: String?, displayName: String?): String? {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val f = api.rename(id, displayName ?: "untitled")
        notifyChange(f.dirId ?: DocumentMapper.ROOT_DOC_ID)
        return null // id is stable
    }

    override fun moveDocument(
        documentId: String?, sourceParentDocumentId: String?, targetParentDocumentId: String?
    ): String {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val target = targetParentDocumentId ?: throw java.io.FileNotFoundException("null target")
        api.move(id, target)
        sourceParentDocumentId?.let { notifyChange(it) }
        notifyChange(target)
        return id
    }

    override fun deleteDocument(documentId: String?) {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val parent = parentOf(id)
        api.trash(id)
        notifyChange(parent)
    }

    override fun removeDocument(documentId: String?, parentDocumentId: String?) {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val parent = parentDocumentId ?: parentOf(id)
        api.trash(id)
        notifyChange(parent)
    }

    override fun isChildDocument(parentDocumentId: String?, documentId: String?): Boolean {
        if (parentDocumentId == null || documentId == null) return false
        if (parentDocumentId == DocumentMapper.ROOT_DOC_ID) return true // single-root tree
        var current: String? = documentId
        var hops = 0
        while (current != null && hops++ < 64) {
            if (current == parentDocumentId) return true
            current = try { api.get(current).dirId } catch (e: Exception) { null }
        }
        return false
    }
}
