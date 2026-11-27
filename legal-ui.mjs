import { legalConfig, legalPages, legalPublicationReady, contactEmail, contactCategories } from './legal-config.mjs';
import { publicLegalNotice } from './legal-public-notices.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const renderSections = sections => sections.map(section =>
  `<section class="legal-section"><h3>${esc(section.title)}</h3>${section.paragraphs.map(text => `<p>${esc(text)}</p>`).join('')}${
    section.links?.filter(link => link.url.startsWith('https://')).map(link =>
      `<p><a class="legal-mail" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.title)}</a></p>`
    ).join('') ?? ''
  }</section>`
).join('');
const reportCategory = 'Inhalt melden';
const privacyCategories = new Set(['Datenschutzanfragen', 'Auskunft über meine Daten', 'Kontolöschung anfragen']);

export function readLegalPage(hash = '') {
  const page = new URLSearchParams(String(hash).replace(/^#/, '')).get('legal');
  return Object.hasOwn(legalPages, page) ? page : null;
}

export function legalRouteHash(page, hash = '') {
  const original=String(hash).replace(/^#/,'');
  const parts=original?original.split('&').filter(part=>{
    try{return decodeURIComponent(part.split('=')[0].replace(/\+/g,' '))!=='legal';}catch{return true;}
  }):[];
  if (page!==null) {
    if(!Object.hasOwn(legalPages,page))throw new TypeError('Unbekannter rechtlicher Bereich');
    parts.push(`legal=${encodeURIComponent(page)}`);
  }
  const result = parts.join('&');
  return result ? `#${result}` : '';
}

function reportLink(hash, config) {
  const token = new URLSearchParams(hash.slice(1)).get('share');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return '';
  const url = new URL(config.website);
  url.search = '';
  url.hash = new URLSearchParams({ share: token }).toString();
  return url.href;
}

export function contactMailto(email, category, message = '', config = legalConfig) {
  const safe = contactEmail(email);
  if (!safe || !contactCategories.includes(category) || typeof message !== 'string') return '';
  return `mailto:${safe.split('@').map(encodeURIComponent).join('@')}?subject=${encodeURIComponent(`${config.appName} – ${category}`)}&body=${encodeURIComponent(message)}`;
}

const dateLabel = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short'}).format(date) : '';
};

export function createLegalUI({ analytics = null, config = legalConfig, win = window, doc = document } = {}) {
  const dialog = doc.createElement('dialog');
  dialog.className = 'dialog wide legal-dialog';
  dialog.id = 'legal-dialog';
  dialog.setAttribute('aria-labelledby','legal-dialog-title');
  dialog.innerHTML = '<form><div class="dialog-head"><div><h2 id="legal-dialog-title" tabindex="-1"></h2></div><button type="button" class="icon-button" data-legal-close aria-label="Schliessen">×</button></div><div class="dialog-body legal-body" tabindex="0"></div><div class="dialog-actions legal-actions"></div></form>';
  doc.body.append(dialog);
  const body = dialog.querySelector('.legal-body'), footer = dialog.querySelector('.legal-actions'), title = dialog.querySelector('h2');
  const banner = doc.createElement('aside');
  banner.className = 'consent-banner';
  banner.setAttribute('aria-labelledby','consent-banner-title');
  banner.hidden = true;
  banner.innerHTML = '<div class="consent-banner-copy"><h2 id="consent-banner-title">Deine Privatsphäre</h2><p>Wir verwenden notwendige Technologien, damit Lernkarten Maker zuverlässig funktioniert. Mit deiner Zustimmung nutzen wir Google Analytics 4 für freiwillige Nutzungsstatistiken. <a class="consent-privacy-link" href="#legal=privacy" data-legal-page="privacy">Datenschutzerklärung</a></p></div><div class="consent-banner-actions"><button type="button" class="quiet-button" data-consent-choice="accepted">Statistik erlauben</button><button type="button" class="quiet-button" data-consent-choice="necessary">Nur notwendige</button><button type="button" class="text-button" data-cookie-settings>Einstellungen</button></div><p class="legal-error" data-banner-error role="alert" hidden></p>';
  doc.body.append(banner);
  let page = null, generation = 0, busy = false, destroyed = false, opener = null;
  let documentModule;
  const available = () => analytics?.isAvailable?.() === true;
  const consent = () => analytics?.readConsent?.() || null;
  const setFooter = content => { footer.innerHTML = content; };
  const closeButton = '<button type="button" class="quiet-button" data-legal-close>Schliessen</button>';
  const showError = (message, target = body) => {
    let element = target.querySelector('[data-legal-error]');
    if (!element) { element=doc.createElement('p');element.className='legal-error';element.dataset.legalError='';element.setAttribute('role','alert');target.append(element); }
    element.textContent=message; element.hidden=false;
  };
  function bannerSpace() {
    const height=banner.hidden ? 0 : Math.ceil(banner.getBoundingClientRect().height)+16;
    doc.documentElement.style.setProperty('--consent-banner-space',`${height}px`);
    doc.body.toggleAttribute('data-consent-banner',!banner.hidden);
  }
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(bannerSpace) : null;
  observer?.observe(banner);
  function syncConsent() {
    if (destroyed) return;
    banner.hidden=!(available()&&!consent());
    bannerSpace();
    if (page === 'cookies' && !busy) renderCookies();
  }

  function setRoute(next) {
    const url=new URL(win.location.href);
    const oldURL=url.href;
    url.hash=legalRouteHash(next,url.hash);
    win.history.replaceState(win.history.state,'',url);
    syncRoute();
    if(oldURL!==url.href)win.dispatchEvent(new win.HashChangeEvent('hashchange',{oldURL,newURL:url.href}));
  }
  function open(next) {
    if (!Object.hasOwn(legalPages,next)) return false;
    if (!dialog.open) opener=doc.activeElement;
    if (page===next) render();
    else setRoute(next);
    return true;
  }
  function close() { if(!busy)setRoute(null); }
  function syncRoute() {
    const next=readLegalPage(win.location.hash);
    if(next===page)return;
    page=next;generation++;
    if(!page){dialog.close();if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;return;}
    if(!dialog.open)opener=doc.activeElement;
    render();
    if(!dialog.open)dialog.showModal();
    title.focus({preventScroll:true});
  }
  async function renderDocument() {
    if ((import.meta.env.PROD && !__LEGAL_DOCUMENTS_RELEASED__) || !legalPublicationReady(config)) {
      const notice = publicLegalNotice(page, config);
      body.innerHTML = `<div class="legal-notice"><h3>${esc(notice.title)}</h3><p>${esc(notice.status)}</p></div>
        ${renderSections(notice.sections)}
        ${notice.email ? `<p class="legal-contact-address"><a class="legal-mail" href="mailto:${esc(notice.email)}">${esc(notice.email)}</a></p>` : ''}`;
      setFooter(closeButton);
      return;
    }
    const version=generation,requestedPage=page;
    body.innerHTML='<p class="legal-status" role="status">Informationen werden geladen …</p>';setFooter(closeButton);
    try{
      const drafts = Object.values(import.meta.glob('./legal-content.mjs'))[0];
      if (!drafts) throw new Error('Legal document source unavailable');
      documentModule??=drafts();
      const {legalDrafts}=await documentModule;
      if(version!==generation||page!==requestedPage)return;
      const document=legalDrafts(config, undefined, {automaticDeletion: __ACCOUNT_DELETION_RELEASED__})[requestedPage];
      body.innerHTML=`<p class="legal-version">Stand ${esc(document.date)} · Version ${esc(document.version)}</p>${renderSections(document.sections)}`;
    }catch{documentModule=null;if(version===generation)showError('Die rechtlichen Informationen konnten nicht geladen werden. Bitte versuche es erneut.');}
  }
  function renderCookies() {
    const ready=available(), current=consent();
    body.innerHTML=`<p class="legal-intro">Du entscheidest über freiwillige Nutzungsstatistiken. Deine Lernfunktionen bleiben auch ohne Analyse verfügbar.</p><section class="cookie-category"><div><h3>Notwendige Technologien</h3><p>Anmeldung, Sicherheit, Benutzersitzung, App-Einstellungen, Cookie-Auswahl und technisch notwendige Funktionen.</p></div><span class="cookie-required">Immer aktiv</span></section><section class="cookie-category"><label for="legal-analytics-enabled"><h3>Statistik und Analyse</h3><p>Google Analytics 4 für allgemeine Besucherstatistiken und Funktionsnutzung. Keine Werbung und keine Übermittlung deiner Lerninhalte.</p></label><input id="legal-analytics-enabled" type="checkbox" ${ready&&current?.choice==='accepted'?'checked':''} ${ready?'':'disabled data-permanent-disabled="true"'} aria-describedby="legal-analytics-note"></section><p class="field-hint" id="legal-analytics-note">${ready?'Standardmässig deaktiviert. Du kannst deine Auswahl jederzeit ändern.':'Optionale Analyse ist derzeit nicht freigegeben oder in dieser Umgebung nicht verfügbar. Es werden keine Analytics-Skripte geladen.'}</p>${current?`<p class="legal-version">Letzte Auswahl: ${esc(dateLabel(current.updatedAt))}</p>`:''}`;
    setFooter(`${closeButton}<button type="button" class="quiet-button" data-consent-choice="necessary">Nur notwendige</button>${ready?'<button type="button" class="quiet-button" data-cookie-save>Auswahl speichern</button>':''}`);
  }
  function renderContact() {
    const reporting = page === 'report';
    const support = contactEmail(config.supportEmail) || contactEmail(config.operator?.email);
    const privacy = contactEmail(config.privacyEmail) || support;
    if (!support) {
      body.innerHTML = '<div class="legal-notice"><h3>Kontaktadresse noch nicht eingerichtet</h3><p>Sobald der Betreiber eine E-Mail-Adresse hinterlegt hat, kannst du eine Nachricht vorbereiten.</p></div>';
      setFooter(closeButton);
      return;
    }

    const share = reporting ? reportLink(win.location.hash, config) : '';
    body.innerHTML = reporting
      ? `<p class="legal-intro">Beschreibe in der E-Mail, welchen freigegebenen Lerninhalt wir prüfen sollen und warum.</p>${share ? `<p>Dieser Freigabelink wird im E-Mail-Entwurf ergänzt. Du kannst ihn vor dem Senden entfernen.</p><p>${esc(share)}</p>` : '<p>Füge deiner Nachricht den betreffenden Freigabelink bei, wenn du ihn hast.</p>'}`
      : `<p class="legal-intro">Wähle ein Thema für deine Nachricht an Lernkarten Maker.</p>
        <label class="field-label" for="legal-contact-category">Thema</label>
        <select id="legal-contact-category">${contactCategories.map(category => `<option>${esc(category)}</option>`).join('')}</select>`;
    body.insertAdjacentHTML('beforeend', `
      <p class="legal-contact-address"><a class="legal-mail"></a></p>
      <p class="field-hint" data-contact-hint></p>
      <p class="field-hint">«E-Mail vorbereiten» öffnet dein E-Mail-Programm. Du prüfst und versendest die Nachricht selbst.</p>`);
    setFooter(`${closeButton}<a class="quiet-button" data-contact-send>E-Mail vorbereiten</a>`);

    const categorySelect = body.querySelector('#legal-contact-category');
    const addressLink = body.querySelector('.legal-mail');
    const hint = body.querySelector('[data-contact-hint]');
    const action = footer.querySelector('[data-contact-send]');
    const updateEmail = () => {
      const category = reporting ? reportCategory : categorySelect.value;
      const requestingPrivacy = privacyCategories.has(category);
      const address = requestingPrivacy ? privacy : support;
      const message = share ? `Freigabelink: ${share}\r\n\r\n` : '';
      addressLink.textContent = address;
      addressLink.href = `mailto:${address}`;
      action.href = contactMailto(address, category, message, config);
      hint.textContent = requestingPrivacy
        ? 'Beschreibe zunächst dein Anliegen. Sende keine Passwörter, Zugangscodes oder Ausweiskopien per E-Mail. Falls nötig klären wir mit dir, wie wir deine Identität sicher prüfen können.'
        : 'Beschränke die Nachricht auf Angaben, die für dein Anliegen nötig sind.';
    };
    categorySelect?.addEventListener('change', updateEmail);
    updateEmail();
  }
  function render() {
    title.textContent=legalPages[page]||'Rechtliches';
    if(['privacy','terms','imprint'].includes(page))renderDocument();
    else if(page==='cookies')renderCookies();
    else if(page==='contact'||page==='report')renderContact();
    body.scrollTop=0;
  }
  async function choose(value, errorTarget = body) {
    if(busy)return;
    if(value==='accepted'&&!available())return;
    busy=true;
    try{
      const saved = value === 'necessary' && typeof analytics?.revoke === 'function'
        ? await analytics.revoke()
        : await analytics?.consent?.(value);
      if (saved === false) throw new Error('Auswahl nicht gespeichert');
      syncConsent();
      if(page==='cookies')renderCookies();
    }catch{
      if (page === 'cookies' && errorTarget === body) renderCookies();
      showError(value === 'necessary'
        ? 'Die Analyse ist in diesem Tab gestoppt. Dein Browser hat den dauerhaften Widerruf blockiert. Erlaube die Speicherung für diese Website und wähle erneut «Nur notwendige».'
        : 'Deine Zustimmung konnte nicht gespeichert werden. Prüfe die Browser-Einstellungen und versuche es erneut.',errorTarget);
    }
    finally{busy=false;}
  }
  dialog.querySelector('form').addEventListener('submit',event=>event.preventDefault());
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  const click=event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-legal-close'))close();
    else if(target.dataset.consentChoice)void choose(target.dataset.consentChoice,target.closest('.consent-banner')||body);
    else if(target.hasAttribute('data-cookie-settings'))open('cookies');
    else if(target.hasAttribute('data-cookie-save'))void choose(body.querySelector('#legal-analytics-enabled').checked?'accepted':'necessary');
  };
  dialog.addEventListener('click',click);banner.addEventListener('click',click);
  const externalClick=event=>{const button=event.target.closest('[data-legal-page]');if(button&&Object.hasOwn(legalPages,button.dataset.legalPage)){event.preventDefault();open(button.dataset.legalPage);}};
  doc.addEventListener('click',externalClick);
  win.addEventListener('hashchange',syncRoute);
  const unsubscribe=analytics?.subscribe?.(syncConsent);
  syncConsent();syncRoute();
  return {
    open,close,
    destroy(){destroyed=true;generation++;unsubscribe?.();observer?.disconnect();win.removeEventListener('hashchange',syncRoute);doc.removeEventListener('click',externalClick);dialog.remove();banner.remove();doc.body.removeAttribute('data-consent-banner');doc.documentElement.style.removeProperty('--consent-banner-space');}
  };
}
