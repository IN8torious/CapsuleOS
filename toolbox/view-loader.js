export function createViewLoader() {
  const views = new WeakMap();
  return function loadView(root, load, mount) {
    if (!root) return Promise.reject(new Error('The requested Toolbox page is missing.'));
    if (views.has(root)) return views.get(root);
    const status = root.ownerDocument.createElement('div');
    status.className = 'view-load-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Loading page…';
    root.prepend(status);
    root.setAttribute('aria-busy', 'true');
    const task = Promise.resolve().then(load).then(module => mount(module, root)).then(() => {
      status.remove();
      root.removeAttribute('aria-busy');
      root.dataset.loadState = 'ready';
      return true;
    }).catch(error => {
      views.delete(root);
      root.removeAttribute('aria-busy');
      root.dataset.loadState = 'error';
      status.setAttribute('role', 'alert');
      status.textContent = `Unable to load this page: ${error instanceof Error ? error.message : String(error)}`;
      const retry = root.ownerDocument.createElement('button');
      retry.type = 'button';
      retry.className = 'button secondary';
      retry.textContent = 'Retry loading page';
      retry.addEventListener('click', () => { status.remove(); void loadView(root, load, mount); });
      status.append(retry);
      if (!status.isConnected) root.prepend(status);
      return false;
    });
    views.set(root, task);
    return task;
  };
}
