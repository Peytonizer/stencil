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
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'self' blob:",
  "frame-src 'self' blob:",
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

export default defineConfig({
  // Relative asset paths, so the built site works both at the custom domain's root and at the
  // repository subpath GitHub Pages serves before a domain is pointed at it.
  base: './',
  plugins: [cspPlugin()],
});
