/*
  Wiring: the template picker, the form, the preview and the download.

  Nothing here persists anything. Reload the page and every value is gone, which is the
  intended behaviour on a shared office machine. The theme toggle is the one exception, and it
  keeps its own choice.
*/

// Self-hosted, matching noshow — no CDN, no runtime font fetch.
import '@fontsource-variable/fraunces/full.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-mono/400.css';

// The light/dark toggle is strata-kit's; it wires itself to the [data-theme-toggle] button.
import '../vendor/strata-kit/theme-toggle.js';
