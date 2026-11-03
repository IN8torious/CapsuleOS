export async function initializeToolbox(load, doc = document) {
  doc.documentElement.dataset.toolboxState = 'loading';
  try {
    await load();
    doc.documentElement.dataset.toolboxState = 'ready';
    return true;
  } catch (error) {
    doc.documentElement.dataset.toolboxState = 'failed';
    doc.querySelector('.shell').inert = true;
    const notice = doc.createElement('div');
    notice.className = 'startup-error';
    notice.setAttribute('role', 'alert');
    const title = doc.createElement('strong');
    title.textContent = 'Capsule could not start.';
    const detail = doc.createElement('p');
    detail.textContent = error instanceof Error ? error.message : String(error);
    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Reload Toolbox';
    retry.addEventListener('click', () => doc.defaultView.location.reload());
    notice.append(title, detail, retry);
    doc.body.prepend(notice);
    console.error('Toolbox initialization failed:', error);
    return false;
  }
}

if (typeof document !== 'undefined') {
  void initializeToolbox(async () => {
    const { applyTheme, readTheme } = await import('./theme.js');
    try {
      applyTheme(readTheme(localStorage), document.documentElement, matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (error) {
      applyTheme('light', document.documentElement);
      document.querySelector('#toolbox-theme-status').textContent = `Theme preference unavailable: ${error.message}`;
    }
    await import('./main.js');
  });
}
