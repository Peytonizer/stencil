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
