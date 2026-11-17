# Grok Reels Library

Browser bookmarklet for a full-screen 9:16 scan of Imagine images and videos. No extension.

Install: [https://eugeneyip.github.io/grok-library-browser/](https://eugeneyip.github.io/grok-library-browser/)

The bookmark runs on [https://grok.com/library](https://grok.com/library) using the logged-in session. It lists media with the same request the Imagine library uses:

`GET /rest/assets?pageSize=40&orderBy=ORDER_BY_CREATE_TIME&workspaceKind=WORKSPACE_KIND_IMAGINE_ALL&mimeTypes=image/jpeg&mimeTypes=image/png&mimeTypes=image/webp&mimeTypes=video/mp4`

Related videos are grouped into a cycle row when the post record has `originalPostId` or the assets share `rootAssetId`. Selection is only for download. Playback does not require a click.

A bookmark is a copy of the script at the moment you drag it. After each update, delete the old bookmark and drag the button from the install page again. The header must say **Reels Library v3**.
