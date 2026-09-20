# stencil

Fill in a strata notice and download it as a PDF.

Pick a template, answer the fields it asks for — owner, lot, the rule contravened, the
common seal — and stencil typesets the finished notice in your browser. Part of the
[strata](https://strata.noradz.io/) family of small tools for strata work in the ACT.

**Templates**

- Rule Infringement Notice — Unit Titles (Management) Act 2011, s 109.

Images (the rule excerpt, the seal, the letterhead) can be chosen as a file or pasted straight
from the clipboard, so a Snipping Tool capture needs no saving first: use the "Paste from
clipboard" button, or click in the image's row and press Ctrl+V.

**Privacy.** Everything happens in your browser. Nothing you type or upload — names,
addresses, the seal — is sent anywhere or stored; the page's Content-Security-Policy blocks
outbound requests outright. Close the tab and it's gone.

This is not legal advice. Check any notice before you send it.

## Setup

Requires Node 22.13 or later.

```sh
git clone --recurse-submodules https://github.com/Peytonizer/stencil.git
cd stencil
npm install
npm run dev
```

Other scripts:

```sh
npm test        # Vitest
npm run lint    # oxlint
npm run build   # production build into dist/
npm run proof   # sample PDFs into .proof/ (gitignored), built from obviously fake values
```

## Licence

MIT — see [LICENSE](LICENSE).
