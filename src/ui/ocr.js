/*
  "Read from a screenshot": paste or choose a capture of the strata software's Lot/Owner screen
  and the fields it shows are filled in.

  This is the one place in the app where the machine guesses at a fact that ends up in a notice,
  so it is built to be checked rather than trusted: what it fills is marked on the form until the
  user edits it (see `applySuggestions` in form.js), anything it is unsure of says so, and
  anything it couldn't read is listed rather than left to be noticed. It never overwrites a field
  the user has already filled. The download gate is unchanged: a field it didn't fill is still
  required.

  The reader (about 8 MB, see src/ocr/engine.js) is imported on first use, so a session that
  never opens a screenshot never loads it.
*/

import { imageFromClipboardItems } from '../images.js';
import { parseLotOwner } from '../ocr/parse.js';

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Add the panel to `container`. `apply(found)` fills the form (form.js's `applySuggestions`) and
 * `labelOf(id)` is a field's label on the form. Returns a function that shuts the reader down.
 */
export function renderOcrPanel(container, { apply, labelOf }) {
  let engine = null;
  let busy = false;

  const status = el('span', { className: 'hint' });
  status.setAttribute('role', 'status');
  const report = el('ul', { className: 'ocr-report' });
  const input = el('input', { type: 'file', accept: 'image/png,image/jpeg', id: 'ocr-file' });
  const row = el('div', { className: 'file-row' }, input, status);

  const say = (text, isError = false) => {
    status.classList.toggle('is-error', isError);
    status.textContent = text;
  };

  async function read(file) {
    if (busy) return;
    busy = true;
    report.replaceChildren();
    try {
      say('Preparing the image…');
      const { prepareForOcr } = await import('../ocr/prepare.js');
      const { bytes, scale } = await prepareForOcr(file);

      const progress = (what, fraction) =>
        say(`${what}${typeof fraction === 'number' ? ` ${Math.round(fraction * 100)}%` : ''}…`);
      if (!engine) {
        say('Loading the reader. This takes a moment the first time…');
        engine = await (await import('../ocr/engine.js')).createEngine(progress);
      }
      const words = await engine.recognize(bytes, progress);

      // The image was enlarged for reading; put the boxes back in the screenshot's own pixels.
      const { fields, unread, notFound } = parseLotOwner(
        words.map((word) => ({
          ...word,
          bbox: Object.fromEntries(Object.entries(word.bbox).map(([k, v]) => [k, v / scale])),
        })),
      );
      const { applied, skipped } = apply(fields);

      const lines = [];
      if (applied.length) {
        lines.push(`Filled in: ${applied.map(labelOf).join(', ')}. Check each one against the screenshot.`);
      }
      if (skipped.length) {
        lines.push(`Left as you had them: ${skipped.map(labelOf).join(', ')}.`);
      }
      const missed = [...unread, ...notFound];
      if (missed.length) lines.push(`Not read from the screenshot: ${missed.join(', ')}.`);
      report.replaceChildren(...lines.map((text) => el('li', {}, text)));
      say(applied.length ? '' : 'Nothing could be read. Is this the Lot/Owner screen?');
    } catch (error) {
      say(`The screenshot couldn't be read: ${error.message}`, true);
    } finally {
      busy = false;
    }
  }

  const take = (file) => {
    if (!file?.type.startsWith('image/')) {
      say('That is not an image. Choose a PNG or JPEG screenshot.', true);
      return;
    }
    read(file);
  };

  input.addEventListener('change', () => {
    take(input.files[0]);
    input.value = '';
  });
  // Scoped to the panel, as the image fields are: Ctrl+V with focus inside it.
  const section = el(
    'section',
    { className: 'ocr' },
    el('h3', {}, 'Read from a screenshot'),
    el(
      'p',
      { className: 'hint' },
      "Choose or paste (Ctrl+V) a screenshot of the lot's owner details. It is read in this tab and never uploaded. Check every value it fills in.",
    ),
    row,
    report,
  );
  section.addEventListener('paste', (event) => {
    const file = [...event.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    take(file);
  });

  if (navigator.clipboard?.read) {
    const paste = el('button', { type: 'button', className: 'secondary' }, 'Paste from clipboard');
    paste.addEventListener('click', async () => {
      try {
        const blob = await imageFromClipboardItems(await navigator.clipboard.read());
        if (blob) take(blob);
        else say('There is no image on the clipboard. Take a screenshot first, then paste.', true);
      } catch {
        say('The browser blocked reading the clipboard. Click here and press Ctrl+V instead.', true);
      }
    });
    input.after(paste);
  }

  container.replaceChildren(section);
  return () => engine?.terminate();
}
