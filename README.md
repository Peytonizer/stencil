# stencil

Fill in a strata notice and download it as a PDF.

Pick a template, answer the fields it asks for — owner, lot, the rule contravened, the
common seal — and stencil typesets the finished notice in your browser. Part of the
[strata](https://strata.noradz.io/) family of small tools for strata work in the ACT.

**Templates**

- Rule Infringement Notice — Unit Titles (Management) Act 2011, s 109.
- Parking Breach Notice — a letter to an owner about a vehicle parked illegally on common
  property: the owner and lot, the vehicle and when it was seen, an optional excerpt of the rule,
  and one or more photos as evidence.

The download button stays disabled until every required field is filled; beneath it, a list
names the fields still outstanding, and clicking one jumps to it.

Images (the rule excerpt, the seal, the letterhead, the evidence photos) can be chosen as a file or pasted straight
from the clipboard, so a Snipping Tool capture needs no saving first: use the "Paste from
clipboard" button, or click in the image's row and press Ctrl+V.

**Screenshot reader.** Choose or paste a screenshot of the strata software's Lot/Owner screen
and the plan number, building name, lot, unit, street address, suburb and the owner's name and
email are filled in, on either template (the parking notice also asks for the state and postcode,
which the screen doesn't show). Each is marked until you edit it, so check every one against the screenshot:
it reads text from an image and can get a digit wrong. Anything it isn't at least half sure of is
left blank and listed instead. The reading is done in your browser by a bundled copy of
Tesseract, run in a worker; it loads (about 8 MB) the first time you give it a screenshot, and
never otherwise.

**Privacy.** Everything happens in your browser. Nothing you type or upload — names,
addresses, the seal — is sent anywhere or stored; the page's Content-Security-Policy blocks
outbound requests outright, and that includes the screenshot reader, which ships with its own
engine and language data rather than fetching them. Close the tab and it's gone.

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
