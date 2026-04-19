# Mobile Event Log UX

Feedback: the event log is difficult to use on mobile.

## Root cause

Nested scrolling — `max-height: 7rem` + `overflow-y: auto` on `.log-content` inside a page that also scrolls. Mobile browsers can't reliably distinguish "scroll the log" from "scroll the page."

## Quick wins

- [ ] Add `overscroll-behavior: contain` and `touch-action: pan-y` to `.log-content` in `LogPanel.svelte` — isolates scroll events to the log container
- [ ] Bump font size: `.log-panel` base is `0.7rem`, inner labels `0.65rem`; raise to `0.85rem` minimum
- [ ] Add padding to `.card-link` (currently zero) so card name buttons are actually tappable — target size should be ~44×44px per WCAG

## Larger refactors

- [ ] **"Last entry" strip** — show only the most recent 1–2 lines prominently; tap to expand full log. Removes the nested scroll problem entirely for the common case.
- [ ] **Bottom sheet / drawer** — log lives as a thin collapsed strip at the bottom; tap slides up a fullscreen overlay. Standard mobile game pattern (avoids page-scroll conflict completely).
