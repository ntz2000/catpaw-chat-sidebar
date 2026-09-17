(() => {
  let currentUrl = '';
  let fullMode = false;
  let scheduled = false;

  function toolbar() {
    return document.querySelector('.web-toolbar');
  }

  function currentAddress() {
    const input = toolbar()?.querySelector('input');
    return currentUrl || input?.value.trim() || '';
  }

  function findBar() {
    return document.querySelector('input[placeholder="Find in page"]')?.closest('.game-bar');
  }

  function actionBar() {
    return Array.from(document.querySelectorAll('.game-bar')).find((bar) => bar.querySelector('button'));
  }

  function frameEmbeddingBlocked() {
    return document.querySelector('.page')?.dataset.frameEmbeddingBlocked === 'true';
  }

  function ensureIdeBrowserAction() {
    const actions = actionBar();
    if (!actions) return;
    let button = actions.querySelector('[data-open-ide-browser]');
    if (frameEmbeddingBlocked()) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.openIdeBrowser = '';
      button.textContent = 'Interactive Browser';
      button.addEventListener('click', () => {
        const address = currentAddress();
        if (address) window.WorkspaceBridge?.postMessage({ type: 'webOpenIntegrated', url: address });
      });
      actions.append(button);
    }
  }

  function frameView() {
    const host = document.querySelector('.web-document');
    const address = currentAddress();
    if (!host || !address) return;
    host.hidden = fullMode;
    const finder = findBar();
    if (finder) finder.hidden = fullMode;
    let view = document.querySelector('.web-full-view');
    if (!fullMode) {
      view?.remove();
      return;
    }
    if (!view) {
      view = document.createElement('section');
      view.className = 'web-full-view';
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.textContent = 'Embedded Mode loads the site directly. Some sites block embedded pages or require login; use Interactive Browser for those sites.';
      const frame = document.createElement('iframe');
      frame.className = 'web-full-frame';
      frame.title = 'Full web page';
      frame.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      view.append(hint, frame);
      host.after(view);
    }
    const frame = view.querySelector('.web-full-frame');
    if (frame?.dataset.url !== address) {
      frame.dataset.url = address;
      frame.src = address;
    }
  }

  function ensureToggle() {
    const bar = toolbar();
    if (!bar) return;
    let toggle = bar.parentElement?.querySelector('[data-web-mode-toggle]');
    if (frameEmbeddingBlocked()) {
      toggle?.remove();
      document.querySelector('.web-full-view')?.remove();
      ensureIdeBrowserAction();
      return;
    }
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.dataset.webModeToggle = '';
      toggle.className = 'web-mode-toggle';
      toggle.addEventListener('click', () => {
        fullMode = !fullMode;
        schedule();
      });
      bar.after(toggle);
    }
    const label = fullMode ? 'Text Mode' : 'Full Mode';
    if (toggle.textContent !== label) toggle.textContent = label;
    ensureIdeBrowserAction();
    frameView();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      ensureToggle();
    });
  }

  window.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'bootstrap' || message.type === 'app') currentUrl = message.app?.web?.current?.url || message.data?.web?.current?.url || currentUrl;
    if (message.type === 'webLoading') currentUrl = message.url || currentUrl;
    if (message.type === 'webPage') currentUrl = message.page?.finalUrl || currentUrl;
    schedule();
  });
  new MutationObserver(schedule).observe(document.getElementById('app'), { childList: true, subtree: true });
})();
