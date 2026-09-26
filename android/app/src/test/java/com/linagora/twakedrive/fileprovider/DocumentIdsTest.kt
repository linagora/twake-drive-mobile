package com.linagora.twakedrive.fileprovider

import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.FileNotFoundException

class DocumentIdsTest {
    @Test fun `accepts the ids the stack mints`() {
        assertTrue(DocumentIds.isValid("8f3c2a1b4d5e6f708192a3b4c5d6e7f8"))
        assertTrue(DocumentIds.isValid(DocumentMapper.ROOT_DOC_ID))
        DocumentMapper.HIDDEN_IDS.forEach { assertTrue(it, DocumentIds.isValid(it)) }
    }

    @Test fun `rejects the dot entries a caller could climb with`() {
        assertFalse(DocumentIds.isValid(".."))
        assertFalse(DocumentIds.isValid("."))
    }

    @Test fun `rejects separators, so no id can name a path`() {
        assertFalse(DocumentIds.isValid("../../databases/twake.db"))
        assertFalse(DocumentIds.isValid("a/b"))
        assertFalse(DocumentIds.isValid("a\\b"))
        assertFalse(DocumentIds.isValid("/etc/passwd"))
    }

    @Test fun `rejects what would change a request url`() {
        assertFalse(DocumentIds.isValid("abc?Type=directory"))
        assertFalse(DocumentIds.isValid("abc#frag"))
        assertFalse(DocumentIds.isValid("abc%2e%2e"))
        assertFalse(DocumentIds.isValid("abc def"))
    }

    @Test fun `rejects the empty and the oversized`() {
        assertFalse(DocumentIds.isValid(""))
        assertFalse(DocumentIds.isValid("a".repeat(129)))
        assertTrue(DocumentIds.isValid("a".repeat(128)))
    }

    @Test fun `require hands back a valid id and throws on anything else`() {
        assertTrue(DocumentIds.require("abc") == "abc")
        assertThrows(FileNotFoundException::class.java) { DocumentIds.require("../x") }
    }

    @Test fun `the rejection message does not echo the id back`() {
        val e = assertThrows(FileNotFoundException::class.java) {
            DocumentIds.require("../../databases/secret.db")
        }
        assertFalse(e.message.orEmpty().contains("secret"))
    }
}
