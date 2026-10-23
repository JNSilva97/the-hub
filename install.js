// Installation and public app files use browser capabilities; private data stays in Firebase's cache.
(() => {
  const button = document.getElementById('install-app');
  const help = document.getElementById('install-help');
  const standalone = matchMedia('(display-mode: standalone)');
  let prompt;
  function render() {
    const installed = standalone.matches || navigator.standalone === true;
    button.disabled = installed;
    button.textContent = installed ? 'Installed' : 'Install';
    document.getElementById('install-note').textContent = installed ? 'Running as your home-screen app.' : 'Open your workspace from your home screen.';
  }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event; render(); });
  window.addEventListener('appinstalled', () => { prompt = undefined; help.hidden = false; help.textContent = 'The Hub is installed. Open it from your home screen or app launcher.'; render(); });
  standalone.addEventListener('change', render);
  button.addEventListener('click', async () => {
    help.hidden = false;
    if (prompt) {
      const available = prompt; prompt = undefined;
      try { await available.prompt(); const choice = await available.userChoice; help.textContent = choice.outcome === 'accepted' ? 'Installation accepted. Look for The Hub in your app launcher.' : 'Installation cancelled. You can install later from your browser menu.'; }
      catch { help.textContent = 'Open your browser menu and choose Install app or Add to Home Screen.'; }
    } else {
      help.textContent = 'iPhone / iPad: open this page in Safari, tap Share, then Add to Home Screen. Android: open the browser menu, then Install app or Add to Home screen. Desktop: use the install icon in the address bar or your browser menu. Open and sign in online once on each device before using checklists offline.';
    }
  });
  render();
  const offline = document.getElementById('offline-status');
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    offline.textContent = 'Offline startup is unavailable in this browser. Open The Hub over HTTPS.';
    return;
  }
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    function showStatus() {
      if (registration.waiting) offline.textContent = 'An app update is ready. Close all The Hub tabs and reopen to apply it.';
      else if (registration.active?.state === 'activated') offline.textContent = 'Offline app ready. Open your account checklists online once to keep them on this device.';
    }
    function watchInstall() {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && !registration.active) offline.textContent = 'Offline setup did not finish. Reopen online to try again.';
        else showStatus();
      });
    }
    watchInstall();
    registration.addEventListener('updatefound', watchInstall);
    showStatus();
  }).catch(() => { offline.textContent = 'Offline setup did not finish. Reopen online to try again.'; });
})();
