// Installation is a browser capability; cloud synchronization still needs a connection.
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
      help.textContent = 'iPhone / iPad: open this page in Safari, tap Share, then Add to Home Screen. Android: open the browser menu, then Install app or Add to Home screen. Desktop: use the install icon in the address bar or your browser menu. Account sync needs an internet connection; wait for “synced” before closing.';
    }
  });
  render();
})();
