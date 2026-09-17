(() => {
  const allowedTags = new Set(['article', 'aside', 'blockquote', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'span', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul']);
  let page;
  let revision = 0;
  let scheduled = false;

  function post(message) {
    window.WorkspaceBridge?.postMessage(message);
  }

  function formView(form) {
    const view = document.createElement('form');
    view.className = 'web-preserved-form';
    const fields = [];
    form.fields.forEach((field) => {
      const input = document.createElement('input');
      input.className = 'input';
      input.name = field.name;
      input.placeholder = field.placeholder || field.label;
      input.setAttribute('aria-label', field.label);
      fields.push(input);
      view.append(input);
    });
    const submit = () => {
      try {
        const target = new URL(form.action);
        fields.forEach((field) => {
          if (field.value.trim()) target.searchParams.set(field.name, field.value.trim());
        });
        post({ type: 'webOpen', url: target.toString() });
      } catch {
        // The action URL was validated by the Extension Host; keep the form inert if it changes unexpectedly.
      }
    };
    view.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Search';
    view.append(button);
    return view;
  }

  function nodeView(node, forms) {
    if (node.tag === 'form') return forms.get(node.formId) ? formView(forms.get(node.formId)) : undefined;
    const tag = allowedTags.has(node.tag) ? node.tag : 'div';
    const element = node.href ? document.createElement('a') : document.createElement(tag);
    if (node.href) {
      element.href = '#';
      element.className = 'web-page-link';
      element.addEventListener('click', (event) => { event.preventDefault(); post({ type: 'webOpen', url: node.href }); });
    }
    if (node.text) element.textContent = node.text;
    node.children?.forEach((child) => {
      const rendered = nodeView(child, forms);
      if (rendered) element.append(rendered);
    });
    return element;
  }

  function decorateFullBrowserAction() {
    const action = Array.from(document.querySelectorAll('.game-bar button')).find((button) => button.textContent === 'Open External');
    if (!action) return;
    action.dataset.openFullBrowser = '';
    action.textContent = 'Full Browser';
  }

  function render() {
    // Browser v2 renders only the normalized Reader/Document/Source views in
    // workspace.js. Keeping this legacy preserved-DOM renderer inert prevents
    // raw site navigation and layout wrappers from returning to the page.
    return;
    if (!page?.content) return;
    const host = document.querySelector('.web-document');
    if (!host || host.dataset.preservedRevision === String(revision)) return;
    host.dataset.preservedRevision = String(revision);
    host.textContent = '';

    const title = document.createElement('h2');
    title.textContent = page.title;
    host.append(title);
    const source = document.createElement('p');
    source.className = 'muted';
    try { source.textContent = [page.siteName, new URL(page.finalUrl).hostname, page.byline].filter(Boolean).join(' · '); } catch { source.textContent = page.siteName || ''; }
    if (source.textContent) host.append(source);
    if (page.limitedContent) {
      const notice = document.createElement('p');
      notice.className = 'web-script-notice';
      notice.textContent = 'This page needs browser JavaScript or verification. Switch to Full Mode above; if the site blocks embedding, use Full Browser.';
      host.append(notice);
    }

    const forms = new Map((page.forms || []).map((form) => [form.id, form]));
    const content = document.createElement('section');
    content.className = 'web-page';
    page.content.forEach((node) => {
      const rendered = nodeView(node, forms);
      if (rendered) content.append(rendered);
    });
    host.append(content);
    decorateFullBrowserAction();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; render(); });
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'webPage') {
      page = event.data.page;
      revision += 1;
      schedule();
    }
  });
  new MutationObserver(schedule).observe(document.getElementById('app'), { childList: true, subtree: true });
})();
