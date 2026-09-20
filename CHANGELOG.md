# Changelog

## Unreleased

- Project scaffolded: README, changelog, licence, `.gitignore`.
- Build tooling: Vite, Vitest, oxlint, pdf-lib 1.17.1 (all pinned exactly), the page shell, a theme
  toggle and the strata-kit palette as a submodule. The built page ships a Content-Security-Policy
  with no `connect-src`.
- PDF engine: text wrapping with justification and hard line breaks, pagination (keep-together
  groups, keep-with-next, blank lines dropped at a page top), images with borders, a letterhead
  band on page 1, and a proof tool. Text the standard fonts can't draw prints as a visible "?"
  rather than stopping the preview.
- Rule Infringement Notice template: fields, `build()` and `missingFields()`, with the source's
  wording reproduced exactly (the source's management firm's name becomes "the Managing Agent"). Every conditional
  has a test, and so does every required field's placeholder.
- One blank line before Schedule A clause 2, however many rules and images precede it.
- The app: a template picker, a form generated from the template's fields (with a repeatable rule
  group, image inputs, and a confirm-by date that follows the notice date until edited by hand),
  a live preview rebuilt 300 ms after the last change, and a download that stays disabled until
  every required field is filled. Every image is redrawn through a canvas, which downscales it
  and bakes in any phone-photo rotation.
- Deploy workflow: lint, tests and build run before every push to main is published to GitHub Pages.
- Footer states that the page makes no network requests, as the other strata tools do. Fixed the
  rule card and its inputs running past the form panel's edge: a fieldset and a grid column won't
  shrink below their content's natural width unless told to.
- The letterhead is now required, and is the header of every page rather than page 1 only. While
  it is missing the preview shows a red `[Letterhead]` in the band and download stays disabled.
- The privacy line under the title is the green pill lodger and former use, with the shield icon.
- Image fields can be pasted from the clipboard, by a "Paste from clipboard" button or Ctrl+V in
  the field's row, so a Snipping Tool capture needs no saving first. Paste is scoped to the row
  because a notice has several image fields and a page-wide handler couldn't tell which was meant.
- The theme toggle is a pill with an icon, matching the other strata tools: a sun for light and a
  moon for dark. The icon swap is new in strata-kit's `theme-toggle.js`, so the submodule pin moves.
- The letterhead is centred across the text measure rather than left-aligned, so a narrower
  image (never enlarged past 1 px = 1 pt) sits in the middle of the header. One that fills the
  measure looks the same as before. The red `[Letterhead]` placeholder is centred too.
- Four deliberate changes to the notice's wording and layout: a comma after the unit number in
  clause 2 ("being 12, 45 Example Street"), the source's stray space removed from "commit an
  offence, and" in clause 6a, Schedule A clause 2 kept together with its remedies so it never
  splits across a page, and a blank line before Schedule A clause 3. SPEC.md records each.
- Fixed clause 3 being left at the foot of a page with the seal on the next when Additional
  requests were filled in: the keep-with-next chain that ties clause 3 to the seal block stopped
  at the additional requests paragraph, which now carries it on.
- The download is named `YYYYMMDD UP<units plan> Infringement Notice - Lot <lot>.pdf`, for
  example `20260919 UP9999 Infringement Notice - Lot 34.pdf`, so notices sort by date in a folder.
