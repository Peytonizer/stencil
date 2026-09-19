# stencil

Fill in a strata notice and download it as a PDF.

Pick a template, answer the fields it asks for — owner, lot, the rule contravened, the
common seal — and stencil typesets the finished notice in your browser. Part of the
[strata](https://strata.noradz.io/) family of small tools for strata work in the ACT.

**Templates**

- Rule Infringement Notice — Unit Titles (Management) Act 2011, s 109.

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

*(Under construction — the app itself doesn't exist yet.)*

## Licence

MIT — see [LICENSE](LICENSE).
