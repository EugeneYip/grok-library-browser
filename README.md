# Grok Library Browser

A clean Tampermonkey userscript that adds a better grid + search interface for browsing your Grok generated images and videos.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey).
2. Open Tampermonkey → Create a new script.
3. Replace the contents with the code from [`grok-library-browser.user.js`](./grok-library-browser.user.js).
4. Save.
5. Go to [grok.com/library](https://grok.com/library) or [grok.com/imagine](https://grok.com/imagine).

A floating panel and a launcher button will appear. Search by prompt, click items to open them.

## Notes

- Uses your existing logged-in session (cookies).
- Fetches from Grok’s `/rest/assets` endpoint.
- Internal endpoints can change; if it stops working, open an issue.

## License

MIT
