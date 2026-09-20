import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * The Content-Security-Policy is the privacy claim made enforceable. With no `connect-src`, the
 * browser refuses to make an outbound request at all, so "your seal never leaves this tab" is
 * something a user can check — by reading this policy, or by watching an empty Network tab —
 * rather than something they have to believe. A notice carries owners' names, addresses and
 * emails, and the owners corporation seal is the instrument the corporation executes documents
 * with; uploading either to a form-filling service is exactly what this app exists to avoid.
 *
 * Copied from noshow's config, which carries the same policy for the same reasons. `object-src`
 * and `frame-src` allow `blob:` because the preview is the generated PDF shown in the browser's
 * own viewer. Verify that in a real browser before trusting it — see SPEC.md, build stage 5.
 *
 * Injected at build time rather than written into index.html, because in dev Vite needs a
 * websocket for hot reload and an inline module preamble, both of which this policy blocks.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'self' blob:",
  "frame-src 'self' blob:",
  "worker-src blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function cspPlugin() {
  return {
    name: 'stencil-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

/**
 * `import data from './file?base64'` gives the file's bytes as a base64 string, bundled into the
 * JS chunk that imports it. The OCR reader's language data goes in this way because reading it
 * any other way is a `fetch`, which the policy has no `connect-src` to allow; a script chunk is
 * loaded under `script-src 'self'`, which it does. Vite's own `?inline` only covers file types it
 * already knows as assets, and `.gz` isn't one.
 */
function base64Plugin() {
  return {
    name: 'stencil-base64',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('?base64')) return null;
      const bytes = readFileSync(id.slice(0, -'?base64'.length));
      return `export default ${JSON.stringify(bytes.toString('base64'))};`;
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the built site works both at the custom domain's root and at the
  // repository subpath GitHub Pages serves before a domain is pointed at it.
  base: './',
  plugins: [base64Plugin(), cspPlugin()],
});
