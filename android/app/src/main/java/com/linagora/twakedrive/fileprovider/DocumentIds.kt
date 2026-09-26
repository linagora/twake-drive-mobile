package com.linagora.twakedrive.fileprovider

import java.io.FileNotFoundException

/**
 * A documentId reaches the provider over Binder, from an app the user picked a
 * tree for. It then serves as both a file name and a request path segment, so
 * anything shaped like a path would read outside the cache or aim the user's
 * Bearer token at another stack route.
 *
 * The stack mints hexadecimal ids plus a handful of `io.cozy.files.*-dir`
 * literals, so the shape below is what a caller may name — and `.`/`..`, which
 * the shape would otherwise allow, are the two that climb.
 */
object DocumentIds {
    private val SHAPE = Regex("^[A-Za-z0-9._-]{1,128}$")

    fun isValid(id: String): Boolean = SHAPE.matches(id) && id != "." && id != ".."

    /** The id itself stays out of the message: it is caller-supplied and ends up in logs. */
    fun require(id: String): String =
        if (isValid(id)) id else throw FileNotFoundException("rejected document id")
}
