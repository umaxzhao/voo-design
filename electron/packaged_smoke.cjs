const fs = require('node:fs');
const path = require('node:path');

module.exports = function attachSmoke(app, win) {
  if (!app.isPackaged || process.env.VOO_PACKAGED_SMOKE !== '1') return;
  const errors = [];
  const wc = win.webContents;
  wc.on('console-message', (_event, details, message) => {
    // Electron 43 supplies a details object; older releases used positional arguments.
    const level = typeof details === 'object' ? details.level : details;
    const text = typeof details === 'object' ? details.message : message;
    console.log('[renderer]', text);
    if (level === 'error' || level === 3) errors.push(text);
  });
  wc.on('render-process-gone', (_event, details) => errors.push(`Renderer exited: ${details.reason}`));
  const timeout = setTimeout(() => { console.error('PACKAGED_SMOKE_TIMEOUT'); app.exit(1); }, 60000);
  wc.once('did-finish-load', async () => {
    try {
      // Exercise the editor view through its existing UI (no project file operations).
      await wc.executeJavaScript(`document.querySelector('[data-testid="onboarding-close-btn"]')?.click();`);
      let rendered = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        rendered = await wc.executeJavaScript(`Boolean([...document.querySelectorAll('canvas')].some(c => c.width > 0 && c.height > 0 && c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().height > 0))`);
        if (rendered) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!rendered) throw new Error('No rendered canvas');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await wc.executeJavaScript(`document.querySelector('[data-testid="onboarding-close-btn"]')?.click(); document.querySelector('.app-title-bar button[title="返回画布"]')?.click();`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const visible = await wc.executeJavaScript(`Boolean([...document.querySelectorAll('canvas')].some(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0 && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === c; }))`);
      if (!visible) throw new Error('Editor canvas is covered or invisible');
      await wc.executeJavaScript(`window.dispatchEvent(new CustomEvent('voo:open-about'))`);
      let legalLoaded = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        legalLoaded = await wc.executeJavaScript(`document.querySelectorAll('[role="dialog"] details').length === 3`);
        if (legalLoaded) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!legalLoaded) throw new Error('About license documents did not load');
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
      await new Promise(resolve => setTimeout(resolve, 250));
      const screenshot = process.env.VOO_SMOKE_SCREENSHOT;
      if (!screenshot || !path.isAbsolute(screenshot)) throw new Error('Absolute screenshot path required');
      fs.mkdirSync(path.dirname(screenshot), { recursive: true });
      fs.writeFileSync(screenshot, (await wc.capturePage()).toPNG());
      if (errors.length) throw new Error(`Console errors: ${errors.join('\n')}`);
      console.log('PACKAGED_SMOKE_OK canvas rendered; console errors: 0');
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) { console.error('PACKAGED_SMOKE_FAILED', error); clearTimeout(timeout); app.exit(1); }
  });
};
