# PWA Link Sharing

Look into making room-code share links open directly in the installed PWA rather than the browser.

## Investigation areas

- [ ] Check manifest `scope` and `start_url` — do they cover the room-code URL shape?
- [ ] `share_target` manifest member for receiving shared links
- [ ] Custom protocol handler (`registerProtocolHandler`) as a fallback
- [ ] Universal links / `/.well-known/assetlinks.json` (Android) — may not apply to GitHub Pages
- [ ] Test: install PWA, share a link, see what opens
