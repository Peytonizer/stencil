/*
  Wiring: the template picker, the form, the preview and the download.

  The preview and the download are the same bytes. The PDF is built once per change and the
  blob is used for both, so there is no way for what you looked at to differ from what you
  send. The rebuild is debounced because building on every keystroke is work nobody asked for,
  not because it is slow. While a change is waiting to be rebuilt the download is disabled, so
  a stale PDF can't be sent.

  Which template is open lives in the URL hash, so one can be bookmarked and the browser's back
  button returns to the list.

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
import { buildPdf } from './pdf/render.js';
import { TEMPLATES, getTemplate, missingFields } from './templates/index.js';
import { renderForm } from './ui/form.js';
import { renderPicker } from './ui/picker.js';

const REBUILD_DELAY_MS = 300;

const pickerView = document.querySelector('[data-view="picker"]');
const formView = document.querySelector('[data-view="form"]');
const formPanel = document.querySelector('[data-form]');
const preview = document.querySelector('[data-preview]');

renderPicker(TEMPLATES, document.querySelector('[data-picker]'));

/** What is open right now, so it can be torn down when the hash changes. */
let session = null;

function line(className = '') {
  const p = document.createElement('p');
  p.className = `status ${className}`.trim();
  return p;
}

function openTemplate(template) {
  const back = Object.assign(document.createElement('a'), {
    className: 'back',
    href: '#',
    textContent: '← All notices',
  });
  const title = Object.assign(document.createElement('h2'), {
    className: 'template-title',
    textContent: template.name,
  });
  const fields = document.createElement('div');
  const actions = Object.assign(document.createElement('div'), { className: 'actions' });
  const download = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'primary',
    textContent: 'Download the notice',
    disabled: true,
  });
  const statusRemaining = line();
  const statusSeal = line('is-warning');
  const statusError = line('is-error');
  statusRemaining.setAttribute('role', 'status');
  actions.append(download, statusRemaining, statusSeal, statusError);
  formPanel.replaceChildren(back, title, fields, actions);

  const current = { url: null, bytes: null, filename: '' };
  let timer = null;
  /** Bumped on every change, so a slow build that finishes late can't overwrite a newer one. */
  let generation = 0;

  const sealField = template.fields.find((field) => field.id === 'seal');

  function showStatus(values, missing) {
    statusRemaining.textContent =
      missing.length === 0
        ? 'Ready to download.'
        : `${missing.length} ${missing.length === 1 ? 'field' : 'fields'} left to fill.`;
    statusSeal.textContent = sealField && !values.seal ? sealField.warning : '';
  }

  async function rebuild(values) {
    const mine = generation;
    const missing = missingFields(template, values);
    try {
      const bytes = await buildPdf(template, values);
      if (mine !== generation) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const previous = current.url;
      Object.assign(current, { url, bytes, filename: template.filename(values) });
      preview.src = url;
      if (previous) URL.revokeObjectURL(previous);
      statusError.textContent = '';
      download.disabled = missing.length > 0;
    } catch (error) {
      if (mine !== generation) return;
      // Most likely an image pdf-lib can't embed. Say so, and keep the download off.
      statusError.textContent = `The notice couldn't be built: ${error.message}`;
      download.disabled = true;
    }
  }

  function changed(values) {
    generation += 1;
    download.disabled = true;
    showStatus(values, missingFields(template, values));
    clearTimeout(timer);
    timer = setTimeout(() => rebuild(values), REBUILD_DELAY_MS);
  }

  download.addEventListener('click', () => {
    if (!current.bytes || download.disabled) return;
    const link = Object.assign(document.createElement('a'), {
      href: current.url,
      download: current.filename,
    });
    link.click();
  });

  const form = renderForm(template, fields, changed);
  showStatus(form.values, missingFields(template, form.values));
  rebuild(form.values);

  document.title = `${template.name} — stencil`;
  return () => {
    clearTimeout(timer);
    generation += 1;
    if (current.url) URL.revokeObjectURL(current.url);
    preview.removeAttribute('src');
  };
}

function route() {
  session?.();
  session = null;

  const template = getTemplate(decodeURIComponent(location.hash.slice(1)));
  pickerView.hidden = Boolean(template);
  formView.hidden = !template;
  if (template) {
    session = openTemplate(template);
  } else {
    formPanel.replaceChildren();
    document.title = 'stencil — strata notices';
  }
}

// A form's Enter key would otherwise try to submit it.
formPanel.addEventListener('submit', (event) => event.preventDefault());
window.addEventListener('hashchange', route);
route();
