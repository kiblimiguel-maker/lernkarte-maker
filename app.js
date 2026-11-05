import { supabase } from './supabaseClient.js';
import { cardListPage, libraryCardCounts } from './library-view.mjs';
import { studyKeyboardAction } from './study-keyboard.mjs';
import { DONATION_PRESETS_CENTS, formatDonationAmount, markDonationWelcomeShown, parseDonationAmountCents, shouldShowDonationWelcome, setDonationReminderEnabled, isDonationReminderEnabled } from './donation-values.mjs';

(() => {
  'use strict';
  const palette = [
    ['#3378F6','Kobaltblau'],['#0AA4CF','Azur'],['#00A88F','Jade'],['#26A65B','Smaragd'],
    ['#99B62A','Limette'],['#E7A623','Safran'],['#EE7937','Mandarine'],['#DC4D5A','Koralle'],
    ['#CE458B','Himbeere'],['#9359DB','Amethyst'],['#6264DA','Indigo'],['#77889E','Schiefer']
  ];
  const colors = palette.map(([hex])=>hex);
  const safeColor = (value,fallback=colors[0]) => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const cardThemes = window.WortwerkCardThemes;
  let activeCardThemeId = cardThemes.readThemeId();
  cardThemes.applyTheme(activeCardThemeId);
  const emojiChoices = [
    ['📚','lernen buch bücher bildung','Lernen'],['📖','buch lesen','Lernen'],['✏️','stift schreiben','Lernen'],['📝','notizen schreiben','Lernen'],['🎓','abschluss schule','Lernen'],['💡','idee wissen','Lernen'],['🧠','gehirn wissen','Lernen'],['🔬','wissenschaft labor','Lernen'],['🧪','chemie labor','Lernen'],['🧮','mathe rechnen','Lernen'],['💻','computer informatik','Lernen'],['🌍','welt erde geografie','Lernen'],
    ['🇬🇧','england flagge englisch sprache','Sprachen'],['🇫🇷','frankreich flagge französisch sprache','Sprachen'],['🇪🇸','spanien flagge spanisch sprache','Sprachen'],['🇮🇹','italien flagge italienisch sprache','Sprachen'],['🇩🇪','deutschland flagge deutsch sprache','Sprachen'],['🗣️','sprechen sprache','Sprachen'],['💬','dialog sprache','Sprachen'],['🔤','buchstaben alphabet','Sprachen'],['📜','geschichte dokument','Sprachen'],['✍️','schreiben text','Sprachen'],
    ['😀','lächeln gesicht froh','Menschen'],['😎','cool gesicht','Menschen'],['🤓','brille klug','Menschen'],['👩‍🏫','lehrerin schule','Menschen'],['👨‍🏫','lehrer schule','Menschen'],['🧑‍🎓','schüler studium','Menschen'],['❤️','herz liebe','Menschen'],['⭐️','stern','Menschen'],['🏆','pokal erfolg','Menschen'],['🎯','ziel fokus','Menschen'],
    ['🌱','pflanze wachsen natur','Natur'],['🌿','blatt natur','Natur'],['🌸','blume natur','Natur'],['🌞','sonne natur','Natur'],['🌙','mond nacht','Natur'],['🌈','regenbogen natur','Natur'],['🌊','meer wasser','Natur'],['🔥','feuer energie','Natur'],['🦋','schmetterling tier','Natur'],['🐝','biene tier','Natur'],['🐈','katze tier','Natur'],['🦉','eule tier','Natur'],
    ['⚽️','fußball sport','Aktivitäten'],['🏀','basketball sport','Aktivitäten'],['🎨','kunst malen','Aktivitäten'],['🎵','musik noten','Aktivitäten'],['🎸','gitarre musik','Aktivitäten'],['🎭','theater kunst','Aktivitäten'],['♟️','schach spiel','Aktivitäten'],['🚀','rakete weltraum','Aktivitäten'],['✈️','flugzeug reisen','Aktivitäten'],['🏛️','gebäude geschichte','Aktivitäten'],['⏳','zeit sanduhr','Aktivitäten'],['🔑','schlüssel','Aktivitäten']
  ];
  const icons = ['📚','🌐','📐','🏛️','🧪','🎨'];
  const $ = (s, root=document) => root.querySelector(s);
  const STUDY_SWIPE_MS = (() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--study-swipe-duration').trim();
    const duration = Number.parseFloat(value);
    return Number.isFinite(duration) ? duration * (value.endsWith('ms') ? 1 : 1000) : 510;
  })();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const initial = () => ({subjects:[],folders:[],sets:[],cards:[],recent:[],studySessions:{},studyHistory:[]});
  let donationReturn = (() => {
    const url = new URL(window.location.href);
    const type = url.searchParams.get('donation') || url.searchParams.get('support');
    if (type !== 'success' && type !== 'cancelled') return null;
    const sessionId = url.searchParams.get('session_id') || '';
    url.searchParams.delete('donation');
    url.searchParams.delete('support');
    url.searchParams.delete('session_id');
    window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
    return { type, sessionId };
  })();
  let donationPayment = donationReturn?.type === 'success' ? { status: 'checking' } : null;
  let donationStatusChecking = false;
  let donationAmountCents = 1000;
  let donationSubmitting = false;
  let donationCheckoutAvailable = null;
  let donationReadinessRequest = null;
  let donationCheckoutRequestId = null;
  let donationGreetingDismissed = false;
  let data = initial(), activeSubject = null, activeFolder = null, activeSet = null, view = donationReturn ? 'donations' : 'library';
  let librarySorting = false, librarySortSaving = false, entitySaving = false;
  let cardCounts=new Map(),cardListSetId=null,cardListQuery='',cardListLimit=100,recoveryAwaitingChoice=false;
  // Sidebar disclosure is independent from the current library location.
  const expandedSidebarSubjects = new Set();
  let formContext = null, importRows = [], importChecked = false, importHasErrors = false, importErrors=[],importPreviewLimit=100, session = null;
  function save(){const pending=window.WortwerkRepository.saveLibrary(data);pending.catch(()=>{});return pending}
  const subject = key => data.subjects.find(x=>x.id===key);
  const folder = key => data.folders.find(x=>x.id===key);
  const setById = key => data.sets.find(x=>x.id===key);
  const setCards = key => data.cards.filter(x=>x.setId===key).sort((a,b)=>(a.position??0)-(b.position??0));
  const subjectSets = key => data.sets.filter(x=>x.subjectId===key);
  const subjectFolders = key => data.folders.filter(x=>x.subjectId===key);
  function cardSideContent(card,side){
    const text=String(card?.[side]??'');
    const savedExample=String(card?.[`${side}ExampleSentence`]??'').trim();
    if(savedExample)return{term:text,exampleSentence:savedExample};
    return window.WortwerkParser.parseExampleSide(text)||{term:text,exampleSentence:''};
  }
  function cardSideMarkup(card,side){
    const content=cardSideContent(card,side);
    return `<span class="card-content-main">${genderMarkup(content.term)}</span>${content.exampleSentence?`<span class="card-example">(${esc(content.exampleSentence)})</span>`:''}`;
  }
  function genderMarkup(value){return window.WortwerkPresentation.genderSegments(value).map(segment=>`<span${segment.gender?` class="gender-${segment.gender==='m'?'masculine':'feminine'}"`:''}>${esc(segment.text)}</span>`).join('')}
  function describeCardSide(card,side){
    const content=cardSideContent(card,side);
    return `${side==='back'?'Rückseite':'Vorderseite'}: ${content.term}${content.exampleSentence?`. Beispielsatz: ${content.exampleSentence}`:''}`;
  }
  function populateStudyCard(slot,card){
    const front=cardSideContent(card,'front'),back=cardSideContent(card,'back');
    slot.frontText.innerHTML=genderMarkup(front.term);slot.frontExampleText.textContent=front.exampleSentence?`(${front.exampleSentence})`:'';slot.frontExampleText.hidden=!front.exampleSentence;
    slot.backText.innerHTML=genderMarkup(back.term);slot.backExampleText.textContent=back.exampleSentence?`(${back.exampleSentence})`:'';slot.backExampleText.hidden=!back.exampleSentence;
  }
  function toast(message){const inline=$('#form-save-error');if($('#form-dialog')?.open&&inline){inline.textContent=message;inline.hidden=false;return}const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),2400)}
  function cardThemePreview(theme){
    return `<span class="card-theme-preview" aria-hidden="true">${['front','back'].map(side=>{const color=theme[side];return `<span class="card-theme-preview-face" style="--preview-surface:${color.surface};--preview-text:${color.text};--preview-muted:${color.muted};--preview-border:${color.border};--preview-gender-m:${color['gender-masculine']};--preview-gender-f:${color['gender-feminine']}"><span class="card-theme-preview-label">${side==='front'?'Vorderseite':'Rückseite'}</span><span class="card-theme-preview-term"><span class="gender-${side==='front'?'masculine':'feminine'}">${side==='front'?'un':'une'}</span> ${side==='front'?'livre':'maison'}</span><span class="card-theme-preview-example">(${side==='front'?'un livre ancien':'une maison calme'})</span></span>`}).join('')}</span>`;
  }
  function renderCardThemeOptions(){
    $('#card-theme-options').innerHTML=cardThemes.themes.map(theme=>`<label class="card-theme-option${theme.id===activeCardThemeId?' is-selected':''}"><input class="card-theme-radio" type="radio" name="card-theme" value="${esc(theme.id)}"${theme.id===activeCardThemeId?' checked':''}><span class="card-theme-option-copy"><span class="card-theme-option-heading"><strong>${esc(theme.name)}</strong><span class="card-theme-selected-label" aria-live="polite">${theme.id===activeCardThemeId?'Ausgewählt':''}</span></span><small>${esc(theme.description)}</small>${cardThemePreview(theme)}</span></label>`).join('');
  }
  function applySelectedCardTheme(themeId){
    const result=cardThemes.saveTheme(themeId);
    activeCardThemeId=cardThemes.applyTheme(result.theme.id);
    document.querySelectorAll('.card-theme-option').forEach(option=>{
      const selected=option.querySelector('.card-theme-radio').value===activeCardThemeId;
      option.classList.toggle('is-selected',selected);
      option.querySelector('.card-theme-selected-label').textContent=selected?'Ausgewählt':'';
    });
    if(!result.persisted)toast('Farbschema übernommen. Die dauerhafte Speicherung ist in diesem Browser nicht verfügbar.');render();
  }
  function render(){
    cardCounts=libraryCardCounts(data.cards);
    if(view!=='library'||activeSet)librarySorting=false;
    renderNav();
    $('#content').classList.toggle('is-sorting',librarySorting);$('#content').inert=librarySortSaving||recoveryAwaitingChoice;$('#content').setAttribute('aria-busy',String(librarySortSaving));
    if(view==='donations'){
      activeSubject=null;activeFolder=null;activeSet=null;renderDonations();return;
    }
    if(activeSet&&setById(activeSet)){renderSet();return}
    if(activeFolder&&folder(activeFolder)){renderFolder();return}
    if(activeSubject&&subject(activeSubject)){renderSubject();return}
    renderLibrary();
    if(view==='library')renderDonationWelcome();
  }
  function renderNav(){
    document.querySelectorAll('[data-view]').forEach(button=>button.onclick=event=>{
      event.preventDefault();closeNavigation();librarySorting=false;activeSubject=null;activeFolder=null;activeSet=null;view=button.dataset.view;if(view!=='donations'){donationReturn=null;donationPayment=null}render();
    });
    const atLibraryRoot=!activeSubject&&!activeFolder&&!activeSet;
    document.querySelectorAll('.app-sidebar [data-view]').forEach(button=>{
      const current=button.dataset.view==='recent'?view==='recent':button.dataset.view==='donations'?view==='donations':button.dataset.view==='library'&&view==='library'&&atLibraryRoot;
      if(current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    $('#sidebar-subjects').innerHTML=data.subjects.map((item,index)=>{
      const hasFolders=subjectFolders(item.id).length>0,expanded=hasFolders&&expandedSidebarSubjects.has(item.id),listId=`sidebar-folders-${index}`;
      return `<div class="sidebar-subject-group"><div class="sidebar-subject-row${expanded?' is-expanded':''}"><button class="sidebar-subject-open" data-sidebar-subject="${esc(item.id)}" data-drop-folder="" data-drop-subject="${esc(item.id)}" ${view==='library'&&activeSubject===item.id&&!activeFolder?'aria-current="page"':''}${hasFolders?` aria-expanded="${expanded}" aria-controls="${listId}"`:''}><span class="sidebar-dot" style="--dot:${safeColor(item.color)}"></span><span>${esc(item.name)}</span></button>${hasFolders?`<button class="sidebar-subject-toggle" type="button" data-sidebar-toggle="${esc(item.id)}" aria-expanded="${expanded}" aria-controls="${listId}" aria-label="Ordner in ${esc(item.name)} ${expanded?'einklappen':'anzeigen'}" title="Ordner ${expanded?'einklappen':'anzeigen'}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`:''}</div>${hasFolders?`<div class="sidebar-folder-list" id="${listId}"${expanded?'':' hidden'}>${sidebarFolders(item.id)}</div>`:''}</div>`;
    }).join('')||'<p class="sidebar-empty">Deine Fächer erscheinen hier.</p>';
    document.querySelectorAll('[data-sidebar-subject]').forEach(button=>button.onclick=()=>{
      const subjectId=button.dataset.sidebarSubject,alreadyHere=view==='library'&&activeSubject===subjectId&&!activeFolder&&!activeSet;
      if(alreadyHere&&expandedSidebarSubjects.has(subjectId))expandedSidebarSubjects.delete(subjectId);else expandedSidebarSubjects.add(subjectId);
      closeNavigation();librarySorting=false;view='library';activeSubject=subjectId;activeFolder=null;activeSet=null;render();
    });
    document.querySelectorAll('[data-sidebar-toggle]').forEach(button=>button.onclick=()=>{
      const subjectId=button.dataset.sidebarToggle;
      if(expandedSidebarSubjects.has(subjectId))expandedSidebarSubjects.delete(subjectId);else expandedSidebarSubjects.add(subjectId);
      render();
      document.querySelector(`[data-sidebar-toggle="${CSS.escape(subjectId)}"]`)?.focus();
    });
    document.querySelectorAll('[data-sidebar-folder]').forEach(button=>button.onclick=()=>{closeNavigation();librarySorting=false;view='library';activeFolder=button.dataset.sidebarFolder;activeSubject=folder(activeFolder)?.subjectId;activeSet=null;render()});
    crumbs(view==='recent'?['Zuletzt gelernt']:view==='donations'?['Bibliothek','Spenden']:['Bibliothek']);
  }
  const mobileNavigation=window.matchMedia('(max-width:760px)');
  let sidebarCollapsed=false;try{sidebarCollapsed=localStorage.getItem('lernkarten-sidebar-collapsed')==='true'}catch{}
  $('#app-shell').classList.toggle('sidebar-collapsed',sidebarCollapsed);
  function syncNavigation(){const open=$('#app-shell').classList.contains('navigation-open')&&mobileNavigation.matches;$('#app-navigation').inert=mobileNavigation.matches?!open:sidebarCollapsed;$('.main-area').inert=open;$('#navigation-scrim').hidden=!open;$('#navigation-toggle').setAttribute('aria-expanded',String(mobileNavigation.matches?open:!sidebarCollapsed));$('#navigation-toggle').setAttribute('aria-label',mobileNavigation.matches?'Navigation öffnen':sidebarCollapsed?'Seitenleiste einblenden':'Seitenleiste ausblenden');if(open){$('#app-navigation').setAttribute('role','dialog');$('#app-navigation').setAttribute('aria-modal','true')}else{$('#app-navigation').removeAttribute('role');$('#app-navigation').removeAttribute('aria-modal')}}
  function closeNavigation(){const wasOpen=$('#app-shell').classList.contains('navigation-open');$('#app-shell').classList.remove('navigation-open');syncNavigation();if(wasOpen)$('#navigation-toggle').focus()}
  $('#navigation-toggle').onclick=()=>{if(!mobileNavigation.matches){sidebarCollapsed=!sidebarCollapsed;$('#app-shell').classList.toggle('sidebar-collapsed',sidebarCollapsed);try{localStorage.setItem('lernkarten-sidebar-collapsed',String(sidebarCollapsed))}catch{}syncNavigation();return}$('#app-shell').classList.add('navigation-open');syncNavigation();$('#navigation-close').focus()};
  $('#navigation-scrim').onclick=closeNavigation;$('#navigation-close').onclick=closeNavigation;
  mobileNavigation.addEventListener('change',()=>{if(!mobileNavigation.matches)$('#app-shell').classList.remove('navigation-open');syncNavigation()});syncNavigation();
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeNavigation();document.querySelector('.account-menu')?.removeAttribute('open')}if(event.key==='Tab'&&$('#app-shell').classList.contains('navigation-open')&&mobileNavigation.matches){const controls=[...$('#app-navigation').querySelectorAll('a,button')].filter(element=>!element.disabled&&element.getClientRects().length),first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
  function renderDonations(){
    const resultMarkup=donationReturn?.type==='cancelled'
      ? '<div class="donation-result is-neutral" role="status">Der Checkout wurde abgebrochen. Du kannst jederzeit ohne Spende zur App zurückkehren.</div>'
      : donationReturn?.type==='success'
        ? donationPayment?.status==='paid'
          ? `<div class="donation-result is-success" role="status"><strong>Vielen Dank für deine Spende!</strong><span>Deine Spende über ${esc(formatDonationAmount(donationPayment.amountCents))} hilft dabei, Lernkarten Maker weiterzuentwickeln.</span></div>`
          : donationPayment?.status==='pending'
            ? '<div class="donation-result" role="status">Stripe verarbeitet die Spende noch. Der bestätigte Betrag erscheint hier, sobald Stripe die Zahlung bestätigt hat.</div>'
            : donationPayment?.status==='unavailable'
              ? '<div class="donation-result" role="status">Der Zahlungsstatus ist gerade nicht erreichbar. Eine Spende wird erst nach Bestätigung durch Stripe angezeigt.</div>'
            : donationPayment?.status==='failed'||donationPayment?.status==='expired'
              ? '<div class="donation-result is-neutral" role="status">Die Zahlung wurde nicht abgeschlossen. Es wurde keine Spende bestätigt.</div>'
              : '<div class="donation-result" role="status" aria-live="polite">Zahlungsstatus wird sicher bei Stripe geprüft …</div>'
        : '';
    const selected=donationAmountCents;
    $('#content').innerHTML=`<section class="donation-page" aria-labelledby="donation-title"><div class="donation-heading"><div class="eyebrow">FREIWILLIG UND EINMALIG</div><h1 class="page-title" id="donation-title">Lernkarten Maker unterstützen</h1><p class="page-subtitle">Lernkarten Maker ist kostenlos und soll es auch bleiben. Wenn dir die App gefällt, hilft deine freiwillige Spende dabei, sie weiterzuentwickeln.</p></div><div class="donation-layout"><section class="donation-panel" aria-labelledby="donation-amount-title"><h2 id="donation-amount-title">Eine Spende geben</h2><p class="donation-panel-copy">Wähle einen Betrag. Jede Zahlung ist einmalig; es gibt keine Abos und keine zusätzlichen Funktionen durch eine Spende.</p><fieldset class="donation-amount-group"><legend class="field-label">Vorgeschlagener Betrag</legend><div class="donation-amount-options">${DONATION_PRESETS_CENTS.map(cents=>`<button class="donation-amount-option${selected===cents?' is-selected':''}" type="button" data-donation-amount="${cents}" aria-pressed="${selected===cents}">${esc(formatDonationAmount(cents))}</button>`).join('')}</div></fieldset><label class="field-label donation-custom-label" for="donation-custom-amount">Oder eigener Betrag</label><div class="donation-custom-input"><span aria-hidden="true">CHF</span><input id="donation-custom-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="z. B. 12.50" aria-describedby="donation-custom-hint"></div><p class="field-hint" id="donation-custom-hint">Mindestens CHF 0.50. Das Stripe-Limit liegt bei CHF 999’999.99.</p><button class="primary-button donation-submit" id="donation-submit" type="button" disabled aria-busy="${donationCheckoutAvailable===null}" >${donationCheckoutAvailable===true?`Sicher spenden · ${esc(formatDonationAmount(selected))}`:donationCheckoutAvailable===false?'Spenden derzeit nicht verfügbar':'Zahlungsanbindung wird geprüft …'}</button><p class="donation-setup-note donation-result is-neutral" id="donation-setup-note" role="status" aria-live="polite" hidden></p><p class="donation-assurance">Die Zahlung wird sicher über Stripe abgewickelt. Lernkarten Maker speichert keine Karten- oder Zahlungsdaten. Die App bleibt vollständig kostenlos.</p>${resultMarkup}${donationReturn?.type==='success'&&['pending','unavailable'].includes(donationPayment?.status)?'<button class="text-button donation-recheck" id="donation-recheck" type="button">Zahlungsstatus erneut prüfen</button>':''}<p class="donation-error" id="donation-error" role="alert" hidden></p></section><aside class="donation-note"><div class="donation-note-mark" aria-hidden="true">♡</div><h2>Freiwillig. Einmalig. Für alle kostenlos.</h2><p>Jede Unterstützung hilft. Vielen Dank! Du kannst Lernkarten Maker auch ohne Spende vollständig nutzen.</p><button class="text-button" type="button" id="donation-library">Weiter zur App</button></aside></div></section>`;
    document.querySelectorAll('[data-donation-amount]').forEach(button=>button.addEventListener('click',()=>{
      donationAmountCents=Number(button.dataset.donationAmount);donationCheckoutRequestId=null;
      const custom=$('#donation-custom-amount');if(custom)custom.value='';
      renderDonations();
    }));
    $('#donation-custom-amount')?.addEventListener('input',event=>{
      const raw=event.currentTarget.value,parsed=parseDonationAmountCents(raw);
      if(parsed!==null){donationAmountCents=parsed;donationCheckoutRequestId=null}
      else if(raw.trim()){donationAmountCents=null;donationCheckoutRequestId=null}
      document.querySelectorAll('[data-donation-amount]').forEach(button=>{const active=Number(button.dataset.donationAmount)===donationAmountCents;button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active))});
      updateDonationButton();
    });
    $('#donation-submit')?.addEventListener('click',startDonationCheckout);
    $('#donation-library')?.addEventListener('click',()=>{donationReturn=null;donationPayment=null;view='library';render()});
    $('#donation-recheck')?.addEventListener('click',refreshDonationPaymentStatus);
    updateDonationButton();
    checkDonationReadiness();
    if(donationReturn?.type==='success'&&donationPayment?.status==='checking'&&!donationStatusChecking)refreshDonationPaymentStatus();
  }
  function renderDonationWelcome(){
    if(donationGreetingDismissed||!shouldShowDonationWelcome())return;
    markDonationWelcomeShown();
    const welcome=document.createElement('section');
    welcome.className='donation-welcome';welcome.setAttribute('aria-labelledby','donation-welcome-title');
    welcome.innerHTML=`<div class="donation-welcome-copy"><div class="eyebrow">EIN FREIWILLIGER BEITRAG</div><h2 id="donation-welcome-title">Schön, dass du Lernkarten Maker nutzt!</h2><p>Lernkarten Maker ist kostenlos und soll es auch bleiben. Wenn dir die App gefällt und du die Weiterentwicklung unterstützen möchtest, kannst du freiwillig eine Spende geben. Jede Unterstützung hilft. Vielen Dank!</p></div><div class="donation-welcome-actions"><button type="button" class="primary-button" data-donation-welcome="donate">Jetzt spenden</button><button type="button" class="quiet-button" data-donation-welcome="continue">Weiter zur App</button></div><button type="button" class="icon-button donation-welcome-close" data-donation-welcome="continue" aria-label="Begrüssung schliessen" title="Schliessen">×</button>`;
    $('#content').prepend(welcome);
    welcome.querySelectorAll('[data-donation-welcome]').forEach(button=>button.addEventListener('click',()=>{
      donationGreetingDismissed=true;
      if(button.dataset.donationWelcome==='donate'){view='donations';activeSubject=null;activeFolder=null;activeSet=null}
      else welcome.remove();
      render();
    }));
  }
  function updateDonationButton(){
    const button=$('#donation-submit');if(!button)return;
    const valid=Number.isSafeInteger(donationAmountCents)&&donationAmountCents>=50&&donationAmountCents<=99_999_999;
    const available=donationCheckoutAvailable===true;
    button.disabled=!valid||!available||donationSubmitting;
    button.setAttribute('aria-busy',String(donationSubmitting));
    button.textContent=donationSubmitting?'Weiter zu Stripe …':!available?(donationCheckoutAvailable===false?'Spenden derzeit nicht verfügbar':'Zahlungsanbindung wird geprüft …'):valid?`Sicher spenden · ${formatDonationAmount(donationAmountCents)}`:'Betrag ab CHF 0.50 eingeben';
    const note=$('#donation-setup-note');
    if(note){note.hidden=available;note.textContent=donationCheckoutAvailable===false?'Spenden sind derzeit noch nicht verfügbar, weil die sichere Zahlungsanbindung eingerichtet wird. Lernkarten Maker bleibt vollständig kostenlos.':'Die Verfügbarkeit der sicheren Zahlungsanbindung wird geprüft …'}
  }
  function checkDonationReadiness(){
    if(donationCheckoutAvailable!==null)return Promise.resolve(donationCheckoutAvailable);
    if(donationReadinessRequest)return donationReadinessRequest;
    donationReadinessRequest=(async()=>{
      try{
        const response=await fetch('/api/support-readiness',{cache:'no-store'});
        if(!response.ok)throw new Error('Spendenstatus nicht verfügbar');
        const payload=await response.json();
        donationCheckoutAvailable=payload.configured===true;
      }catch{
        donationCheckoutAvailable=false;
      }finally{
        donationReadinessRequest=null;
      }
      if(view==='donations')updateDonationButton();
      return donationCheckoutAvailable;
    })();
    return donationReadinessRequest;
  }
  async function startDonationCheckout(){
    if(donationSubmitting||donationCheckoutAvailable!==true||!Number.isSafeInteger(donationAmountCents)||donationAmountCents<50||donationAmountCents>99_999_999)return;
    const button=$('#donation-submit'),error=$('#donation-error');
    donationSubmitting=true;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Weiter zu Stripe …';error.hidden=true;error.textContent='';
    try{
      const {data:{session},error:sessionError}=await supabase.auth.getSession();
      if(sessionError||!session?.access_token)throw new Error('Melde dich an, um eine Spende zu geben.');
      donationCheckoutRequestId ||= id();
      const response=await fetch('/api/support-checkout',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({amountCents:donationAmountCents,requestId:donationCheckoutRequestId})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Der Checkout konnte gerade nicht gestartet werden. Bitte versuche es später erneut.');
      if(typeof payload.url!=='string')throw new Error('Stripe konnte keine Checkout-Adresse zurückgeben. Bitte versuche es später erneut.');
      const checkoutUrl=new URL(payload.url);
      if(checkoutUrl.origin!=='https://checkout.stripe.com')throw new Error('Stripe hat keine gültige Checkout-Adresse zurückgegeben.');
      window.location.assign(checkoutUrl.toString());
    }catch(cause){
      error.textContent=cause.message||'Der Checkout konnte gerade nicht gestartet werden. Bitte versuche es später erneut.';error.hidden=false;
      donationSubmitting=false;updateDonationButton();
    }
  }
  async function refreshDonationPaymentStatus(){
    if(donationStatusChecking)return;
    donationStatusChecking=true;
    if(!donationReturn?.sessionId){donationPayment={status:'failed'};donationStatusChecking=false;renderDonations();return}
    donationPayment={status:'checking'};renderDonations();
    try{
      const {data:{session},error:sessionError}=await supabase.auth.getSession();
      if(sessionError||!session?.access_token)throw new Error('Sitzung fehlt');
      const response=await fetch(`/api/support-status?session_id=${encodeURIComponent(donationReturn.sessionId)}`,{headers:{'Authorization':`Bearer ${session.access_token}`}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Der Spendenstatus konnte nicht geprüft werden.');
      donationPayment={status:payload.status,amountCents:payload.amountCents};
    }catch(error){
      console.error('Stripe-Spendenstatus konnte nicht abgerufen werden.',error);
      donationPayment={status:'unavailable'};
    }
    donationStatusChecking=false;
    renderDonations();
  }
  function subjectAppearance(item,fallback=colors[0]){const colour=safeColor(item.color,fallback),surface=window.WortwerkPresentation.subjectSurface(colour);return `--dot:${colour};--subject-surface:${surface};--subject-ink:${window.WortwerkPresentation.colourInk(surface)}`}
  function subjectSymbol(item,fallback='📚'){
    const icon=item.emoji||item.icon||fallback;
    const flag=icon==='🇫🇷'?'<svg class="subject-flag" viewBox="0 0 36 26" aria-hidden="true"><path fill="#0055A4" d="M0 0h12v26H0z"/><path fill="#FFF" d="M12 0h12v26H12z"/><path fill="#EF4135" d="M24 0h12v26H24z"/></svg>':`<span class="subject-glyph">${esc(icon)}</span>`;
    return `<span class="subject-icon" aria-hidden="true">${flag}</span>`;
  }
  function folderSymbol(){
    return '<svg viewBox="0 0 64 52" fill="none" aria-hidden="true"><path d="M4 13a6 6 0 0 1 6-6h15l6 6h23a6 6 0 0 1 6 6v25a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V13Z" fill="currentColor"/><path d="M4 20a5 5 0 0 1 5-5h46a5 5 0 0 1 5 5v24a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V20Z" fill="currentColor" stroke="white" stroke-opacity=".22"/><path d="M10 18h44" stroke="white" stroke-opacity=".28" stroke-linecap="round"/></svg>';
  }
  function dropAttributes(subjectId,folderId){return `data-drop-subject="${esc(subjectId)}" data-drop-folder="${esc(folderId||'')}"`}
  function sidebarFolders(subjectId,parentId=null,depth=0,seen=new Set()){
    return subjectFolders(subjectId).filter(item=>(item.parentId||null)===parentId&&!seen.has(item.id)).map(item=>{
      seen.add(item.id);
      return `<button class="sidebar-folder" data-sidebar-folder="${esc(item.id)}" ${dropAttributes(subjectId,item.id)} style="--folder-depth:${Math.min(depth,6)};--dot:${safeColor(item.color,'#3378F6')}" ${activeFolder===item.id?'aria-current="page"':''}>${folderSymbol()}<span>${esc(item.name)}</span></button>${sidebarFolders(subjectId,item.id,depth+1,seen)}`;
    }).join('');
  }
  function itemActions(type,item){
    return `<details class="item-menu"><summary aria-label="Aktionen für ${esc(item.name)}" title="Aktionen">•••</summary><div class="item-menu-panel"><button data-move-item="${type}" data-item-id="${esc(item.id)}">Verschieben …</button><button data-item-edit="${type}" data-item-id="${esc(item.id)}">${type==='folder'?'Name & Farbe ändern':'Bearbeiten & Design'}</button><button class="danger-action" data-item-delete="${type}" data-item-id="${esc(item.id)}">${type==='folder'?'Ordner':'Lernstapel'} löschen</button></div></details>`;
  }
  document.addEventListener('click',event=>{
    const move=event.target.closest('[data-move-item]');
    if(move){event.preventDefault();event.stopPropagation();move.closest('details')?.removeAttribute('open');openMoveDialog(move.dataset.moveItem,move.dataset.itemId);return}
    const remove=event.target.closest('[data-item-delete]');
    if(remove){event.preventDefault();remove.closest('details')?.removeAttribute('open');if(remove.dataset.itemDelete==='folder')deleteFolder(remove.dataset.itemId);else deleteSet(remove.dataset.itemId);return}
    const edit=event.target.closest('[data-item-edit]');
    if(edit){event.preventDefault();event.stopPropagation();edit.closest('details')?.removeAttribute('open');editEntity(edit.dataset.itemEdit,edit.dataset.itemId);return}
    document.querySelectorAll('.item-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.removeAttribute('open')});
  });
  $('#content').addEventListener('contextmenu',event=>{
    const tile=event.target.closest('.set-card,.folder-card'),menu=tile?.querySelector('.item-menu');
    if(menu&&!librarySortSaving){event.preventDefault();document.querySelectorAll('.item-menu[open]').forEach(item=>item.removeAttribute('open'));menu.open=true;menu.querySelector('button')?.focus()}
  });

  let moveContext=null;
  const moveDialog=$('#move-dialog');
  function openMoveDialog(type,itemId){
    if(librarySortSaving)return;
    const item=type==='set'?setById(itemId):folder(itemId);if(!item)return;
    const currentId=(type==='set'?item.folderId:item.parentId)||null,parent=subject(item.subjectId);
    moveContext={type,id:itemId,owner:data};
    $('#move-item-name').textContent=item.name;
    $('#move-origin').textContent=`Aktuell: ${parent?.name||'Fach'}${currentId?' / '+folderLabel(folder(currentId)):' · direkt im Fach'}`;
    const destinations=[{id:null,name:`${parent?.name||'Fach'} — direkt auf Fach-Ebene`},...subjectFolders(item.subjectId).map(entry=>({id:entry.id,name:folderLabel(entry)}))];
    $('#move-destination').innerHTML=destinations.filter(target=>target.id===currentId||window.WortwerkModel.canMoveLibraryItem(data,{type,id:itemId,folderId:target.id})).map(target=>`<option value="${esc(target.id||'')}" ${target.id===currentId?'selected':''}>${esc(target.name)}${target.id===currentId?' (aktueller Speicherort)':''}</option>`).join('');
    updateMoveDestination();moveDialog.showModal();
  }
  function updateMoveDestination(){
    $('#move-submit').disabled=!moveContext||!window.WortwerkModel.canMoveLibraryItem(data,{...moveContext,folderId:$('#move-destination').value||null});
  }
  $('#move-destination').addEventListener('change',updateMoveDestination);
  moveDialog.querySelectorAll('[data-cancel-move]').forEach(button=>button.onclick=()=>moveDialog.close());
  moveDialog.addEventListener('close',()=>{moveContext=null});
  $('#move-form').addEventListener('submit',event=>{
    event.preventDefault();if(!moveContext||moveContext.owner!==data||$('#move-submit').disabled)return;
    const options={type:moveContext.type,id:moveContext.id,folderId:$('#move-destination').value||null};moveDialog.close();performLibraryMove(options);
  });
  function performLibraryMove(options){
    const item=options.type==='set'?setById(options.id):folder(options.id);if(!item)return Promise.resolve(false);
    const destination=options.folderId?folder(options.folderId)?.name:subject(item.subjectId)?.name;
    return persistOrganisation(()=>{
      const changed=window.WortwerkModel.moveLibraryItem(data,{...options,timestamp:new Date().toISOString()});
      if(changed&&activeSet===options.id&&options.type==='set')activeFolder=options.folderId;
      return changed;
    },`„${item.name}“ nach „${destination}“ verschoben.`);
  }

  // Moving and sibling sorting use different grips and distinct drop feedback.
  let organisationPointer=null,dragFrame=null;
  function clearOrganisationPointer(){
    const state=organisationPointer;organisationPointer=null;
    if(dragFrame!==null)cancelAnimationFrame(dragFrame);dragFrame=null;
    if(state?.handle.hasPointerCapture?.(state.pointerId))state.handle.releasePointerCapture(state.pointerId);
    state?.ghost?.remove();state?.status?.remove();
    document.body.classList.remove('is-organising');
    document.querySelectorAll('.organisation-source,.drop-allowed,.drop-over,.drop-rejected').forEach(el=>el.classList.remove('organisation-source','drop-allowed','drop-over','drop-rejected'));
  }
  function dropAllowed(state,target){
    return target?.dataset.dropSubject===state.subjectId&&window.WortwerkModel.canMoveLibraryItem(data,{type:state.type,id:state.id,folderId:target.dataset.dropFolder||null});
  }
  function updateOrganisationDrag(){
    const state=organisationPointer;if(!state?.dragging)return;if(state.owner!==data){clearOrganisationPointer();return}
    state.ghost.style.transform=`translate3d(${state.x+16}px,${state.y+16}px,0)`;
    document.querySelectorAll('.drop-over,.drop-rejected').forEach(el=>el.classList.remove('drop-over','drop-rejected'));
    const target=document.elementFromPoint(state.x,state.y)?.closest('[data-drop-folder]');
    state.target=target&&dropAllowed(state,target)?target:null;
    if(target)target.classList.add(state.target?'drop-over':'drop-rejected');
    const destination=state.target?(state.target.dataset.dropFolder?folder(state.target.dataset.dropFolder)?.name:subject(state.subjectId)?.name):null;
    const message=destination?`Nach „${destination}“ verschieben`:'Auf einen markierten Ordner oder die Fach-Ebene ziehen';
    if(state.status.textContent!==message)state.status.textContent=message;
  }
  function organisationScroll(){
    const state=organisationPointer;if(!state?.dragging)return;if(state.owner!==data){clearOrganisationPointer();return}
    const sidebar=document.elementFromPoint(state.x,state.y)?.closest('.sidebar-subjects');
    if(sidebar){const rect=sidebar.getBoundingClientRect();sidebar.scrollTop+=state.y<rect.top+36?-9:state.y>rect.bottom-36?9:0}
    else if(state.y<70)window.scrollBy(0,-12);else if(state.y>window.innerHeight-65)window.scrollBy(0,12);
    updateOrganisationDrag();dragFrame=requestAnimationFrame(organisationScroll);
  }
  document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-organise-handle]');if(!handle||librarySortSaving||librarySorting||event.button!==0)return;
    const type=handle.dataset.itemType,item=type==='set'?setById(handle.dataset.itemId):folder(handle.dataset.itemId);if(!item)return;
    event.preventDefault();handle.setPointerCapture(event.pointerId);
    organisationPointer={owner:data,handle,pointerId:event.pointerId,type,id:item.id,subjectId:item.subjectId,name:item.name,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,target:null,dragging:false};
  });
  document.addEventListener('pointermove',event=>{
    const state=organisationPointer;if(!state||state.pointerId!==event.pointerId)return;
    state.x=event.clientX;state.y=event.clientY;
    if(!state.dragging){
      if(Math.hypot(state.x-state.startX,state.y-state.startY)<7)return;
      state.dragging=true;document.body.classList.add('is-organising');state.handle.closest('[data-sort-id]')?.classList.add('organisation-source');
      state.ghost=document.createElement('div');state.ghost.className='organisation-ghost';state.ghost.textContent=state.name;state.ghost.setAttribute('aria-hidden','true');document.body.append(state.ghost);
      state.status=document.createElement('div');state.status.className='organisation-status';state.status.setAttribute('role','status');document.body.append(state.status);
      document.querySelectorAll('[data-drop-folder]').forEach(target=>{if(dropAllowed(state,target))target.classList.add('drop-allowed')});
      dragFrame=requestAnimationFrame(organisationScroll);
    }
    updateOrganisationDrag();
  });
  document.addEventListener('pointerup',event=>{
    const state=organisationPointer;if(!state||state.pointerId!==event.pointerId)return;
    updateOrganisationDrag();const target=state.target,options=target?{type:state.type,id:state.id,folderId:target.dataset.dropFolder||null}:null;
    clearOrganisationPointer();if(options)performLibraryMove(options);
  });
  document.addEventListener('pointercancel',clearOrganisationPointer);
  document.addEventListener('lostpointercapture',event=>{if(organisationPointer?.pointerId===event.pointerId)clearOrganisationPointer()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&organisationPointer)clearOrganisationPointer()});
  window.addEventListener('blur',clearOrganisationPointer);

  function appearanceFields(value){
    const color=safeColor(value,'#3378F6');
    return `<fieldset class="appearance-field"><legend>Farbe</legend><input type="hidden" id="f-color" name="color" value="${color}"><div class="color-palette" role="group" aria-label="Abgestimmte Farben">${palette.map(([hex,name])=>`<button type="button" class="color-swatch${hex.toLowerCase()===color.toLowerCase()?' selected':''}" data-color="${hex}" aria-label="${name}" aria-pressed="${hex.toLowerCase()===color.toLowerCase()}" title="${name}" style="--swatch:${hex}"></button>`).join('')}</div><div class="custom-colour"><label for="colour-picker">Eigene Farbe</label><input type="color" id="colour-picker" value="${color}" aria-label="Eigene Farbe wählen"><label class="sr-only" for="colour-hex">Farbcode</label><input type="text" id="colour-hex" value="${color}" pattern="#[0-9a-fA-F]{6}" maxlength="7" required aria-label="Farbcode" spellcheck="false" autocomplete="off"></div></fieldset>`;
  }
  function bindColourPicker(){
    const input=$('#f-color'),picker=$('#colour-picker'),hex=$('#colour-hex');
    const choose=(color,fromHex=false)=>{
      if(!/^#[0-9a-f]{6}$/i.test(color))return;
      input.value=color;picker.value=color;if(!fromHex)hex.value=color.toUpperCase();
      document.querySelectorAll('[data-color]').forEach(button=>{const selected=button.dataset.color.toLowerCase()===color.toLowerCase();button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});
    };
    document.querySelectorAll('[data-color]').forEach(button=>button.onclick=()=>choose(button.dataset.color));
    picker.addEventListener('input',()=>choose(picker.value));hex.addEventListener('input',()=>choose(hex.value,true));
  }
  function setDesignFields(themeId){
    const selected=cardThemes.themes.some(theme=>theme.id===themeId)?themeId:'';
    const inherited=cardThemes.getTheme(activeCardThemeId),options=[{id:'',name:'Aus Einstellungen übernehmen',caption:`Aktuell: ${inherited.name}`,theme:inherited},...cardThemes.themes.map(theme=>({id:theme.id,name:theme.name,caption:theme.description,theme}))];
    return `<fieldset class="set-design-fields" aria-describedby="set-design-hint"><legend class="field-label">Kartendesign</legend><p class="field-hint" id="set-design-hint">Wähle die Farben direkt in der Vorschau. Jedes Design zeigt Vorder- und Rückseite und gilt nur für diesen Lernstapel.</p><div class="set-theme-grid" id="f-card-theme">${options.map((option,index)=>`<label class="set-theme-option${option.id===selected?' is-selected':''}${option.id===''?' set-theme-inherit':''}"><input class="set-theme-radio" type="radio" name="cardThemeId" value="${esc(option.id)}"${option.id===selected?' checked':''} aria-describedby="set-theme-caption-${index}"><span class="set-theme-copy"><span class="set-theme-title"><strong>${esc(option.name)}</strong><span class="set-theme-selected-label">${option.id===selected?'Ausgewählt':''}</span></span><small class="set-theme-caption" id="set-theme-caption-${index}">${esc(option.caption)}</small>${cardThemePreview(option.theme)}</span></label>`).join('')}</div><p class="field-hint">Das Design bleibt beim Verschieben erhalten und ist unabhängig von der Ordnerfarbe. Übernehmen mit „Speichern“ oder „Erstellen“.</p></fieldset>`;
  }
  function bindSetDesign(){
    $('#f-card-theme').addEventListener('change',event=>{
      if(!event.target.matches('.set-theme-radio'))return;
      document.querySelectorAll('.set-theme-option').forEach(option=>{const selected=option.querySelector('.set-theme-radio').checked;option.classList.toggle('is-selected',selected);option.querySelector('.set-theme-selected-label').textContent=selected?'Ausgewählt':''});
    });
  }

  function refreshLibraryOrder(){const normalized=window.WortwerkModel.normalizeLibrary(data);for(const key of ['subjects','folders','sets'])data[key]=normalized[key]}
  function folderPath(folderId){const path=[],seen=new Set();let current=folder(folderId);while(current&&!seen.has(current.id)){seen.add(current.id);path.unshift(current);current=folder(current.parentId)}return path}
  function folderLabel(item){return folderPath(item?.id).map(part=>part.name).join(' / ')}
  function crumbs(parts){
    const entries=parts.map((part,index)=>typeof part==='string'?{label:part,...(index===0?{level:'library'}:index===1?{level:'subject',id:activeSubject}:{})}:part);
    $('#breadcrumbs').innerHTML=entries.map((part,index)=>`<span>${index===entries.length-1?`<b aria-current="location">${esc(part.label)}</b>`:`<button class="breadcrumb-link" data-crumb="${index}" ${part.level==='subject'?dropAttributes(part.id,null):part.level==='folder'?dropAttributes(folder(part.id)?.subjectId,part.id):''}>${esc(part.label)}</button>`}</span>`).join('');
    $('#breadcrumbs').querySelectorAll('[data-crumb]').forEach(button=>button.onclick=()=>{const part=entries[Number(button.dataset.crumb)];librarySorting=false;activeSet=null;view='library';if(part.level==='library'){activeSubject=null;activeFolder=null}else if(part.level==='subject'){activeSubject=part.id;activeFolder=null}else if(part.level==='folder'){activeFolder=part.id;activeSubject=folder(part.id)?.subjectId||activeSubject}render()});
  }
  function libraryCrumbs(item,tail){return [{label:'Bibliothek',level:'library'},{label:subject(item.subjectId)?.name||'Fach',level:'subject',id:item.subjectId},...folderPath(item.folderId||item.parentId).map(part=>({label:part.name,level:'folder',id:part.id})),{label:item.name,...(tail?{}:{level:'folder',id:item.id})}]}
  function managementActions(markup){return `<details class="management-menu"><summary>Verwalten <span aria-hidden="true">⌄</span></summary><div class="management-menu-panel">${markup}</div></details>`}
  function sortingButton(){return `<button class="quiet-button sort-toggle" data-toggle-sort aria-pressed="${librarySorting}" ${librarySortSaving?'disabled':''}>${librarySorting?'✓ Fertig':'⇅ Reihenfolge'}</button>`}
  function sortControls(type,item){if(!librarySorting)return '';const siblings=window.WortwerkModel.getLibrarySiblings(data,type,item.id),index=siblings.findIndex(record=>record.id===item.id);return `<div class="sort-controls"><button type="button" class="sort-handle" data-sort-handle aria-label="${esc(item.name)} ziehen zum Sortieren" title="Ziehen zum Sortieren" ${librarySortSaving?'disabled':''}>⠿</button><span class="sort-position">${index+1} / ${siblings.length}</span><button type="button" data-sort-step="-1" aria-label="${esc(item.name)} früher anordnen" title="Früher anordnen" ${index===0||librarySortSaving?'disabled':''}>←</button><button type="button" data-sort-step="1" aria-label="${esc(item.name)} später anordnen" title="Später anordnen" ${index===siblings.length-1||librarySortSaving?'disabled':''}>→</button></div>`}
  function sortAttributes(type,item){return `data-sort-type="${type}" data-sort-id="${esc(item.id)}"`}
  async function persistOrganisation(change,message,focusId){
    if(librarySortSaving)return false;
    const owner=data,snapshot={subjects:structuredClone(data.subjects),folders:structuredClone(data.folders),sets:structuredClone(data.sets)};
    if(!change())return false;
    librarySortSaving=true;render();
    try{await save();if(data!==owner)return false;toast(message);return true}
    catch{if(data!==owner)return false;Object.assign(data,snapshot);window.WortwerkRepository.stagePendingRecovery?.(data);toast('Speichern fehlgeschlagen. Bitte prüfe die Verbindung und speichere erneut.');return false}
    finally{if(data===owner){librarySortSaving=false;render();}if(data===owner&&focusId){const tile=[...document.querySelectorAll('[data-sort-id]')].find(el=>el.dataset.sortId===focusId);(tile?.querySelector('[data-sort-handle]')||tile)?.focus()}}
  }
  function reorderItem(type,itemId,targetId,placement){return persistOrganisation(()=>window.WortwerkModel.reorderLibraryItems(data,{type,id:itemId,targetId,placement}),'Reihenfolge gespeichert.',itemId)}
  $('#content').addEventListener('click',event=>{
    if(event.target.closest('[data-toggle-sort]')){librarySorting=!librarySorting;render();document.querySelector('[data-toggle-sort]')?.focus();return}
    const step=event.target.closest('[data-sort-step]');if(!step)return;
    const tile=step.closest('[data-sort-id]'),{sortType:type,sortId:itemId}=tile.dataset,siblings=window.WortwerkModel.getLibrarySiblings(data,type,itemId),index=siblings.findIndex(item=>item.id===itemId),direction=Number(step.dataset.sortStep),target=siblings[index+direction];
    if(target)reorderItem(type,itemId,target.id,direction>0?'after':'before');
  });
  let sortingPointer=null;
  function clearSortPointer(){document.querySelectorAll('.is-dragging,.drop-before,.drop-after').forEach(el=>el.classList.remove('is-dragging','drop-before','drop-after'));sortingPointer=null}
  $('#content').addEventListener('pointerdown',event=>{const handle=event.target.closest('[data-sort-handle]');if(!handle||librarySortSaving||event.button!==0)return;event.preventDefault();handle.setPointerCapture(event.pointerId);sortingPointer={handle,tile:handle.closest('[data-sort-id]'),pointerId:event.pointerId,x:event.clientX,y:event.clientY,target:null,dragging:false}});
  $('#content').addEventListener('pointermove',event=>{const state=sortingPointer;if(!state||state.pointerId!==event.pointerId)return;if(!state.dragging&&Math.hypot(event.clientX-state.x,event.clientY-state.y)<6)return;state.dragging=true;state.tile.classList.add('is-dragging');document.querySelectorAll('.drop-before,.drop-after').forEach(el=>el.classList.remove('drop-before','drop-after'));const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-sort-id]');state.target=null;if(!target||target===state.tile||target.dataset.sortType!==state.tile.dataset.sortType)return;const siblings=window.WortwerkModel.getLibrarySiblings(data,state.tile.dataset.sortType,state.tile.dataset.sortId);if(!siblings.some(item=>item.id===target.dataset.sortId))return;const rect=target.getBoundingClientRect();state.placement=event.clientY<rect.top+rect.height/2?'before':'after';state.target=target;target.classList.add('drop-'+state.placement)});
  $('#content').addEventListener('pointerup',event=>{const state=sortingPointer;if(!state||state.pointerId!==event.pointerId)return;const {tile,target,placement}=state;clearSortPointer();if(target)reorderItem(tile.dataset.sortType,tile.dataset.sortId,target.dataset.sortId,placement)});
  $('#content').addEventListener('pointercancel',clearSortPointer);
  function renderLibrary(){
    activeSubject=null;activeFolder=null;activeSet=null;
    const recentSets=(data.recent||[]).map(item=>setById(item.setId)).filter(Boolean).filter((set,index,list)=>list.findIndex(candidate=>candidate.id===set.id)===index).slice(0,view==='recent'?30:4);
    if(view==='recent'){
      $('#content').innerHTML=`<div class="page-heading"><div><h1 class="page-title">Zuletzt gelernt</h1><p class="page-subtitle">Hier findest du deine zuletzt geöffneten Lernstapel und kannst direkt weiterlernen.</p></div></div>${recentSets.length?`<div class="set-grid">${recentSets.map(setCard).join('')}</div>`:empty('Noch keine Lernrunde','Öffne einen Lernstapel und starte deine erste Runde. Deine letzten Stapel erscheinen danach hier.','◷')}`;
      bindSetCards();return;
    }
    const subjectCards=data.subjects.map((item,index)=>{
      const sets=subjectSets(item.id),cards=sets.reduce((sum,set)=>sum+(cardCounts.get(set.id)||0),0);
      return `<article class="subject-card" ${sortAttributes('subject',item)} tabindex="0" data-open-subject="${esc(item.id)}" style="${subjectAppearance(item,colors[index%colors.length])}"><div class="subject-card-top">${subjectSymbol(item,icons[index%icons.length])}</div><h2>${esc(item.name)}</h2><p>${sets.length} ${sets.length===1?'Set':'Sets'} · ${cards} ${cards===1?'Karte':'Karten'}</p><span class="card-arrow" aria-hidden="true">→</span>${sortControls('subject',item)}</article>`;
    }).join('');
    const recentSection=recentSets.length?`<section class="recent-section"><div class="section-head"><h2>Zuletzt gelernt</h2><button class="text-button" data-view="recent">Alle anzeigen</button></div><div class="recent-list">${recentSets.map(set=>`<button class="recent-item" data-open-set="${esc(set.id)}"><span>${esc(set.name)}</span><small>${esc(subject(set.subjectId)?.name||'Fach')}</small><span aria-hidden="true">→</span></button>`).join('')}</div></section>`:'';
    $('#content').innerHTML=`<div class="page-heading"><div><div class="eyebrow">DEIN PERSÖNLICHER LERNRAUM</div><h1 class="page-title">Bibliothek</h1><p class="page-subtitle">Alles, was du lernen möchtest. An einem Ort.</p></div><div class="page-primary-actions"><button class="quiet-button" id="home-add-subject">＋ Fach anlegen</button><button class="primary-button" id="home-create-set">＋ Lernstapel erstellen</button></div></div><section class="library-section"><div class="section-head"><h2>Fächer <span class="count-label">${data.subjects.length}</span></h2>${data.subjects.length>1?sortingButton():''}</div>${data.subjects.length?`<div class="subject-grid">${subjectCards}</div>`:empty('Dein Lernraum ist noch leer','Lege zuerst ein Fach an. Darin kannst du Lernstapel und Ordner sammeln.','＋')}</section>${librarySorting?'<p class="sort-instructions">Ziehe am Griff oder verwende die Pfeile. Die Reihenfolge wird automatisch gespeichert.</p>':''}${recentSection}`;
    $('#home-add-subject')?.addEventListener('click',()=>openEntity('subject'));
    $('#home-create-set')?.addEventListener('click',()=>openEntity('set'));
    $('#home-import')?.addEventListener('click',()=>openImport());
    document.querySelectorAll('.content [data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;activeSubject=null;activeFolder=null;activeSet=null;render()}));
    bindSubjectCards();bindSetCards();
  }
  function empty(title,copy,icon){
    const label=view==='recent'?'Zur Bibliothek':activeSet?'Karte erstellen':activeFolder?'Lernstapel erstellen':activeSubject?'Ordner anlegen':'Fach anlegen';
    return `<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">${icon}</span><h2>${title}</h2><p>${copy}</p><button class="quiet-button" data-empty-action>＋ ${label}</button></div>`;
  }
  function openEmptyAction(){if(view==='recent'){view='library';render();return}if(activeSet)openEntity('card');else if(activeFolder)openEntity('set');else if(activeSubject)openEntity('folder');else openEntity('subject')}
  function bindSubjectCards(){
    document.querySelectorAll('[data-open-subject]').forEach(element=>{
      const open=()=>{activeSubject=element.dataset.openSubject;expandedSidebarSubjects.add(activeSubject);activeFolder=null;activeSet=null;view='library';render()};
      element.onclick=event=>{if((event.target.closest('button,details')&&event.target.closest('button,details')!==element)||librarySorting)return;open()};element.onkeydown=event=>{if(event.target===element&&!librarySorting&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open()}};
    });
    document.querySelectorAll('[data-empty-action]').forEach(button=>button.onclick=openEmptyAction);
  }
  function setCard(set){
    const parent=folder(set.folderId),sub=subject(set.subjectId),count=cardCounts.get(set.id)||0,theme=cardThemes.getTheme(cardThemes.resolveSetThemeId(set,activeCardThemeId));
    return `<article class="set-card" ${sortAttributes('set',set)} tabindex="0" data-open-set="${esc(set.id)}" style="--set-front:${theme.front.surface};--set-back:${theme.back.surface}"><div class="set-card-top"><button class="set-cover" data-organise-handle ${librarySorting?'tabindex="-1" aria-hidden="true"':''} data-item-type="set" data-item-id="${esc(set.id)}" aria-label="${esc(set.name)} ziehen zum Verschieben" title="Ziehen zum Verschieben"><span></span><span></span></button>${itemActions('set',set)}</div><div class="set-card-meta">${esc(parent?.name||sub?.name||'Fach')}</div><h2>${esc(set.name)}</h2>${set.description?`<p>${esc(set.description)}</p>`:''}<div class="set-card-bottom"><span>${count} ${count===1?'Karte':'Karten'}</span><span class="set-actions"><button data-quick-study="${esc(set.id)}" ${count?'':'disabled'}>${studyActionLabel(set.id)}</button><button data-quick-edit="${esc(set.id)}">Öffnen</button></span></div>${sortControls('set',set)}</article>`;
  }
  function bindSetCards(){
    document.querySelectorAll('[data-open-set]').forEach(element=>{
      const open=()=>{activeSet=element.dataset.openSet;const set=setById(activeSet);activeSubject=set?.subjectId||null;activeFolder=set?.folderId||null;render()};
      element.onclick=event=>{if((event.target.closest('button,details')&&event.target.closest('button,details')!==element)||librarySorting)return;open()};element.onkeydown=event=>{if(event.target===element&&!librarySorting&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open()}};
    });
    document.querySelectorAll('[data-quick-study]').forEach(button=>button.onclick=event=>{event.stopPropagation();beginStudy(button.dataset.quickStudy)});
    document.querySelectorAll('[data-quick-edit]').forEach(button=>button.onclick=event=>{event.stopPropagation();(()=>{activeSet=button.dataset.quickEdit;const item=setById(activeSet);activeSubject=item?.subjectId;activeFolder=item?.folderId;render()})()});
  }
  function folderCard(item){
    const count=subjectSets(item.subjectId).filter(set=>set.folderId===item.id).length,children=subjectFolders(item.subjectId).filter(child=>child.parentId===item.id).length;
    return `<article class="folder-card" ${sortAttributes('folder',item)} ${dropAttributes(item.subjectId,item.id)} tabindex="0" data-open-folder="${esc(item.id)}" style="--dot:${safeColor(item.color,'#3378F6')}"><button class="folder-icon" data-organise-handle ${librarySorting?'tabindex="-1" aria-hidden="true"':''} data-item-type="folder" data-item-id="${esc(item.id)}" aria-label="${esc(item.name)} ziehen zum Verschieben" title="Ziehen zum Verschieben">${folderSymbol()}</button><div class="folder-card-copy"><h3>${esc(item.name)}</h3><p>${count} ${count===1?'Lernstapel':'Lernstapel'}${children?` · ${children} Unterordner`:''}</p></div>${itemActions('folder',item)}${sortControls('folder',item)}</article>`;
  }
  function bindFolderCards(){
    document.querySelectorAll('[data-open-folder]').forEach(element=>{
      const open=()=>{activeFolder=element.dataset.openFolder;activeSet=null;render()};
      element.onclick=event=>{if((event.target.closest('button,details')&&event.target.closest('button,details')!==element)||librarySorting)return;open()};element.onkeydown=event=>{if(event.target===element&&!librarySorting&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open()}};
    });
    document.querySelectorAll('[data-edit-folder]').forEach(button=>button.onclick=()=>editEntity('folder',button.dataset.editFolder));
    document.querySelectorAll('[data-delete-folder]').forEach(button=>button.onclick=()=>deleteFolder(button.dataset.deleteFolder));
  }
  function backButton(label){return `<button class="back-button" id="go-back" aria-label="Zurück zu ${esc(label)}"><span aria-hidden="true">←</span><span>${esc(label)}</span></button>`}
  function renderSubject(){
    const item=subject(activeSubject);if(!item){activeSubject=null;return renderLibrary()}
    crumbs(['Bibliothek',item.name]);
    const folders=subjectFolders(item.id).filter(child=>!child.parentId),looseSets=subjectSets(item.id).filter(set=>!set.folderId);
    const cardCount=subjectSets(item.id).reduce((sum,set)=>sum+(cardCounts.get(set.id)||0),0);
    const folderSection=folders.length?`<div class="folder-grid">${folders.map(folderCard).join('')}</div>`:'';
    const looseSection=looseSets.length?`<div class="section-head"><h2>Lernstapel <span class="count-label">${looseSets.length}</span></h2></div><div class="set-grid">${looseSets.map(setCard).join('')}</div>`:'';
    $('#content').innerHTML=`<div class="subpage-heading">${backButton('Bibliothek')}<div class="subject-heading" style="${subjectAppearance(item)}">${subjectSymbol(item)}<div><h1 class="page-title">${esc(item.name)}</h1><p class="page-subtitle">${esc(item.description||`${subjectSets(item.id).length} Sets · ${cardCount} Karten`)}</p></div></div>${managementActions('<button id="edit-subject">Fach bearbeiten</button><button class="danger-action" id="delete-subject">Fach löschen</button>')}</div><section class="library-section"><div class="section-head"><h2>Ordner <span class="count-label">${folders.length}</span></h2><div class="section-actions">${sortingButton()}<button class="quiet-button" id="add-folder">＋ Ordner anlegen</button><button class="primary-button" id="subject-new-set">＋ Lernstapel erstellen</button></div></div>${folderSection||'<p class="section-note">Ordner sind optional. Lege sie an, wenn du deine Lernstapel weiter gliedern möchtest.</p>'}</section>${looseSection}`;
    $('#go-back').onclick=()=>{librarySorting=false;activeSubject=null;activeFolder=null;render()};$('#edit-subject').onclick=()=>editEntity('subject',item.id);$('#delete-subject').onclick=()=>deleteSubject(item.id);$('#add-folder').onclick=()=>openEntity('folder');$('#subject-new-set').onclick=()=>openEntity('set');
    bindFolderCards();bindSetCards();bindSubjectCards();
  }
  function renderFolder(){
    const item=folder(activeFolder);if(!item){activeFolder=null;return renderSubject()}
    const parent=subject(item.subjectId);if(!parent){activeFolder=null;return renderLibrary()}
    const sets=subjectSets(parent.id).filter(set=>set.folderId===item.id),children=subjectFolders(parent.id).filter(child=>child.parentId===item.id);crumbs(libraryCrumbs(item));
    $('#content').innerHTML=`<div class="subpage-heading">${backButton(folder(item.parentId)?.name||parent.name)}<div><div class="page-context">ORDNER · ${esc(parent.name)}</div><h1 class="page-title">${esc(item.name)}</h1><p class="page-subtitle">${children.length} Unterordner · ${sets.length} Lernstapel</p></div>${managementActions(`<button id="edit-folder-current">Ordner bearbeiten</button><button data-move-item="folder" data-item-id="${esc(item.id)}">Ordner verschieben …</button><button class="danger-action" id="delete-folder-current">Ordner löschen</button>`)}</div><section class="library-section"><div class="section-head"><h2>In diesem Ordner</h2><div class="section-actions">${sortingButton()}<button class="quiet-button" id="add-subfolder">＋ Unterordner</button><button class="primary-button" id="folder-new-set">＋ Lernstapel erstellen</button></div></div>${children.length?`<div class="folder-grid">${children.map(folderCard).join('')}</div>`:''}${sets.length?`<div class="set-grid">${sets.map(setCard).join('')}</div>`:!children.length?empty('Platz für dein nächstes Lernziel','Erstelle einen Lernstapel oder gliedere deine Inhalte mit Unterordnern.','▤'):''}</section>`;
    $('#go-back').onclick=()=>{librarySorting=false;activeFolder=item.parentId||null;render()};$('#edit-folder-current').onclick=()=>editEntity('folder',item.id);$('#delete-folder-current').onclick=()=>deleteFolder(item.id);$('#folder-new-set').onclick=()=>openEntity('set');$('#add-subfolder').onclick=()=>openEntity('folder');bindFolderCards();bindSetCards();bindSubjectCards();
  }
  function renderSet(){
    const item=setById(activeSet);if(!item){activeSet=null;return render()}
    const parent=subject(item.subjectId),parentFolder=folder(item.folderId),cards=setCards(item.id);
    if(cardListSetId!==item.id){cardListSetId=item.id;cardListQuery='';cardListLimit=100}
    crumbs(libraryCrumbs(item,true));
    const previous=parentFolder?.name||parent?.name||'Zurück';
    const progress=window.WortwerkModel.getSetProgress(cards);
    const studyLabel=studyActionLabel(item.id);
    $('#content').innerHTML=`<div class="subpage-heading">${backButton(previous)}<div><div class="page-context">${esc(parentFolder?.name||parent?.name||'Lernstapel')}</div><h1 class="page-title">${esc(item.name)}</h1><p class="page-subtitle">${esc(item.description||`${cards.length} Lernkarten`)}</p></div>${managementActions(`<button id="edit-set">Lernstapel bearbeiten</button><button data-move-item="set" data-item-id="${esc(item.id)}">Lernstapel verschieben …</button><button id="swap-card-sides" ${cards.length?'':'disabled'}>Vorder- und Rückseiten tauschen</button><button class="danger-action" id="delete-set">Lernstapel löschen</button>`)}</div>${cards.length?`<section class="study-banner" aria-labelledby="learning-progress-title"><div class="learning-progress-copy"><h2 id="learning-progress-title">Lernfortschritt</h2><p>${cards.length} Karten · ${progress.secure} sicher · ${progress.practice} zu üben · ${progress.new} neu</p><div class="library-progress" role="progressbar" aria-label="Sicher beherrschte Karten" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percentage}"><span style="width:${progress.percentage}%"></span></div><small class="study-progress-caption">${progress.percentage}% sicher beherrscht · mindestens zwei richtige Antworten.</small></div><div class="study-banner-actions"><button class="primary-button" id="start-study">${studyLabel}</button><button class="quiet-button" id="reset-progress">Lernfortschritt zurücksetzen</button></div></section>`:''}<section class="library-section"><div class="section-head"><h2>Lernkarten <span class="count-label">${cards.length}</span></h2><div class="section-actions"><button class="quiet-button" id="import-this">Karten importieren</button><button class="quiet-button" id="add-card">＋ Karte erstellen</button></div></div>${cards.length?renderCardList(cards):empty('Noch keine Lernkarten','Erstelle deine erste Karte oder importiere mehrere Begriffe aus Text.','▤')}</section>`;
    $('#go-back').onclick=()=>{librarySorting=false;activeSet=null;activeFolder=item.folderId||null;render()};$('#edit-set').onclick=()=>editEntity('set',item.id);$('#delete-set').onclick=()=>deleteSet(item.id);$('#start-study')?.addEventListener('click',()=>beginStudy(item.id));$('#reset-progress')?.addEventListener('click',()=>openResetProgress(item.id));$('#swap-card-sides').onclick=()=>swapSetSides(item.id);$('#add-card').onclick=()=>openEntity('card');$('#import-this').onclick=()=>openImport(item.id);
    bindCardList();bindSubjectCards();
  }
  function renderCardList(cards){
    const page=cardListPage(cards,cardListQuery,cardListLimit),positions=new Map(cards.map((card,index)=>[card.id,index]));
    return `<div class="card-list-toolbar"><label class="card-search"><span class="sr-only">Lernkarten durchsuchen</span><input type="search" id="card-search" placeholder="Begriffe oder Beispielsätze suchen" value="${esc(cardListQuery)}"></label><span class="card-list-count" role="status">${page.cards.length} von ${page.total} ${cardListQuery?'Treffern':'Karten'}</span></div><div id="card-list-results">${cardRows(page,positions,cards.length)}</div>`;
  }
  function cardRows(page,positions,total){
    return `<div class="card-list">${page.cards.map(card=>{const index=positions.get(card.id),progress=window.WortwerkModel.getCardProgress(card),label=progress.state==='secure'?'Sicher':progress.state==='practice'?'Zu üben':'Neu';return `<div class="flash-row"><div class="term">${cardSideMarkup(card,'front')}<small class="flash-progress">${label} · ${progress.attempts} ${progress.attempts===1?'Versuch':'Versuche'}</small></div><div class="definition">${cardSideMarkup(card,'back')}</div><div class="row-actions"><button data-move-card="${esc(card.id)}" data-direction="-1" aria-label="Karte nach oben verschieben" title="Karte nach oben verschieben" ${index===0?'disabled':''}>↑</button><button data-move-card="${esc(card.id)}" data-direction="1" aria-label="Karte nach unten verschieben" title="Karte nach unten verschieben" ${index===total-1?'disabled':''}>↓</button><button data-edit-card="${esc(card.id)}" aria-label="Karte bearbeiten" title="Karte bearbeiten">✎</button><button data-delete-card="${esc(card.id)}" aria-label="Karte löschen" title="Karte löschen">×</button></div></div>`}).join('')}</div>${!page.total?'<p class="section-note">Keine passenden Karten. Versuche einen anderen Suchbegriff.</p>':''}${page.cards.length<page.total?'<button type="button" class="quiet-button card-list-more" id="card-list-more">Weitere 100 Karten anzeigen</button>':''}`;
  }
  function bindCardList(){
    const search=$('#card-search');if(search)search.oninput=()=>{cardListQuery=search.value;cardListLimit=100;refreshCardRows()};
    document.querySelectorAll('[data-move-card]').forEach(button=>button.onclick=()=>moveCard(button.dataset.moveCard,Number(button.dataset.direction)));
    document.querySelectorAll('[data-edit-card]').forEach(button=>button.onclick=()=>editCard(button.dataset.editCard));document.querySelectorAll('[data-delete-card]').forEach(button=>button.onclick=()=>deleteCard(button.dataset.deleteCard));
    $('#card-list-more')?.addEventListener('click',()=>{cardListLimit+=100;refreshCardRows()});
  }
  function refreshCardRows(){const cards=setCards(activeSet),page=cardListPage(cards,cardListQuery,cardListLimit);$('#card-list-results').innerHTML=cardRows(page,new Map(cards.map((card,index)=>[card.id,index])),cards.length);$('.card-list-count').textContent=`${page.cards.length} von ${page.total} ${cardListQuery?'Treffern':'Karten'}`;bindCardList()}
  function openEntity(type){formContext={type};fillForm(type);$('#form-dialog').showModal()}
  function editEntity(type,key){formContext={type,key};fillForm(type, type==='subject'?subject(key):type==='folder'?folder(key):setById(key));$('#form-dialog').showModal()}
  function fillForm(type,entity){$('#form-dialog').classList.toggle('has-set-design',type==='set');$('#form-save-error').hidden=true;$('#form-save-error').textContent='';const title=entity?`Bearbeite ${{subject:'Fach',folder:'Ordner',set:'Lernstapel',card:'Lernkarte'}[type]}`:({subject:'Fach anlegen',folder:'Ordner anlegen',set:'Lernstapel erstellen',card:'Lernkarte erstellen'})[type];$('#form-title').textContent=title;$('#form-eyebrow').textContent=entity?'BEARBEITEN':'NEU IN DEINER BIBLIOTHEK';$('#form-submit').textContent=entity?'Speichern':'Erstellen';let fields='';const input=(name,label,value='',placeholder='',required=true)=>`<label class="field-label" for="f-${name}">${label}</label><input id="f-${name}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="100" ${required?'required':''}>`;
    if(type==='subject'){
      const selectedEmoji=entity?.emoji||'📚';
      fields=input('name','Fachname',entity?.name,'z. B. Französisch')+`<label class="field-label" for="f-description">Beschreibung <span class="optional-label">(optional)</span></label><input id="f-description" name="description" value="${esc(entity?.description||'')}" maxlength="160" placeholder="Was möchtest du in diesem Fach lernen?">`+appearanceFields(entity?.color||colors[data.subjects.length%colors.length])+`<span class="field-label" id="emoji-label">Symbol</span><input type="hidden" id="f-emoji" name="emoji" value="${esc(selectedEmoji)}"><label class="emoji-entry-wrap"><span class="emoji-current" id="emoji-current" aria-hidden="true">${esc(selectedEmoji)}</span><input id="emoji-entry" type="text" value="${esc(selectedEmoji)}" maxlength="20" aria-label="Eigenes Emoji eingeben" autocomplete="off"></label><label class="emoji-search-label"><span class="sr-only">Emoji suchen</span><input id="emoji-search" type="search" placeholder="Emoji suchen …" autocomplete="off"></label><div class="emoji-grid" role="group" aria-labelledby="emoji-label">${emojiChoices.map(([emoji,keywords,category])=>`<button type="button" class="emoji-option ${emoji===selectedEmoji?'selected':''}" data-emoji="${esc(emoji)}" data-search="${esc((keywords+' '+category).toLocaleLowerCase('de'))}" aria-label="${esc(keywords.split(' ')[0])}" aria-pressed="${emoji===selectedEmoji}">${emoji}</button>`).join('')}</div>`;
    }
    if(type==='folder')fields=input('name','Ordnername',entity?.name||'','z. B. Kapitel 1')+appearanceFields(entity?.color||'#3378F6')+`<div class="field-hint">Die Ordnerfarbe ist unabhängig vom Fach und den Designs deiner Lernstapel.</div>`;
    if(type==='set'){
      const contextSubject=formContext?.defaultSubjectId||activeSubject||data.subjects[0]?.id||'';
      const subjectId=entity?.subjectId||contextSubject;
      const subjectChoice=!entity?`<label class="field-label" for="f-subject">Fach <span style="color:#71808b">(optional)</span></label><select id="f-subject" name="subjectId"><option value="">${data.subjects.length?'Standardfach':'Fach wird bei Bedarf angelegt'}</option>${data.subjects.map(item=>`<option value="${esc(item.id)}" ${item.id===contextSubject?'selected':''}>${esc(item.name)}</option>`).join('')}</select>`:'';
      const folderId=entity?entity.folderId||'':(formContext?.defaultFolderId&&folder(formContext.defaultFolderId)?.subjectId===subjectId?formContext.defaultFolderId:activeFolder&&folder(activeFolder)?.subjectId===subjectId?activeFolder:'');
      fields=subjectChoice+input('name',`Name des Lernstapels <span style="color:#71808b">(optional)</span>`,entity?.name,window.WortwerkModel.nextSetName(data.sets,subjectId||'__default__',folderId||null),Boolean(entity))+`<div class="field-hint">Ohne Namen vergeben wir automatisch den nächsten freien „Lernstapel“-Namen.</div><label class="field-label" for="f-description">Beschreibung <span style="color:#71808b">(optional)</span></label><input id="f-description" name="description" value="${esc(entity?.description||'')}" maxlength="160" placeholder="Thema oder Lernziel"><label class="field-label" for="f-folder">Ordner <span style="color:#71808b">(optional)</span></label><select id="f-folder" name="folderId"><option value="">${subjectFolders(subjectId).length?'Kein Ordner':'Ohne Ordner'}</option>${subjectFolders(subjectId).map(f=>`<option value="${esc(f.id)}" ${folderId===f.id?'selected':''}>${esc(folderLabel(f))}</option>`).join('')}</select><div class="field-hint">Der Lernstapel wird im ausgewählten Fach gespeichert. Ein Ordner ist optional.</div>`
    }
    if(type==='set')fields+=setDesignFields(entity?.cardThemeId||'');
    if(type==='card'){
      const c=entity,front=cardSideContent(c,'front'),back=cardSideContent(c,'back');
      fields=`<label class="field-label" for="f-front">Vorderseite</label><textarea id="f-front" name="front" rows="3" maxlength="2000" required placeholder="Begriff, Frage oder Wort">${esc(c?front.term:'')}</textarea><label class="field-label" for="f-front-example">Beispielsatz auf der Vorderseite <span style="color:#71808b">(optional)</span></label><textarea id="f-front-example" name="frontExampleSentence" rows="2" maxlength="3000" placeholder="Ein Beispielsatz zur Vorderseite">${esc(front.exampleSentence)}</textarea><label class="field-label" for="f-back">Rückseite</label><textarea id="f-back" name="back" rows="3" maxlength="3000" required placeholder="Übersetzung, Antwort oder Erklärung">${esc(c?back.term:'')}</textarea><label class="field-label" for="f-back-example">Beispielsatz auf der Rückseite <span style="color:#71808b">(optional)</span></label><textarea id="f-back-example" name="backExampleSentence" rows="2" maxlength="3000" placeholder="Ein Beispielsatz zur Rückseite">${esc(back.exampleSentence)}</textarea><div class="field-hint">Beispielsätze werden beim Lernen kleiner unter dem Begriff angezeigt.</div>`;
    }
    $('#form-fields').innerHTML=fields;if(type==='subject'||type==='folder')bindColourPicker();if(type==='subject')bindSubjectAppearance();if(type==='set'){bindSetSubject();bindSetDesign()}$('#form-submit').onclick=e=>{e.preventDefault();submitEntity()};$('#entity-form').onsubmit=e=>{e.preventDefault();submitEntity()}}
  function bindSetSubject(){const selector=$('#f-subject');if(!selector)return;selector.addEventListener('change',()=>{$('#f-folder').innerHTML=`<option value="">Ohne Ordner</option>${subjectFolders(selector.value).map(item=>`<option value="${esc(item.id)}">${esc(folderLabel(item))}</option>`).join('')}`})}
  function bindSubjectAppearance(){const emojiInput=$('#f-emoji'),emojiEntry=$('#emoji-entry'),current=$('#emoji-current'),grid=$('.emoji-grid');const chooseEmoji=value=>{const emoji=value.trim()||'📚';emojiInput.value=emoji;current.textContent=emoji;grid.querySelectorAll('[data-emoji]').forEach(button=>{const selected=button.dataset.emoji===emoji;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))})};emojiEntry.addEventListener('input',()=>chooseEmoji(emojiEntry.value));grid.querySelectorAll('[data-emoji]').forEach(button=>button.onclick=()=>{emojiEntry.value=button.dataset.emoji;chooseEmoji(button.dataset.emoji)});$('#emoji-search').addEventListener('input',e=>{const query=e.target.value.trim().toLocaleLowerCase('de');grid.querySelectorAll('[data-emoji]').forEach(button=>{button.hidden=!!query&&!button.dataset.search.includes(query)})})}
  async function submitEntity(){if(entitySaving||librarySortSaving)return;const type=formContext?.type;const form=$('#entity-form');if(!form.reportValidity())return;const awaitSave=['subject','folder'].includes(type)||(type==='set'&&!formContext.copyCards?.length),owner=data,snapshot=awaitSave?{subjects:structuredClone(data.subjects),folders:structuredClone(data.folders),sets:structuredClone(data.sets)}:null,previousLocation={activeSubject,activeFolder,activeSet};$('#form-save-error').hidden=true;const fd=new FormData(form);let successNotice=null;if(type==='subject'){const v={name:fd.get('name').trim(),description:fd.get('description').trim(),color:fd.get('color'),emoji:fd.get('emoji')||'📚'};if(!v.name){toast('Der Fachname darf nicht leer sein.');return} if(formContext.key)Object.assign(subject(formContext.key),v,{updatedAt:new Date().toISOString()});else{const timestamp=new Date().toISOString();const s={id:id(),...v,icon:v.emoji,createdAt:timestamp,updatedAt:timestamp};s.position=window.WortwerkModel.nextLibraryPosition(data,'subject',s);data.subjects.push(s);activeSubject=s.id;activeFolder=null}}
    if(type==='folder'){const name=fd.get('name').trim();if(!name){toast('Der Ordnername darf nicht leer sein.');return}if(!activeSubject||!subject(activeSubject)){toast('Wähle zuerst ein Fach für den Ordner.');return}if(formContext.key)Object.assign(folder(formContext.key),{name,color:fd.get('color'),updatedAt:new Date().toISOString()});else{const timestamp=new Date().toISOString();const created={id:id(),name,color:fd.get('color'),subjectId:activeSubject,parentId:activeFolder||null,createdAt:timestamp,updatedAt:timestamp};created.position=window.WortwerkModel.nextLibraryPosition(data,'folder',created);data.folders.push(created)}}
    if(type==='set'){
      const existing=formContext.key?setById(formContext.key):null;
      let subjectId=existing?.subjectId||fd.get('subjectId')||formContext.defaultSubjectId||activeSubject||data.subjects[0]?.id||null;
      if(!subject(subjectId)){
        if(data.subjects.length)subjectId=data.subjects[0].id;
        else{
          const timestamp=new Date().toISOString(),defaultSubject={id:id(),name:'Allgemein',description:'',color:colors[0],emoji:'📚',icon:'📚',createdAt:timestamp,updatedAt:timestamp};
          defaultSubject.position=window.WortwerkModel.nextLibraryPosition(data,'subject',defaultSubject);data.subjects.push(defaultSubject);subjectId=defaultSubject.id;
        }
      }
      const selectedFolder=fd.get('folderId')||null;
      const folderId=selectedFolder&&folder(selectedFolder)?.subjectId===subjectId?selectedFolder:null;
      const rawName=fd.get('name').trim();
      const name=rawName||(existing?.name||window.WortwerkModel.nextSetName(data.sets,subjectId,folderId));
      const duplicate=data.sets.some(set=>set.id!==existing?.id&&set.subjectId===subjectId&&(set.folderId||null)===(folderId||null)&&set.name.trim().toLocaleLowerCase('de')===name.trim().toLocaleLowerCase('de'));
      if(duplicate){toast('An diesem Speicherort gibt es bereits einen Lernstapel mit diesem Namen.');return}
      const selectedTheme=fd.get('cardThemeId')||null;const v={name,description:fd.get('description').trim(),folderId,cardThemeId:cardThemes.themes.some(theme=>theme.id===selectedTheme)?selectedTheme:null};
      if(existing){const moved=(existing.folderId||null)!==folderId;Object.assign(existing,v,{updatedAt:new Date().toISOString()});if(moved)existing.position=window.WortwerkModel.nextLibraryPosition(data,'set',existing)}
      else{
        const timestamp=new Date().toISOString(),created={id:id(),...v,subjectId,createdAt:timestamp,updatedAt:timestamp};
        created.position=window.WortwerkModel.nextLibraryPosition(data,'set',created);data.sets.push(created);
        if(!formContext.copyCards?.length){activeSet=created.id;activeFolder=folderId;activeSubject=subjectId}
        const sourceCards=formContext.copyCards||[];
        if(sourceCards.length){
          const copied=window.WortwerkModel.createCopiedCards(sourceCards,{setId:created.id,position:0,timestamp,createId:id});
          data.cards.push(...copied);
          if(session?.id===formContext.sourceSessionId){
            if(!session.missedCardIdsCopied)session.missedCardIdsCopied=new Set();
            for(const card of sourceCards)session.missedCardIdsCopied.add(card.id);
          }
        }
        successNotice=sourceCards.length?`Lernstapel „${name}“ erstellt · ${sourceCards.length} falsche Karten übernommen`:`Lernstapel „${name}“ erstellt`;
      }
      if(existing||!formContext.copyCards?.length)activeSubject=subjectId;
      updateMissedSetActions();
    }
    if(type==='card'){
      const v={front:fd.get('front').trim(),back:fd.get('back').trim()},examples={frontExampleSentence:fd.get('frontExampleSentence').trim(),backExampleSentence:fd.get('backExampleSentence').trim()},timestamp=new Date().toISOString();
      if(!v.front||!v.back){toast('Vorder- und Rückseite dürfen nicht leer sein.');return}
      const card=formContext.key?data.cards.find(c=>c.id===formContext.key):null;
      if(card){Object.assign(card,v,{updatedAt:timestamp});for(const [key,value] of Object.entries(examples)){if(value)card[key]=value;else delete card[key]}}
      else data.cards.push({id:id(),setId:activeSet,...v,...Object.fromEntries(Object.entries(examples).filter(([,value])=>value)),position:setCards(activeSet).length,correctCount:0,incorrectCount:0,attemptCount:0,lastReviewedAt:null,nextReviewAt:null,createdAt:timestamp,updatedAt:timestamp});
      const s=setById(activeSet);if(s)s.updatedAt=timestamp;
    }
    if(type==='set'&&formContext?.copyCards?.length&&session?.id===formContext.sourceSessionId){session.missedSetPending=false;const record=data.studySessions?.[session.setId];if(record)record.missedCardIdsCopied=[...(session.missedCardIdsCopied||[])];updateMissedSetActions()}
    refreshLibraryOrder();const keepStudyView=type==='set'&&Boolean(formContext?.copyCards?.length);
    if(awaitSave){
      entitySaving=true;form.inert=true;form.setAttribute('aria-busy','true');const submitLabel=$('#form-submit').textContent;$('#form-submit').textContent='Wird gespeichert …';
      try{await save();if(data!==owner)return;$('#form-dialog').close();render();toast(successNotice||'Änderungen gespeichert.');}
      catch{if(data!==owner)return;Object.assign(data,snapshot);window.WortwerkRepository.stagePendingRecovery?.(data);activeSubject=previousLocation.activeSubject;activeFolder=previousLocation.activeFolder;activeSet=previousLocation.activeSet;toast('Speichern fehlgeschlagen. Deine Eingaben bleiben geöffnet. Bitte erneut versuchen.');}
      finally{entitySaving=false;form.inert=false;form.removeAttribute('aria-busy');$('#form-submit').textContent=submitLabel;}
    }else{save();$('#form-dialog').close();if(!keepStudyView)render();if(successNotice)toast(successNotice)}
  }
  $('#form-dialog').addEventListener('cancel',event=>{if(entitySaving)event.preventDefault()});
  function moveCard(key,direction){const cards=setCards(activeSet),index=cards.findIndex(card=>card.id===key),next=index+direction;if(index<0||next<0||next>=cards.length)return;[cards[index],cards[next]]=[cards[next],cards[index]];const timestamp=new Date().toISOString();cards.forEach((card,position)=>{card.position=position;card.updatedAt=timestamp});save();render()}
  function editCard(key){const c=data.cards.find(x=>x.id===key);if(!c)return;formContext={type:'card',key};fillForm('card',c);$('#form-dialog').showModal()}
  function deleteCard(key){const card=data.cards.find(c=>c.id===key);if(!card||!confirm('Diese Lernkarte dauerhaft löschen?'))return;data.cards=data.cards.filter(c=>c.id!==key);setCards(card.setId).forEach((remaining,position)=>{remaining.position=position});save();render()}
  function deleteSubject(key){const s=subject(key);if(!s||!confirm(`„${s.name}“ mit allen Ordnern, Sets und Karten löschen?`))return;const setIds=data.sets.filter(x=>x.subjectId===key).map(x=>x.id);data.subjects=data.subjects.filter(x=>x.id!==key);data.folders=data.folders.filter(x=>x.subjectId!==key);data.sets=data.sets.filter(x=>x.subjectId!==key);data.cards=data.cards.filter(x=>!setIds.includes(x.setId));data.recent=data.recent.filter(r=>!setIds.includes(r.setId));for(const setId of setIds)delete data.studySessions[setId];data.studyHistory=data.studyHistory.filter(entry=>!setIds.includes(entry.setId));activeSubject=null;activeFolder=null;activeSet=null;save();render();toast('Fach gelöscht')}
  function deleteFolder(key){const f=folder(key);if(!f||!confirm(`Ordner „${f.name}“ löschen? Lernstapel und Unterordner bleiben erhalten und werden eine Ebene nach oben verschoben.`))return;data.folders=data.folders.filter(x=>x.id!==key);data.sets.forEach(s=>{if(s.folderId===key){s.folderId=f.parentId||null;s.position=window.WortwerkModel.nextLibraryPosition(data,'set',s)}});data.folders.forEach(child=>{if(child.parentId===key){child.parentId=f.parentId||null;child.position=window.WortwerkModel.nextLibraryPosition(data,'folder',child)}});if(activeFolder===key)activeFolder=f.parentId||null;refreshLibraryOrder();save();render();toast('Ordner gelöscht')}
  function deleteSet(key){const s=setById(key);if(!s||!confirm(`„${s.name}“ und alle zugehörigen Karten löschen?`))return;data.sets=data.sets.filter(x=>x.id!==key);data.cards=data.cards.filter(c=>c.setId!==key);data.recent=data.recent.filter(r=>r.setId!==key);delete data.studySessions[key];data.studyHistory=data.studyHistory.filter(entry=>entry.setId!==key);activeSet=null;save();render();toast('Set gelöscht')}
  function swapSetSides(key){const item=setById(key),cards=setCards(key);if(!item)return;if(!cards.length){toast('In diesem Lernstapel gibt es keine Karten.');return}if(session?.setId===key){toast('Beende zuerst die laufende Lerneinheit, damit die Karten konsistent bleiben.');return}if(!confirm(`Vorder- und Rückseiten aller ${cards.length} Karten im Lernstapel „${item.name}“ vertauschen?`))return;const count=window.WortwerkModel.swapSetCardSides(data.cards,key,new Date().toISOString());if(!count)return;save();render();toast(`Vorder- und Rückseiten von ${count} Karten getauscht`)}
  function parseImport(text){return window.WortwerkParser.parseImport(text)}
  function updateImportActionState(){
    const button=$('#import-submit'),hint=$('#import-action-hint');
    const previewCount=$('#import-preview .preview-head span:last-child');
    if(previewCount)previewCount.textContent=`${importRows.length} ${importRows.length===1?'Karte':'Karten'} · ${importErrors.length} Fehler`;
    if(!importChecked){button.textContent='Import prüfen';button.disabled=!$('#import-text').value.trim();hint.textContent=$('#import-text').value.trim()?'Prüfe zuerst die Vorschau. Danach kannst du die Karten erstellen.':'Füge Lernmaterial ein oder wähle eine Textdatei.';return}
    if(importHasErrors){button.textContent='Eingaben korrigieren';button.disabled=true;hint.textContent='Einige Zeilen sind ungültig. Korrigiere den Text oben und prüfe ihn erneut.';return}
    if(!importRows.length){button.textContent='Keine Karten zum Erstellen';button.disabled=true;hint.textContent='Es sind keine gültigen Karten in der Vorschau.';return}
    if(importRows.some(row=>!row.front.trim()||!row.back.trim())){button.textContent='Leere Seiten beheben';button.disabled=true;hint.textContent='Ergänze Vorder- und Rückseite in der Vorschau.';return}
    button.textContent='Lernkarten erstellen';button.disabled=false;hint.textContent=`Vorschau geprüft · ${importRows.length} ${importRows.length===1?'Karte':'Karten'} bereit.`;
  }
  function openImport(targetSet){if(!data.sets.length){toast('Erstelle zuerst ein Set für den Import.');return}$('#import-text').value='';$('#import-file').value='';$('#import-file-name').textContent='TXT · UTF-8';const select=$('#import-set');select.innerHTML=data.sets.map(s=>`<option value="${esc(s.id)}" ${targetSet===s.id?'selected':''}>${esc(subject(s.subjectId)?.name||'Fach')} · ${esc(s.name)}</option>`).join('');importRows=[];importChecked=false;importHasErrors=false;$('#import-preview').innerHTML='';updateImportActionState();$('#import-dialog').showModal()}
  function updateImportPreview(){const result=parseImport($('#import-text').value);importRows=result.rows.map(row=>({...row}));importErrors=result.errors;importChecked=true;importHasErrors=result.errors.length>0;importPreviewLimit=100;renderImportPreview()}
  function renderImportPreview(){const preview=$('#import-preview');const rows=importRows.slice(0,importPreviewLimit).map((r,i)=>`<div class="preview-line editable-preview"><span class="preview-index">${r.line}</span><input aria-label="Vorderseite Zeile ${r.line}" data-import-front="${i}" value="${esc(r.front)}"><input aria-label="Rückseite Zeile ${r.line}" data-import-back="${i}" value="${esc(r.back)}"><button type="button" class="row-remove" data-import-remove="${i}" aria-label="Karte aus Vorschau entfernen">×</button><input class="preview-example" aria-label="Beispielsatz auf der Rückseite Zeile ${r.line} (optional)" placeholder="Beispielsatz (optional)" data-import-example="${i}" value="${esc(r.backExampleSentence||'')}"></div>`).join('');const errors=importErrors.slice(0,100).map(e=>`<div class="preview-line bad"><span class="preview-index">Zeile ${e.line}</span><span style="grid-column:span 3"><strong>${esc(e.reason)}</strong><br><code>${esc(e.text)}</code></span></div>`).join('');preview.innerHTML=(importRows.length||importErrors.length)?`<div class="preview-head"><span>IMPORT-VORSCHAU</span><span>${importRows.length} Karten · ${importErrors.length} Fehler</span></div>${errors}${importErrors.length>100?'<p class="field-hint">Die ersten 100 Fehler werden angezeigt. Korrigiere die Eingaben oben und prüfe erneut.</p>':''}${rows}${importRows.length>importPreviewLimit?`<p class="field-hint">${importPreviewLimit} von ${importRows.length} Karten angezeigt. Alle gültigen Karten werden übernommen.</p><button type="button" class="quiet-button" id="import-preview-more">Weitere 100 anzeigen</button>`:''}`:'';$('#import-preview-more')?.addEventListener('click',()=>{importPreviewLimit+=100;renderImportPreview()});updateImportActionState()}
  $('#import-text').addEventListener('input',()=>{importRows=[];importChecked=false;importHasErrors=false;$('#import-preview').innerHTML=$('#import-text').value.trim()?'<p class="field-hint">Text geändert. Prüfe den Import erneut, um die Vorschau zu aktualisieren.</p>':'';updateImportActionState()});
  $('#import-preview').addEventListener('input',e=>{const f=e.target.dataset.importFront,b=e.target.dataset.importBack,example=e.target.dataset.importExample;if(f!==undefined)importRows[Number(f)].front=e.target.value;if(b!==undefined)importRows[Number(b)].back=e.target.value;if(example!==undefined)importRows[Number(example)].backExampleSentence=e.target.value;updateImportActionState()});
  $('#import-preview').addEventListener('click',e=>{const i=e.target.dataset.importRemove;if(i===undefined)return;importRows.splice(Number(i),1);renderImportPreview()});
  $('#import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;$('#import-file-name').textContent=file.name;const draft=$('#import-text').value;try{const text=await file.text();if(!$('#import-dialog').open||$('#import-file').files?.[0]!==file||$('#import-text').value!==draft)return;$('#import-text').value=text;updateImportPreview()}catch(error){console.error('Textdatei konnte nicht gelesen werden.',error);toast('Die Textdatei konnte nicht gelesen werden.')} });
  function cancelEntityForm(){if(formContext?.copyCards?.length&&session?.id===formContext.sourceSessionId){session.missedSetPending=false;updateMissedSetActions()}formContext=null;$('#form-dialog').close()}
  document.querySelectorAll('#entity-form [value="cancel"]').forEach(button=>button.addEventListener('click',cancelEntityForm));
  $('#form-dialog').addEventListener('close',()=>{if(formContext?.copyCards?.length&&session?.id===formContext.sourceSessionId){session.missedSetPending=false;updateMissedSetActions()}formContext=null});
  $('#import-form').querySelectorAll('[value="cancel"]').forEach(button=>button.addEventListener('click',()=>$('#import-dialog').close()));
  $('#import-submit').addEventListener('click',e=>{e.preventDefault();if(!importChecked){updateImportPreview();return}const setId=$('#import-set').value;if(!setById(setId)||!importRows.length||importHasErrors||importRows.some(row=>!row.front.trim()||!row.back.trim()))return;const timestamp=new Date().toISOString(),position=setCards(setId).length,newCards=window.WortwerkModel.createImportedCards(importRows,{setId,position,timestamp,createId:id});data.cards=data.cards.concat(newCards);setById(setId).updatedAt=timestamp;save();$('#import-dialog').close();if(activeSet===setId)render();toast(`${newCards.length} Karten erstellt`)});
  function sessionForSet(key){return data.studySessions?.[key]||null}
  function studyActionLabel(key){return sessionForSet(key)?'Lernen fortsetzen':'Lernen starten'}
  let resetSetId = null;
  function openResetProgress(key){
    const item=setById(key),cards=setCards(key);if(!item||!cards.length)return;
    resetSetId=key;$('#reset-progress-copy').textContent=`Der Lernfortschritt für „${item.name}“ wird vollständig zurückgesetzt. Du beginnst danach wieder bei Karte 1. Karten, Reihenfolge, Inhalte und Set-Einstellungen bleiben erhalten.`;
    $('#reset-progress-dialog').showModal();$('#reset-progress-cancel').focus();
  }
  async function confirmResetProgress(){
    const key=resetSetId;if(!key||!setById(key))return;
    const count=window.WortwerkModel.resetSetProgress(data,key);resetSetId=null;
    $('#reset-progress-dialog').close();render();
    try{await save();toast(`Lernstapel zurückgesetzt · ${count} ${count===1?'Karte':'Karten'} wieder neu`)}catch(error){console.error('Lernfortschritt konnte nicht dauerhaft zurückgesetzt werden.',error);toast('Zurücksetzen lokal angewendet, aber nicht mit Supabase gespeichert. Bitte Verbindung prüfen.')}
  }
  $('#reset-progress-form').addEventListener('submit',event=>event.preventDefault());
  $('#reset-progress-confirm').addEventListener('click',confirmResetProgress);
  $('#reset-progress-cancel').addEventListener('click',()=>{$('#reset-progress-dialog').close();resetSetId=null});
  $('#reset-progress-close').addEventListener('click',()=>{$('#reset-progress-dialog').close();resetSetId=null});
  $('#reset-progress-dialog').addEventListener('close',()=>{resetSetId=null});
  function completeSession(record){if(session?.completionRecorded)return;delete data.studySessions[record.setId];data.studyHistory.unshift(window.WortwerkModel.summarizeSession(record,new Date().toISOString()));data.studyHistory=data.studyHistory.slice(0,30);if(session)session.completionRecorded=true;save()}
  function saveSessionProgress(){
    if(!session)return;
    const results=window.WortwerkModel.getStudyResults(session),index=window.WortwerkModel.getStudyCurrentIndex(session);
    const record={id:session.id,setId:session.setId,startedAt:session.startedAt,cardIds:session.cards.map(card=>card.id),results,resultsByCardId:{...session.resultsByCardId},historyCardIds:session.historyCardIds.slice(),historyIndex:session.historyIndex,currentCardId:session.currentCardId,index:Math.max(0,Math.min(index,session.cards.length-1)),missedCardIdsCopied:[...(session.missedCardIdsCopied||[])]};
    if(results.every(result=>result!==null)){completeSession(record);return}
    data.studySessions[session.setId]=record;save();
  }
  let activeSlotIndex = 0;
  let cancelActiveStudyTransition = null;
  function clearActiveStudyTransition(){if(cancelActiveStudyTransition){const cleanup=cancelActiveStudyTransition;cancelActiveStudyTransition=null;cleanup()}}
  function animateStudyTransition({owner,layer,startClass,stackSlot=null,delay=0,duration=STUDY_SWIPE_MS,syncStackDuration=false,complete}){
    clearActiveStudyTransition();
    let delayTimer=null,fallbackTimer=null,frame=0,finished=false;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cleanup=()=>{if(delayTimer!==null)clearTimeout(delayTimer);if(fallbackTimer!==null)clearTimeout(fallbackTimer);if(frame)cancelAnimationFrame(frame);layer.removeEventListener('animationend',onAnimationEnd);layer.classList.remove(startClass)};
    const finish=event=>{if(event&&event.target!==layer)return;if(finished)return;finished=true;cleanup();if(cancelActiveStudyTransition===cleanup)cancelActiveStudyTransition=null;if(session===owner)complete()};
    const onAnimationEnd=event=>finish(event);
    cancelActiveStudyTransition=cleanup;
    const start=()=>{if(session!==owner){clearActiveStudyTransition();return}if(reduced){finish();return}layer.addEventListener('animationend',onAnimationEnd);layer.classList.add(startClass);if(stackSlot){if(syncStackDuration)stackSlot.classList.add('is-score-elevating');stackSlot.classList.remove('is-stack');stackSlot.classList.add('is-elevating')}fallbackTimer=setTimeout(()=>finish(),duration+100)};
    if(reduced)start();else if(delay>0)delayTimer=setTimeout(()=>{frame=requestAnimationFrame(start)},delay);else frame=requestAnimationFrame(start);
  }
  function getSlot(idx){
    const slot=$(`#study-slot-${idx}`);
    return {
      slot,
      swipeLayer:$(`#study-swipe-${idx}`),
      button:$(`#study-card-${idx}`),
      inner:$(`#study-card-inner-${idx}`),
      frontText:$(`#card-front-${idx}`),
      frontExampleText:$(`#card-front-example-${idx}`),
      backText:$(`#card-back-${idx}`),
      backExampleText:$(`#card-back-example-${idx}`),
      feedback:$(`#study-feedback-${idx}`),
      feedbackText:$(`#study-feedback-text-${idx}`)
    };
  }
  function beginStudy(key){
    const cards=setCards(key);if(!cards.length){toast('Dieses Set enthält noch keine Karten.');return}
    cardThemes.applyTheme(cardThemes.resolveSetThemeId(setById(key),activeCardThemeId));
    session=null;activeSlotIndex=0;
    const saved=sessionForSet(key);
    const sessionState=window.WortwerkModel.createStudySession(cards,saved);
    session={...sessionState,id:saved?.id||id(),setId:key,startedAt:saved?.startedAt||new Date().toISOString(),flipped:false,missedCardIdsCopied:new Set(Array.isArray(saved?.missedCardIdsCopied)?saved.missedCardIdsCopied:[]),missedSetPending:false};
    const lastStudiedAt=new Date().toISOString();setById(key).lastStudiedAt=lastStudiedAt;data.recent=data.recent.filter(entry=>entry.setId!==key);data.recent.unshift({setId:key,at:lastStudiedAt});data.recent=data.recent.slice(0,30);saveSessionProgress();
    $('#study-title').textContent=setById(key)?.name||'Lernsession';$('#study-complete').hidden=true;$('#shuffle-toggle').setAttribute('aria-pressed','false');$('#study-dialog').classList.remove('is-fullscreen');$('#study-dialog').showModal();renderStudyCard();
  }
  function updateStudyScoreCounts(){if(!session)return;const results=window.WortwerkModel.getStudyResults(session),known=results.filter(result=>result===true).length,missed=results.filter(result=>result===false).length;$('#known-count').textContent=String(known);$('#missed-count').textContent=String(missed);$('#study-known').textContent=`${known} ✓ · ${missed} ✕`;$('#answer-yes').setAttribute('aria-label',`Gewusst, bisher ${known}`);$('#answer-no').setAttribute('aria-label',`Nicht gewusst, bisher ${missed}`);$('#shuffle-toggle').disabled=Boolean(session.transitioning);updateMissedSetActions()}
  function getUncopiedMissedCards(){if(!session)return[];const copied=session.missedCardIdsCopied||new Set();return session.cards.filter(card=>window.WortwerkModel.getStudyResult(session,card.id)===false&&!copied.has(card.id))}
  function updateMissedSetActions(){if(!session)return;const results=window.WortwerkModel.getStudyResults(session),totalMissed=results.filter(result=>result===false).length,available=getUncopiedMissedCards().length,pending=Boolean(session.missedSetPending);const button=$('#create-missed-set');button.disabled=!available||pending||session.transitioning;button.textContent=available?`Lernstapel aus ${available} falschen Karten erstellen`:totalMissed?'Lernstapel erstellt':'Lernstapel aus falschen Karten erstellen';button.title=available?'Bisher falsch bewertete Karten in einen eigenen Lernstapel kopieren':totalMissed?'Alle bisher falschen Karten wurden bereits kopiert':'Bewerte zuerst eine Karte als Nicht gewusst';const resultButton=$('#create-missed-set-complete');resultButton.hidden=totalMissed===0;resultButton.disabled=!available||pending;resultButton.textContent=available?`Lernstapel aus ${available} falschen Karten erstellen`:totalMissed?'Lernstapel erstellt':'Lernstapel aus falschen Karten erstellen';resultButton.title=button.title}
  function openMissedSetCreation(){if(!session||session.missedSetPending)return;const cards=getUncopiedMissedCards();if(!cards.length){toast('Bewerte zuerst Karten als „Nicht gewusst“.');return}const originalSet=setById(session.setId);session.missedSetPending=true;formContext={type:'set',defaultSubjectId:originalSet?.subjectId||activeSubject||data.subjects[0]?.id||'',defaultFolderId:originalSet?.folderId||null,copyCards:cards.slice(),sourceSessionId:session.id};fillForm('set');$('#form-submit').textContent='Lernstapel erstellen';$('#form-dialog').showModal();$('#f-name').focus();updateMissedSetActions()}
  function resetSlotOrientation(slotObj){
    if(!slotObj)return;
    slotObj.inner.classList.add('no-transition');
    slotObj.inner.classList.remove('flipped');
    void slotObj.inner.offsetWidth;
    slotObj.inner.classList.remove('no-transition');
  }
  function renderStudyCard(){
    if(!session)return;
    const total=session.cards.length,index=window.WortwerkModel.getStudyCurrentIndex(session),card=window.WortwerkModel.getStudyCard(session);
    const nextCardId=window.WortwerkModel.getNextStudyCardId(session),hasNext=Boolean(nextCardId);
    $('#study-progress-label').textContent=`${index+1} von ${total}`;
    const reviewed=window.WortwerkModel.getStudyResults(session).filter(result=>result!==null).length;
    $('#study-progress-bar').style.width=`${Math.round(reviewed/total*100)}%`;
    $('#study-progress-track').setAttribute('aria-valuemax',String(total));
    $('#study-progress-track').setAttribute('aria-valuenow',String(reviewed));
    updateStudyScoreCounts();

    const result=window.WortwerkModel.getStudyResult(session);
    $('#session-stat').textContent=result===null?'Noch nicht bewertet':result?'Diese Karte: gewusst':'Diese Karte: noch üben';

    const deckBase=$('#study-deck-base');
    if(deckBase)deckBase.classList.toggle('is-empty',total<=1);

    const active=getSlot(activeSlotIndex);
    const stack=getSlot(1-activeSlotIndex);

    // Active slot
    populateStudyCard(active,card);
    active.button.setAttribute('aria-label',describeCardSide(card,session.flipped?'back':'front'));
    active.button.setAttribute('aria-pressed',String(session.flipped));
    active.button.disabled=false;
    active.button.tabIndex=0;
    active.slot.className='study-card-slot is-active';
    active.swipeLayer.className='study-card-swipe-layer';
    active.feedback.classList.remove('is-visible');
    if(!session.flipped){
      resetSlotOrientation(active);
    }else{
      active.inner.classList.add('flipped');
    }

    // Stack slot (preview of next card)
    if(hasNext){
      const nextCard=window.WortwerkModel.getStudyCard(session,nextCardId);
      populateStudyCard(stack,nextCard);
      stack.button.setAttribute('aria-label','Nächste Karte: '+nextCard.front);
      stack.button.disabled=true;
      stack.button.tabIndex=-1;
      resetSlotOrientation(stack);
      stack.slot.className='study-card-slot is-stack';
      stack.swipeLayer.className='study-card-swipe-layer';
      stack.feedback.classList.remove('is-visible');
    }else{
      resetSlotOrientation(stack);
      stack.slot.className='study-card-slot is-hidden';
    }

    $('#answer-no').disabled=false;
    $('#answer-yes').disabled=false;
    $('#study-prev').disabled=session.historyIndex<=0;
    $('#study-next').disabled=!hasNext;
  }
  function flip(){
    if(!session||session.transitioning||!$('#study-complete').hidden)return;
    session.flipped=!session.flipped;
    const active=getSlot(activeSlotIndex);
    active.inner.classList.toggle('flipped',session.flipped);
    const card=window.WortwerkModel.getStudyCard(session);
    active.button.setAttribute('aria-label',describeCardSide(card,session.flipped?'back':'front'));
    active.button.setAttribute('aria-pressed',String(session.flipped));
  }
  function moveStudy(delta){
    if(!session||session.transitioning||!$('#study-complete').hidden)return;
    const previousCardId=session.currentCardId;
    if(!window.WortwerkModel.navigateStudySession(session,delta))return;
    const targetCard=window.WortwerkModel.getStudyCard(session);
    if(!targetCard){session.currentCardId=previousCardId;return}
    session.flipped=false;
    saveSessionProgress();
    const dialog=$('#study-dialog');
    dialog.classList.add('is-instant-navigation');
    activeSlotIndex=1-activeSlotIndex;
    renderStudyCard();
    // Commit the new slot roles while transitions are disabled, so the next
    // interaction can still use the independent rating swipe animation.
    void dialog.offsetWidth;
    dialog.classList.remove('is-instant-navigation');
  }
  function nextStudyCard(){
    if(!session||session.transitioning||!$('#study-complete').hidden)return;
    if(window.WortwerkModel.getNextStudyCardId(session)){moveStudy(1);return}
    if(window.WortwerkModel.getStudyResults(session).every(result=>result!==null))finishStudy();
  }
  function scoreCard(known){
    if(!session||session.transitioning||!$('#study-complete').hidden)return;
    const activeSession=session,card=window.WortwerkModel.getStudyCard(session),cardId=card?.id,previous=window.WortwerkModel.getStudyResult(session),timestamp=new Date().toISOString();
    if(!card||!cardId)return;
    session.transitioning=true;
    window.WortwerkModel.updateCardAnswer(card,previous,known,timestamp);
    window.WortwerkModel.setStudyAnswer(session,cardId,known);
    const remaining=window.WortwerkModel.getStudyResults(session).some(result=>result===null);
    const nextCardId=remaining?window.WortwerkModel.getNextStudyCardId(session):null,hasNext=Boolean(nextCardId);
    if(hasNext)window.WortwerkModel.visitStudyCard(session,nextCardId);
    saveSessionProgress();
    updateStudyScoreCounts();

    $('#session-stat').textContent=known?'Gewusst':'Noch zu üben';

    const active=getSlot(activeSlotIndex);
    const stack=getSlot(1-activeSlotIndex);

    // Disable controls during transition
    active.button.disabled=true;
    $('#answer-no').disabled=true;
    $('#answer-yes').disabled=true;
    $('#study-prev').disabled=true;
    $('#study-next').disabled=true;

    // ── Phase 1: Show feedback overlay on current card ────────────────────────
    if(known){
      active.feedbackText.textContent='Ok';
      active.slot.className='study-card-slot is-active is-correct';
    }else{
      active.feedbackText.innerHTML='Das nächste Mal klappt es<br>bestimmt';
      active.slot.className='study-card-slot is-active is-incorrect';
    }
    active.feedback.classList.add('is-visible');

    // Ensure stack card has the next card's content ready and cleanly upright
    if(hasNext){
      const nextCard=window.WortwerkModel.getStudyCard(session,nextCardId);
      populateStudyCard(stack,nextCard);
      resetSlotOrientation(stack);
      stack.slot.className='study-card-slot is-stack';
    }else{
      resetSlotOrientation(stack);
      stack.slot.className='study-card-slot is-hidden';
    }

    animateStudyTransition({owner:activeSession,layer:active.swipeLayer,startClass:'is-swiping',stackSlot:hasNext?stack.slot:null,duration:STUDY_SWIPE_MS,syncStackDuration:true,complete:completeCardTransition});

    function completeCardTransition(){
      if(session!==activeSession)return;
      if(hasNext){
        activeSlotIndex=1-activeSlotIndex;
        session.flipped=false;

        active.slot.className='study-card-slot is-hidden';
        active.swipeLayer.className='study-card-swipe-layer';
        active.feedback.classList.remove('is-visible');
        resetSlotOrientation(active);

        session.transitioning=false;
        renderStudyCard();
      }else{
        active.slot.className='study-card-slot is-hidden';
        active.swipeLayer.className='study-card-swipe-layer';
        active.feedback.classList.remove('is-visible');
        resetSlotOrientation(active);
        session.transitioning=false;
        finishStudy();
      }
    }
  }
  function finishStudy(){if(!session)return;const results=window.WortwerkModel.getStudyResults(session);if(!session.completionRecorded)completeSession({id:session.id,setId:session.setId,startedAt:session.startedAt,cardIds:session.cards.map(card=>card.id),results});const {known,missed,unrated,percentage}=window.WortwerkModel.summarizeResults(results);const evaluated=known+missed,circumference=2*Math.PI*42,knownLength=circumference*(evaluated?known/evaluated:0),missedLength=circumference*(evaluated?missed/evaluated:0);$('#study-progress-bar').style.width='100%';$('#study-progress-track').setAttribute('aria-valuenow',String(session.cards.length));$('#complete-copy').textContent=`${evaluated} von ${session.cards.length} Karten bewertet`;$('#score-value').textContent=`${percentage}%`;$('#score-ring-known').style.strokeDasharray=`${knownLength} ${circumference-knownLength}`;$('#score-ring-missed').style.strokeDasharray=`${missedLength} ${circumference-missedLength}`;$('#score-ring-missed').style.strokeDashoffset=String(-knownLength);$('#result-chart').setAttribute('aria-label',`${percentage} Prozent richtig: ${known} gewusst und ${missed} noch zu üben`);$('#result-known').textContent=String(known);$('#result-missed').textContent=String(missed);$('#result-unrated').textContent=String(unrated);$('#retry-missed').hidden=missed===0;$('#study-complete').hidden=false;updateMissedSetActions()}
  function retryMissed(){if(!session)return;const cards=session.cards.filter(card=>window.WortwerkModel.getStudyResult(session,card.id)===false);if(!cards.length)return;const retryState=window.WortwerkModel.createStudySession(cards);session={...retryState,id:id(),setId:session.setId,startedAt:new Date().toISOString(),flipped:false,missedCardIdsCopied:new Set(),missedSetPending:false};activeSlotIndex=0;saveSessionProgress();$('#study-title').textContent=`Wiederholung · ${setById(session.setId)?.name||'Lernsession'}`;$('#study-complete').hidden=true;$('#shuffle-toggle').setAttribute('aria-pressed','false');renderStudyCard()}
  const studyDialog=$('#study-dialog');
  const settingsDialog=$('#settings-dialog');
  $('#card-theme-open').onclick=()=>{closeNavigation();renderCardThemeOptions();$('#donation-reminder-enabled').checked=isDonationReminderEnabled();settingsDialog.showModal()};
  $('#donation-reminder-enabled').addEventListener('change',event=>{
    const saved=setDonationReminderEnabled(event.currentTarget.checked);
    if(!saved)toast('Diese Einstellung konnte in diesem Browser nicht gespeichert werden.');
    if(event.currentTarget.checked)donationGreetingDismissed=false;
  });
  $('#card-theme-options').addEventListener('change',event=>{
    const input=event.target.closest('.card-theme-radio');
    if(input?.checked)applySelectedCardTheme(input.value);
  });
  $('#settings-close').onclick=()=>settingsDialog.close();
  $('#settings-done').onclick=()=>settingsDialog.close();
  function syncFullscreenButton(){const active=document.fullscreenElement===studyDialog||studyDialog.classList.contains('is-fullscreen'),button=$('#study-expand');button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Vollbild verlassen':'Lernmodus im Vollbild öffnen');button.title=active?'Vollbild verlassen':'Vollbild';$('#study-expand-label').textContent=active?'Fenster':'Vollbild'}
  async function toggleStudyFullscreen(){if(document.fullscreenElement===studyDialog||studyDialog.classList.contains('is-fullscreen')){studyDialog.classList.remove('is-fullscreen');if(document.fullscreenElement===studyDialog){try{await document.exitFullscreen()}catch(error){console.warn('Vollbildmodus konnte nicht beendet werden.',error)}}syncFullscreenButton();return}try{if(studyDialog.requestFullscreen)await studyDialog.requestFullscreen();else studyDialog.classList.add('is-fullscreen')}catch(error){studyDialog.classList.add('is-fullscreen')}syncFullscreenButton()}
  function endStudy(){const setId=session?.setId;clearActiveStudyTransition();if(document.fullscreenElement===studyDialog)document.exitFullscreen().catch(()=>{});studyDialog.classList.remove('is-fullscreen');studyDialog.close();session=null;cardThemes.applyTheme(activeCardThemeId);syncFullscreenButton();if(setId){const label=studyActionLabel(setId);if(activeSet===setId){const button=$('#start-study');if(button)button.textContent=label}document.querySelectorAll('[data-quick-study]').forEach(button=>{if(button.dataset.quickStudy===setId)button.textContent=label})}}
  studyDialog.addEventListener('fullscreenchange',syncFullscreenButton);
  studyDialog.addEventListener('cancel',event=>{event.preventDefault();endStudy()});
  $('#study-expand').onclick=toggleStudyFullscreen;
  $('#study-card-0').onclick=flip;$('#study-card-1').onclick=flip;$('#answer-no').onclick=()=>scoreCard(false);$('#answer-yes').onclick=()=>scoreCard(true);$('#study-prev').onclick=()=>moveStudy(-1);$('#study-next').onclick=nextStudyCard;$('#study-close').onclick=endStudy;$('#finish-study').onclick=()=>{endStudy();render()};$('#retry-missed').onclick=retryMissed;$('#create-missed-set').onclick=openMissedSetCreation;$('#create-missed-set-complete').onclick=openMissedSetCreation;$('#study-manage').onclick=()=>{endStudy();render()};$('#shuffle-toggle').onclick=()=>{if(!session||session.transitioning||!$('#study-complete').hidden)return;const shuffled=window.WortwerkModel.shuffleUnvisitedStudyCards(session);if(!shuffled){toast('Es gibt nicht genügend noch offene Karten zum Mischen.');return}$('#shuffle-toggle').setAttribute('aria-pressed','true');saveSessionProgress();renderStudyCard()};
  document.addEventListener('keydown',event=>{
    const action=studyKeyboardAction(event,{
      open:studyDialog.open,
      blocked:Boolean(document.querySelector('dialog[open]:not(#study-dialog)')),
      canInteract:Boolean(session&&!session.transitioning&&$('#study-complete').hidden&&window.WortwerkModel.getStudyCard(session))
    });
    if(!action)return;
    event.preventDefault();
    if(action==='missed')scoreCard(false);
    else if(action==='known')scoreCard(true);
    else if(action==='flip')flip();
    else if(action==='previous')moveStudy(-1);
    else if(action==='next')nextStudyCard();
    else if(action==='close')endStudy();
  });
  $('#import-form').onsubmit=e=>e.preventDefault();
  let unsavedChanges=false,saveFailed=false;
  const saveStatus=$('#save-status'),saveRetry=$('#save-retry');
  function showSaveStatus(text,failed=false){saveStatus.textContent=text;saveStatus.parentElement.classList.toggle('is-error',failed);saveRetry.hidden=!failed}
  window.addEventListener('library-save-start',()=>{unsavedChanges=true;showSaveStatus('Wird gespeichert …',saveFailed)});
  window.addEventListener('library-save-success',event=>{if(event.detail?.pending)return;unsavedChanges=false;saveFailed=false;showSaveStatus('Gespeichert')});
  window.addEventListener('library-save-error',()=>{unsavedChanges=true;saveFailed=true;showSaveStatus('Nicht synchronisiert',true)});
  saveRetry.onclick=()=>{if(recoveryAwaitingChoice){$('#recovery-notice [data-recover]')?.focus();return}if(entitySaving||librarySortSaving)return;save().catch(()=>{})};
  window.addEventListener('online',()=>{if(saveFailed&&!entitySaving&&!librarySortSaving&&!recoveryAwaitingChoice)save().catch(()=>{})});
  window.addEventListener('beforeunload',event=>{if(unsavedChanges){event.preventDefault();event.returnValue=''}});
  let libraryLoadVersion=0;
  window.WortwerkResetWorkspace=()=>{libraryLoadVersion++;window.WortwerkRepository.resetLibraryOwner?.();if(session)endStudy();clearOrganisationPointer();clearSortPointer();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());data=initial();activeSubject=null;activeFolder=null;activeSet=null;view='library';expandedSidebarSubjects.clear();cardListSetId=null;formContext=null;librarySortSaving=false;entitySaving=false;$('#entity-form').inert=false;recoveryAwaitingChoice=false;$('#recovery-notice')?.remove();unsavedChanges=false;saveFailed=false;showSaveStatus('');closeNavigation();$('#content').innerHTML=''};

  function offerPendingRecovery(){
    $('#recovery-notice')?.remove();
    const recovery=window.WortwerkRepository.getPendingRecovery?.();if(!recovery)return;
    recoveryAwaitingChoice=true;$('#content').inert=true;unsavedChanges=true;saveFailed=true;showSaveStatus('Lokaler Stand nicht synchronisiert',true);
    const notice=document.createElement('aside');notice.id='recovery-notice';notice.className='recovery-notice';notice.setAttribute('aria-label','Nicht synchronisierte Änderungen');
    notice.innerHTML='<h2>Ein lokaler Lernstand wartet auf dich.</h2><p>Ein früherer Speichervorgang wurde nicht abgeschlossen. Beim Wiederherstellen werden lokale Änderungen übernommen; zusätzlich auf dem Server vorhandene Inhalte bleiben erhalten. Lokale Löschungen werden nicht nachgeholt.</p><button type="button" class="primary-button" data-recover>Lokalen Stand wiederherstellen</button><button type="button" class="quiet-button" data-keep-server>Serverstand behalten</button>';
    $('#content').before(notice);
    notice.querySelector('[data-recover]').onclick=async()=>{data=window.WortwerkModel.normalizeLibrary(window.WortwerkRepository.mergePendingLibrary(data,recovery.library));recoveryAwaitingChoice=false;notice.remove();render();try{await save();toast('Lokaler Lernstand wiederhergestellt.')}catch{toast('Der lokale Stand ist wieder geöffnet. Prüfe die Verbindung und speichere erneut.')}};
    notice.querySelector('[data-keep-server]').onclick=()=>{window.WortwerkRepository.discardPendingRecovery();recoveryAwaitingChoice=false;unsavedChanges=false;saveFailed=false;showSaveStatus('Serverstand geladen');notice.remove();render()};
  }
  window.WortwerkReloadLibrary=async()=>{const version=++libraryLoadVersion;clearOrganisationPointer();moveDialog.close();try{const loaded=await window.WortwerkRepository.loadLibrary(window.WortwerkModel.normalizeLibrary);if(version!==libraryLoadVersion)return;data=loaded;render();offerPendingRecovery()}catch(error){if(version!==libraryLoadVersion)return;console.error('Lernbibliothek konnte nicht geladen werden.',error);$('#content').innerHTML='<section class="empty-state"><h2>Deine Bibliothek konnte nicht geladen werden.</h2><p>Bitte prüfe deine Verbindung und lade die Seite erneut.</p><button class="quiet-button" onclick="location.reload()">Erneut laden</button></section>'}};
  window.WortwerkAppReady=window.WortwerkReloadLibrary();
})();
