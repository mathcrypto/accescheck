function element(tag, className = '') {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
function inline(container, text) {
  text.split(/\*\*(.+?)\*\*/g).forEach((part, index) => {
    if (index % 2) {
      const strong = element('strong');
      strong.textContent = part;
      container.append(strong);
    } else container.append(document.createTextNode(part));
  });
}
// shortcut: one list level; use a Markdown renderer if nested lists or tables are requested.
export function renderMessage(container, text) {
  container.replaceChildren();
  let lines = [];
  let list = null;
  const paragraph = () => {
    if (!lines.length) return;
    const node = element('p');
    inline(node, lines.join('\n'));
    container.append(node);
    lines = [];
  };
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*(?:([-*•])|(\d{1,9})[.)])\s+(.+)$/);
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (item) {
      paragraph();
      const tag = item[2] ? 'OL' : 'UL';
      if (list?.tagName !== tag) {
        list = element(tag.toLowerCase(), 'message-list');
        container.append(list);
      }
      const row = element('li');
      if (item[2]) row.value = Number(item[2]);
      inline(row, item[3]);
      list.append(row);
    } else if (!line.trim()) paragraph();
    else {
      list = null;
      if (heading) {
        paragraph();
        const title = element('h3');
        inline(title, heading[1]);
        container.append(title);
      } else lines.push(line);
    }
  }
  paragraph();
}
export function renderRecap(container, text) {
  container.replaceChildren();
  const title = element('h3');
  title.textContent = 'Votre recherche';
  const list = element('ul');
  for (const line of text.split('\n').filter((line) => line.trim())) {
    const row = element('li');
    row.textContent = line;
    list.append(row);
  }
  container.append(title, list);
}
