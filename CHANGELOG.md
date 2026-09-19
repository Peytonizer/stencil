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
