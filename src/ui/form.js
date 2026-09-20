/*
  Builds a form from a template's field schema and keeps the values it collects.

  The values object is the source of truth and lives only in memory: inputs write to it as you
  type, and the DOM is rebuilt from it when the shape changes (a rule added or removed). Reload
  the page and it is gone, which is the intended behaviour on a shared office machine.

  Two behaviours belong to the schema rather than to any one field:

  - `showIf` hides a field until it applies (the property manager's email), and a hidden field
    is skipped by `missingFields`, so nobody is asked to fill in what they can't see.
  - A field whose `default` is a function of the other values (the confirm-by date) follows
    them until the user edits it by hand. After that it keeps the user's value, because the
    committee may set a different period.
*/

import { imageFromClipboardItems, prepareImage } from '../images.js';
import { defaultGroupItem, defaultValues } from '../templates/index.js';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/** Only fields that are always optional say so; a conditionally required one says nothing. */
const optionalTag = (field) =>
  field.required === false ? el('span', { class: 'optional' }, ' (optional)') : '';

/**
 * Render `template`'s fields into `container`. `onChange(values)` is called after every edit.
 * Returns `{ values }`, the live values object.
 */
export function renderForm(template, container, onChange) {
  const values = defaultValues(template);
  /** Paths the user has edited by hand, so a following default stops following. */
  const edited = new Set();
  /** One check per field with a `showIf`, rebuilt with the DOM. */
  let visibility = [];

  function update() {
    for (const field of template.fields) {
      // `default.length > 0` is a default that reads the other values. One that takes none
      // (today's date) is only a starting value and is left alone.
      if (typeof field.default === 'function' && field.default.length > 0 && !edited.has(field.id)) {
        values[field.id] = field.default(values);
        const input = container.querySelector(`[data-path="${field.id}"]`);
        if (input) input.value = values[field.id];
      }
    }
    for (const check of visibility) check();
    onChange(values);
  }

  function userEdited(path) {
    edited.add(path);
    update();
  }

  function renderImage(field, ctx, path, id) {
    const status = el('span', { class: 'hint', id: `${id}-status`, role: 'status' });
    const input = el('input', {
      type: 'file',
      id,
      accept: 'image/jpeg,image/png',
      'aria-describedby': `${id}-status`,
    });
    const remove = el('button', { type: 'button', class: 'link' }, 'Remove');

    const show = (error) => {
      const image = ctx[field.id];
      status.classList.toggle('is-error', Boolean(error));
      status.textContent = error
        ? error
        : image
          ? `Added: ${image.name ?? 'image'}, ${image.width} × ${image.height} px.`
          : (field.help ?? '');
      remove.hidden = !image;
    };

    /** `file` is a File from the picker or a Blob from the clipboard; `name` is what the status
     *  line calls it. */
    const accept = async (file, name) => {
      const result = await prepareImage(file, field.label);
      if (result.error) {
        show(result.error);
        return;
      }
      ctx[field.id] = { ...result.image, name };
      show();
      userEdited(path);
    };

    input.addEventListener('change', async () => {
      const [file] = input.files;
      if (!file) return;
      await accept(file, file.name);
      input.value = '';
    });
    remove.addEventListener('click', () => {
      ctx[field.id] = null;
      show();
      userEdited(path);
    });

    // People capture the rule with the Snipping Tool, which leaves the image on the clipboard
    // and no file to pick. Two routes in: a button, and Ctrl+V while focus is in this row. Paste
    // is scoped to the row because a notice has several image fields (each rule's image, the
    // seal, the letterhead) and a page-wide handler couldn't know which one was meant.
    const row = el('div', { class: 'file-row' }, input, remove, status);

    row.addEventListener('paste', async (event) => {
      const file = [...event.clipboardData.files].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      await accept(file, 'pasted image');
    });

    // `clipboard.read` needs a secure context (https or localhost, which both hosts are) and,
    // in Chromium, a one-off permission prompt. Where it is missing the button is left out and
    // Ctrl+V still works.
    if (navigator.clipboard?.read) {
      const paste = el('button', { type: 'button', class: 'secondary' }, 'Paste from clipboard');
      paste.addEventListener('click', async () => {
        try {
          const blob = await imageFromClipboardItems(await navigator.clipboard.read());
          if (!blob) {
            show('There is no image on the clipboard. Take a snip first, then paste.');
            return;
          }
          await accept(blob, 'pasted image');
        } catch {
          show('The browser blocked reading the clipboard. Click here and press Ctrl+V instead.');
        }
      });
      input.after(paste);
    }

    show();
    return row;
  }

  function renderControl(field, ctx, path, id) {
    if (field.type === 'checkbox') {
      const input = el('input', { type: 'checkbox', id, 'data-path': path });
      input.checked = Boolean(ctx[field.id]);
      input.addEventListener('change', () => {
        ctx[field.id] = input.checked;
        userEdited(path);
      });
      return input;
    }
    if (field.type === 'image') return renderImage(field, ctx, path, id);

    const input =
      field.type === 'textarea'
        ? el('textarea', { rows: 4 })
        : el('input', { type: field.type });
    input.id = id;
    input.dataset.path = path;
    input.autocomplete = 'off';
    if (field.id === 'unitsPlanNumber') input.inputMode = 'numeric';
    input.value = ctx[field.id] ?? '';
    input.addEventListener('input', () => {
      ctx[field.id] = input.value;
      userEdited(path);
    });
    return input;
  }

  function renderField(field, ctx, path) {
    if (field.type === 'group') return renderGroup(field, path);

    const id = `f-${path.replaceAll('.', '-')}`;
    const control = renderControl(field, ctx, path, id);
    const hint =
      field.help && field.type !== 'image' ? el('span', { class: 'hint' }, field.help) : '';

    const wrapper =
      field.type === 'checkbox'
        ? el('div', { class: 'field' }, el('label', { class: 'check' }, control, el('span', {}, field.label)), hint)
        : el(
            'div',
            { class: 'field' },
            el('label', { class: 'label', for: id }, field.label, optionalTag(field)),
            control,
            hint,
          );

    if (field.showIf) {
      const check = () => {
        wrapper.hidden = !field.showIf(ctx);
      };
      visibility.push(check);
      check();
    }
    return wrapper;
  }

  function renderGroup(field, path) {
    const items = values[field.id];
    const min = field.min ?? 1;
    const max = field.max ?? Infinity;

    const cards = items.map((item, index) => {
      const remove = el('button', { type: 'button', class: 'link', disabled: items.length <= min }, 'Remove');
      remove.addEventListener('click', () => {
        items.splice(index, 1);
        renderAll();
        update();
      });
      return el(
        'fieldset',
        { class: 'group-item' },
        el('legend', {}, `${field.itemLabel} ${index + 1}`),
        ...field.fields.map((sub) => renderField(sub, item, `${path}.${index}.${sub.id}`)),
        remove,
      );
    });

    const add = el(
      'button',
      { type: 'button', class: 'secondary', disabled: items.length >= max },
      `Add another ${field.itemLabel.toLowerCase()}`,
    );
    add.addEventListener('click', () => {
      items.push(defaultGroupItem(field));
      renderAll();
      update();
      container.querySelector(`[data-path="${path}.${items.length - 1}.${field.fields[0].id}"]`)?.focus();
    });

    return el(
      'div',
      { class: 'group' },
      el('span', { class: 'label' }, field.label),
      ...cards,
      add,
      el('span', { class: 'hint' }, `Up to ${max}.`),
    );
  }

  function renderAll() {
    visibility = [];
    const nodes = [];
    for (const section of template.sections) {
      nodes.push(el('h3', {}, section.title));
      for (const field of template.fields) {
        if (field.section === section.id) nodes.push(renderField(field, values, field.id));
      }
    }
    container.replaceChildren(...nodes);
  }

  renderAll();
  return { values };
}
