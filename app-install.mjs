// Browsers expose installation only when the current page is eligible. Keep
// that one-use prompt until the user explicitly chooses to install.
export function bindAppInstall({ win = window, doc = document } = {}) {
  const section = doc.querySelector('#app-install');
  if (!section) return () => {};

  const button = section.querySelector('#app-install-button');
  const description = section.querySelector('#app-install-description');
  const help = section.querySelector('#app-install-help');
  const status = section.querySelector('#app-install-status');
  const standalone = win.matchMedia('(display-mode: standalone)');
  let offeredPrompt = null;
  let installedHere = false;
  let prompting = false;

  function isStandalone() {
    return standalone.matches || win.navigator.standalone === true;
  }

  function render() {
    const installed = installedHere || isStandalone();
    button.hidden = installed || !offeredPrompt;
    button.disabled = prompting;
    button.setAttribute('aria-busy', String(prompting));
    help.hidden = installed;
    description.textContent = isStandalone()
      ? 'Du verwendest die App bereits in einem eigenen Fenster.'
      : installedHere
        ? 'Die App wurde auf diesem Gerät hinzugefügt. Öffne sie über ihr neues Symbol.'
        : 'Füge die App kostenlos zu deinem Home-Bildschirm, Dock oder Startmenü hinzu. Zum Anmelden und Laden deiner Bibliothek brauchst du eine Internetverbindung.';
  }

  function offer(event) {
    if (typeof event.prompt !== 'function') return;
    event.preventDefault();
    offeredPrompt = event;
    installedHere = false;
    status.textContent = '';
    render();
  }

  async function install() {
    if (!offeredPrompt || prompting) return;
    const prompt = offeredPrompt;
    prompting = true;
    render();
    try {
      // Calling prompt in the click handler preserves the browser's required
      // user activation. An event can be used only once, including dismissal.
      const response = await prompt.prompt();
      const choice = response || await prompt.userChoice;
      if (!installedHere) {
        status.textContent = choice?.outcome === 'accepted'
          ? 'Dein Gerät übernimmt die Installation.'
          : 'Du kannst die App später über das Browser-Menü hinzufügen.';
      }
    } catch {
      if (!installedHere) {
        status.textContent = 'Die Installation konnte nicht geöffnet werden. Verwende die Anleitung für dein Gerät.';
        help.open = true;
      }
    } finally {
      if (offeredPrompt === prompt) offeredPrompt = null;
      prompting = false;
      render();
    }
  }

  function installed() {
    installedHere = true;
    offeredPrompt = null;
    status.textContent = 'App erfolgreich hinzugefügt.';
    render();
  }

  function displayModeChanged() {
    status.textContent = '';
    render();
  }

  win.addEventListener('beforeinstallprompt', offer);
  win.addEventListener('appinstalled', installed);
  standalone.addEventListener('change', displayModeChanged);
  button.addEventListener('click', install);
  render();

  return () => {
    win.removeEventListener('beforeinstallprompt', offer);
    win.removeEventListener('appinstalled', installed);
    standalone.removeEventListener('change', displayModeChanged);
    button.removeEventListener('click', install);
  };
}
