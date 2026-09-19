/*
  The landing view: one card per template. A card is a plain link to the template's hash, so
  choosing one, bookmarking it and going back with the browser's button all work without any
  script of their own.
*/

export function renderPicker(templates, container) {
  container.replaceChildren(
    ...templates.map((template) => {
      const card = document.createElement('li');
      card.className = 'card';

      const link = document.createElement('a');
      link.href = `#${template.id}`;

      const name = document.createElement('h2');
      name.textContent = template.name;
      const summary = document.createElement('p');
      summary.textContent = template.summary;

      link.append(name, summary);
      card.append(link);
      return card;
    }),
  );
}
