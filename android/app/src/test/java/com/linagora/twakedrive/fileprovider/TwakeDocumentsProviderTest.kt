package com.linagora.twakedrive.fileprovider

import okhttp3.OkHttpClient
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.FileNotFoundException

class TwakeDocumentsProviderTest {
    private fun signedOutProvider() = TwakeDocumentsProvider().also {
        val f = TwakeDocumentsProvider::class.java.getDeclaredField("session")
        f.isAccessible = true
        f.set(it, SessionStore(FakeCredentialStore(), OkHttpClient()))
    }

    @Test fun `a signed-out provider refuses to open a document`() {
        assertThrows(FileNotFoundException::class.java) {
            signedOutProvider().openDocument("abc", "r", null)
        }
    }

    @Test fun `a signed-out provider refuses to list a folder`() {
        assertThrows(FileNotFoundException::class.java) {
            signedOutProvider().queryChildDocuments(DocumentMapper.ROOT_DOC_ID, null, null as String?)
        }
    }
}
