import { supabase } from './supabaseClient.js';
import { cardListPage, libraryCardCounts, searchLibrary } from './library-view.mjs';
import { bindLibraryDrag } from './library-drag.mjs';
import { studyKeyboardAction } from './study-keyboard.mjs';
import { getAppAppearance } from './appearance.mjs';
import { createLibraryShare, libraryShareUrl } from './library-sharing.mjs';
import { frenchImportPrompt, importGuideExamples } from './import-guide.mjs';
import { detectImportFormat, formatFrenchVerbSide, frenchVerbExample, frenchVerbFormLabels, frenchVerbPrompt, parseFrenchVerbImport, parseFrenchVerbSide, validateFrenchVerbSide } from './french-verbs.mjs';
import { frenchVerbCardMarkup } from './french-verb-card.mjs';
import { DONATION_PRESETS_CENTS, formatDonationAmount, markDonationWelcomeShown, parseDonationAmountCents, shouldShowDonationWelcome, setDonationReminderEnabled, isDonationReminderEnabled } from './donation-values.mjs';

(() => {
  'use strict';
  const defaultFolderColor = '#7D9DBD';
  const folderPalette = [
    ['#B97575', 'Rot'], ['#C99A76', 'Orange'], ['#D9BD79', 'Gelb'], ['#86A48B', 'Grün'],
    ['#7EA9A5', 'Türkis'], [defaultFolderColor, 'Blau'], ['#617A9B', 'Dunkelblau'], ['#A094B9', 'Violett'],
    ['#C99FAC', 'Rosa'], ['#A58B78', 'Braun'], ['#D8CCBA', 'Beige'], ['#92969B', 'Grau'],
    ['#668571', 'Dunkelgrün'], ['#B2C69B', 'Hellgrün'], ['#A9C9DC', 'Hellblau'], ['#414346', 'Schwarz'],
    ['#F5F3EF', 'Weiss']
  ];
  const { subjectPalette } = window.WortwerkPresentation;
  const subjectColors = subjectPalette.map(([hex])=>hex);
  const safeColor = (value,fallback='#7895C8') => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const cardThemes = window.WortwerkCardThemes;
  const appAppearance = getAppAppearance();
  let activeCardThemeId = cardThemes.readThemeId();
  cardThemes.applyTheme(activeCardThemeId);
  const emojiChoices = [
    ['📚','lernen buch bücher bildung','Lernen'],['📖','buch lesen','Lernen'],['✏️','stift schreiben','Lernen'],['📝','notizen schreiben','Lernen'],['🎓','abschluss schule','Lernen'],['💡','idee wissen','Lernen'],['🧠','gehirn wissen','Lernen'],['🔬','wissenschaft labor','Lernen'],['🧪','chemie labor','Lernen'],['🧮','mathe rechnen','Lernen'],['💻','computer informatik','Lernen'],['🌍','welt erde geografie','Lernen'],
    ['📈','Liniendiagramm kurve statistik wirtschaft','Lernen'],['📊','Balkendiagramm säulendiagramm grafik statistik','Lernen'],['⚛️','Atom physik chemie wissenschaft','Lernen'],['🔢','Zahlen ziffern mathematik rechnen','Lernen'],['🧬','DNA dns genetik biologie','Lernen'],
    ['🇬🇧','england flagge englisch sprache','Sprachen'],['🇫🇷','frankreich flagge französisch sprache','Sprachen'],['🇪🇸','spanien flagge spanisch sprache','Sprachen'],['🇮🇹','italien flagge italienisch sprache','Sprachen'],['🇩🇪','deutschland flagge deutsch sprache','Sprachen'],['🗣️','sprechen sprache','Sprachen'],['💬','dialog sprache','Sprachen'],['🔤','buchstaben alphabet','Sprachen'],['📜','geschichte dokument','Sprachen'],['✍️','schreiben text','Sprachen'],
    ['😀','lächeln gesicht froh','Menschen'],['😎','cool gesicht','Menschen'],['🤓','brille klug','Menschen'],['👩‍🏫','lehrerin schule','Menschen'],['👨‍🏫','lehrer schule','Menschen'],['🧑‍🎓','schüler studium','Menschen'],['❤️','herz liebe','Menschen'],['⭐️','stern','Menschen'],['🏆','pokal erfolg','Menschen'],['🎯','ziel fokus','Menschen'],
    ['☠️','Totenkopf schädel skelett anatomie pirat','Menschen'],['🫀','Herzorgan herz kreislauf anatomie biologie','Menschen'],['🫁','Lunge lungen atmung anatomie biologie','Menschen'],
    ['🌱','pflanze wachsen natur','Natur'],['🌿','blatt natur','Natur'],['☘️','Kleeblatt klee pflanze glück','Natur'],['🌸','blume natur','Natur'],['🌞','sonne natur','Natur'],['🌙','mond nacht','Natur'],['🌈','regenbogen natur','Natur'],['🌊','meer wasser','Natur'],['🔥','feuer energie','Natur'],['🦋','schmetterling tier','Natur'],['🐝','biene tier','Natur'],['🐈','katze tier','Natur'],['🦉','eule tier','Natur'],
    ['⚽️','fussball fußball sport','Aktivitäten'],['🏀','basketball sport','Aktivitäten'],['🎨','kunst malen','Aktivitäten'],['🎵','musik noten','Aktivitäten'],['🎸','gitarre musik','Aktivitäten'],['🎭','theater kunst','Aktivitäten'],['♟️','schach spiel','Aktivitäten'],['🚀','rakete weltraum','Aktivitäten'],['✈️','flugzeug reisen','Aktivitäten'],['🏛️','gebäude geschichte','Aktivitäten'],['⌛️','Sanduhr zeit stunde','Aktivitäten'],['🔑','schlüssel','Aktivitäten']
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
  let librarySearchScope='',librarySearchQuery='',librarySearchLimit=100;
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
    const verb=parseFrenchVerbSide(text);
    if(verb)return{term:verb.infinitive,exampleSentence:savedExample,verb};
    if(savedExample)return{term:text,exampleSentence:savedExample};
    return window.WortwerkParser.parseExampleSide(text)||{term:text,exampleSentence:''};
  }
  function verbCardMarkup(card,side,verb){
    return frenchVerbCardMarkup(verb,cardSideContent(card,side==='front'?'back':'front').term);
  }
  function cardSideMarkup(card,side){
    const content=cardSideContent(card,side);
    const main=content.verb?verbCardMarkup(card,side,content.verb):`<span class="card-content-main">${genderMarkup(content.term)}</span>`;
    return main+(content.exampleSentence?`<span class="card-example">(${esc(content.exampleSentence)})</span>`:'');
  }
  function genderMarkup(value){return window.WortwerkPresentation.genderSegments(value).map(segment=>`<span${segment.gender?` class="gender-${segment.gender==='m'?'masculine':'feminine'}"`:''}>${esc(segment.text)}</span>`).join('')}
  function describeCardSide(card,side){
    const content=cardSideContent(card,side);
    if(content.verb){
      const {infinitive,stem,auxiliary,participle,forms}=content.verb;
      const meaning=cardSideContent(card,side==='front'?'back':'front').term;
      const description=[
        meaning,infinitive,stem&&`Imparfait-Stamm ${stem}`,auxiliary&&`Hilfsverb ${auxiliary}`,participle&&`Partizip ${participle}`,
        ...forms.filter(({pronoun})=>pronoun).map(({pronoun,form,separator})=>pronoun+separator+form),
        content.exampleSentence&&`Beispielsatz: ${content.exampleSentence}`,
      ].filter(Boolean).join('. ');
      return `${side==='back'?'Rückseite':'Vorderseite'}: ${description}`;
    }
    return `${side==='back'?'Rückseite':'Vorderseite'}: ${content.term}${content.exampleSentence?`. Beispielsatz: ${content.exampleSentence}`:''}`;
  }
  function populateStudyCard(slot,card){
    for(const side of ['front','back']){
      const {term,exampleSentence,verb}=cardSideContent(card,side);
      const copy=slot[`${side}Text`],example=slot[`${side}ExampleText`];
      copy.classList.toggle('is-verb-card',Boolean(verb));
      copy.innerHTML=verb?verbCardMarkup(card,side,verb):genderMarkup(term);
      example.textContent=exampleSentence?`(${exampleSentence})`:'';
      example.hidden=!exampleSentence;
    }
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
  let renderedLocation = '';
  function render(){
    const location=view==='donations'?'donations':`${view}:${activeSubject||''}:${activeFolder||''}:${activeSet||''}`;
    const changedLocation=location!==renderedLocation;
    const restorePageFocus=changedLocation&&Boolean(renderedLocation)&&$('#app-shell').contains(document.activeElement);
    renderedLocation=location;
    cardCounts=libraryCardCounts(data.cards);
    if(view!=='library'||activeSet)librarySorting=false;
    renderNav();
    $('#content').classList.toggle('is-sorting',librarySorting);$('#content').inert=librarySortSaving||recoveryAwaitingChoice;$('#content').setAttribute('aria-busy',String(librarySortSaving));
    if(view==='donations'){
      activeSubject=null;activeFolder=null;activeSet=null;renderDonations();
    }else if(view==='guide'){
      renderGuide();
    }else if(activeSet&&setById(activeSet)){
      renderSet();
    }else if(activeFolder&&folder(activeFolder)){
      renderFolder();renderLibrarySearch();
    }else if(activeSubject&&subject(activeSubject)){
      renderSubject();renderLibrarySearch();
    }else{
      renderLibrary();
      if(view==='library')renderDonationWelcome();
      renderLibrarySearch();
    }
    if(changedLocation)window.scrollTo({top:0,left:0,behavior:'instant'});
    if(restorePageFocus&&document.activeElement===document.body&&!$('dialog[open]')){
      const heading=$('#content h1');
      if(heading){
        heading.tabIndex=-1;
        heading.focus({preventScroll:true});
      }
    }
  }
  function renderNav(){
    document.querySelectorAll('[data-view]').forEach(button=>button.onclick=event=>{
      event.preventDefault();closeNavigation();librarySorting=false;activeSubject=null;activeFolder=null;activeSet=null;view=button.dataset.view;if(view!=='donations'){donationReturn=null;donationPayment=null}render();
      if(view==='guide')$('#guide-title')?.focus({preventScroll:true});
    });
    const atLibraryRoot=!activeSubject&&!activeFolder&&!activeSet;
    document.querySelectorAll('.app-sidebar [data-view]').forEach(button=>{
      const current=button.dataset.view===view&&(view!=='library'||atLibraryRoot);
      if(current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    $('#sidebar-subjects').innerHTML=data.subjects.map((item,index)=>{
      const hasFolders=subjectFolders(item.id).length>0,expanded=hasFolders&&expandedSidebarSubjects.has(item.id),listId=`sidebar-folders-${index}`;
      const isCurrent=view==='library'&&activeSubject===item.id&&!activeFolder&&!activeSet;
      return `<div class="sidebar-subject-group"><div class="sidebar-subject-row${view==='library'&&activeSubject===item.id?' is-current-branch':''}"><button class="sidebar-subject-open" data-sidebar-subject="${esc(item.id)}" data-drop-folder="" data-drop-subject="${esc(item.id)}" ${isCurrent?'aria-current="page"':''}><span class="sidebar-dot" style="--dot:${safeColor(item.color)}"></span><span>${esc(item.name)}</span></button>${hasFolders?`<button class="sidebar-subject-toggle" type="button" data-sidebar-toggle="${esc(item.id)}" aria-expanded="${expanded}" aria-controls="${listId}" aria-label="Ordner in ${esc(item.name)} ${expanded?'einklappen':'anzeigen'}" title="Ordner ${expanded?'einklappen':'anzeigen'}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`:''}</div>${hasFolders?`<div class="sidebar-folder-list" id="${listId}"${expanded?'':' hidden'}>${sidebarFolders(item.id)}</div>`:''}</div>`;
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
    crumbs(view==='guide'?['Anleitung']:view==='recent'?['Zuletzt gelernt']:view==='donations'?['Bibliothek','Spenden']:['Bibliothek']);
  }

  function renderGuide(){
    $('#content').innerHTML=`
      <section class="guide-page" aria-labelledby="guide-title">
        <header class="page-heading">
          <div>
            <h1 class="page-title" id="guide-title" tabindex="-1">Anleitung</h1>
            <p class="page-subtitle">Lernkarten aus Text erstellen und französische Vokabeln oder Verben für den Import vorbereiten.</p>
          </div>
        </header>
        <nav class="guide-index" aria-label="In dieser Anleitung">
          <a href="#guide-format-title" data-guide-section="guide-format-title">Textimport</a>
          <a href="#guide-prompt-title" data-guide-section="guide-prompt-title">Vokabel-Prompt</a>
          <a href="#guide-verb-title" data-guide-section="guide-verb-title">Verben-Prompt</a>
        </nav>
        <section class="guide-section" aria-labelledby="guide-format-title">
          <h2 id="guide-format-title" tabindex="-1">Lernkarten aus Text importieren</h2>
          <p>Schreibe pro Zeile eine Karte. Das erste Gleichheitszeichen trennt Vorder- und Rückseite.</p>
          <pre class="guide-example"><code>Vorderseite ((Beispielsatz vorne)) = Rückseite ((Beispielsatz hinten))</code></pre>
          <dl class="guide-format">
            <dt>Vorderseite</dt>
            <dd>Links vom <code>=</code> steht der Begriff oder die Frage, die du zuerst siehst.</dd>
            <dt>Rückseite</dt>
            <dd>Rechts vom <code>=</code> steht die Übersetzung oder Antwort.</dd>
            <dt><code>((Beispielsatz))</code></dt>
            <dd>Setze einen optionalen Beispielsatz ans Ende der jeweiligen Seite. Auf der Karte erscheint er kleiner unter dem Begriff und in einfachen Klammern.</dd>
            <dt>Französische Nomen</dt>
            <dd><code>(m)</code> steht für maskulin, <code>(f)</code> für feminin. <code>(m pl)</code> und <code>(f pl)</code> kennzeichnen die Mehrzahl. Bei <code>le</code>, <code>la</code>, <code>un</code> und <code>une</code> genügt der Artikel.</dd>
          </dl>
          <ol class="guide-steps">
            <li>Öffne einen Lernstapel und wähle <strong>Karten importieren</strong>.</li>
            <li>Füge deine Liste ein und wähle <strong>Import prüfen</strong>.</li>
            <li>Kontrolliere die Vorschau und wähle <strong>Lernkarten erstellen</strong>.</li>
          </ol>
        </section>
        <section class="guide-section" aria-labelledby="guide-prompt-title">
          <div class="guide-prompt-heading">
            <div>
              <h2 id="guide-prompt-title" tabindex="-1">KI-Prompt für französische Vokabeln</h2>
              <p>Lade deine Vokabelliste in der KI deiner Wahl hoch und sende ihr den Prompt. Füge ihre Antwort danach im Importfeld ein.</p>
            </div>
            <div class="guide-copy-actions">
              <button type="button" class="primary-button" id="guide-copy-prompt">Prompt kopieren</button>
              <p class="guide-copy-status" id="guide-copy-status" role="status"></p>
            </div>
          </div>
          <label class="sr-only" for="guide-prompt">KI-Prompt für französische Vokabeln</label>
          <textarea id="guide-prompt" class="guide-prompt" readonly spellcheck="false" rows="8"></textarea>
          <details class="guide-examples">
            <summary>Beispielausgabe ansehen</summary>
            <pre class="guide-example"><code>${esc(importGuideExamples.join('\n'))}</code></pre>
          </details>
        </section>
        <section class="guide-section" aria-labelledby="guide-verb-title">
          <div class="guide-prompt-heading">
            <div>
              <h2 id="guide-verb-title" tabindex="-1">KI-Prompt für französische Verben</h2>
              <p>Lade deine Verbenliste in der KI deiner Wahl hoch und sende ihr diesen Prompt. Füge die Antwort unter <strong>Karten importieren</strong> ein. Das Verbformat wird automatisch erkannt.</p>
            </div>
            <div class="guide-copy-actions">
              <button type="button" class="primary-button" id="guide-copy-verb-prompt">Prompt kopieren</button>
              <p class="guide-copy-status" id="guide-verb-copy-status" role="status"></p>
            </div>
          </div>
          <label class="sr-only" for="guide-verb-prompt">KI-Prompt für französische Verben</label>
          <textarea id="guide-verb-prompt" class="guide-prompt" readonly spellcheck="false" rows="8"></textarea>
          <details class="guide-examples">
            <summary>Beispielausgabe ansehen</summary>
            <pre class="guide-example"><code>${esc(frenchVerbExample)}</code></pre>
          </details>
        </section>
      </section>`;
    document.querySelectorAll('[data-guide-section]').forEach(link=>link.onclick=event=>{
      event.preventDefault();
      const title=document.getElementById(link.dataset.guideSection);
      title.focus({preventScroll:true});
      title.scrollIntoView({block:'start'});
    });
    bindGuidePrompt($('#guide-prompt'),$('#guide-copy-prompt'),$('#guide-copy-status'),frenchImportPrompt);
    bindGuidePrompt($('#guide-verb-prompt'),$('#guide-copy-verb-prompt'),$('#guide-verb-copy-status'),frenchVerbPrompt);
  }
  function bindGuidePrompt(prompt,button,status,value){
    prompt.value=value;
    button.addEventListener('click',async()=>{
      try{
        await navigator.clipboard.writeText(prompt.value);
        if(prompt.isConnected)showCopyConfirmation(status,'Prompt kopiert.');
      }catch{
        if(!prompt.isConnected)return;
        prompt.focus();
        prompt.select();
        status.textContent='Der Prompt ist markiert. Du kannst ihn jetzt kopieren.';
      }
    });
  }
  function showCopyConfirmation(status,message){
    const confirmation=document.createElement('span');
    confirmation.className='copy-confirmation';
    const check=document.createElement('span');
    check.className='copy-confirmation-check';
    check.setAttribute('aria-hidden','true');
    confirmation.append(check,message);
    status.replaceChildren(confirmation);
  }
  const mobileNavigation=window.matchMedia('(max-width:760px)');
  let sidebarCollapsed=false;try{sidebarCollapsed=localStorage.getItem('lernkarten-sidebar-collapsed')==='true'}catch{}
  $('#app-shell').classList.toggle('sidebar-collapsed',sidebarCollapsed);
  function syncNavigation(){const open=$('#app-shell').classList.contains('navigation-open')&&mobileNavigation.matches;$('#app-navigation').inert=mobileNavigation.matches?!open:sidebarCollapsed;$('.main-area').inert=open;$('#navigation-scrim').hidden=!open;$('#navigation-toggle').setAttribute('aria-expanded',String(mobileNavigation.matches?open:!sidebarCollapsed));$('#navigation-toggle').setAttribute('aria-label',mobileNavigation.matches?'Navigation öffnen':sidebarCollapsed?'Seitenleiste einblenden':'Seitenleiste ausblenden');if(open){$('#app-navigation').setAttribute('role','dialog');$('#app-navigation').setAttribute('aria-modal','true')}else{$('#app-navigation').removeAttribute('role');$('#app-navigation').removeAttribute('aria-modal')}}
  function closeNavigation(){const wasOpen=$('#app-shell').classList.contains('navigation-open');$('#app-shell').classList.remove('navigation-open');syncNavigation();if(wasOpen)$('#navigation-toggle').focus()}
  $('#navigation-toggle').onclick=()=>{if(!mobileNavigation.matches){sidebarCollapsed=!sidebarCollapsed;$('#app-shell').classList.toggle('sidebar-collapsed',sidebarCollapsed);try{localStorage.setItem('lernkarten-sidebar-collapsed',String(sidebarCollapsed))}catch{}syncNavigation();return}$('#app-shell').classList.add('navigation-open');syncNavigation();$('#navigation-close').focus()};
  $('#navigation-scrim').onclick=closeNavigation;$('#navigation-close').onclick=closeNavigation;
  mobileNavigation.addEventListener('change',()=>{if(!mobileNavigation.matches)$('#app-shell').classList.remove('navigation-open');syncNavigation()});syncNavigation();
  const accountMenu=$('.account-menu');
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      closeNavigation();
      if(accountMenu.open){
        const restoreFocus=accountMenu.contains(document.activeElement);
        accountMenu.open=false;
        if(restoreFocus)$('summary',accountMenu).focus();
      }
    }
    if(event.key==='Tab'&&$('#app-shell').classList.contains('navigation-open')&&mobileNavigation.matches){const controls=[...$('#app-navigation').querySelectorAll('a,button')].filter(element=>!element.disabled&&element.getClientRects().length),first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
  });
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
    welcome.innerHTML=`<div class="donation-welcome-copy"><h2 id="donation-welcome-title">Gemeinsam weiterlernen.</h2><p>Lernkarten Maker bleibt kostenlos. Mit einer freiwilligen Spende hilfst du bei der Weiterentwicklung.</p></div><div class="donation-welcome-actions"><button type="button" class="quiet-button" data-donation-welcome="donate">Jetzt spenden</button><button type="button" class="text-button" data-donation-welcome="continue">Nicht jetzt</button></div><button type="button" class="icon-button donation-welcome-close" data-donation-welcome="continue" aria-label="Begrüssung schliessen" title="Schliessen">×</button>`;
    const heading=$('#content .page-heading');if(heading)heading.after(welcome);else $('#content').prepend(welcome);
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
  function subjectSymbol(item,fallback='📚'){
    const icon=item.emoji||item.icon||fallback;
    const flag=icon==='🇫🇷'?'<svg class="subject-flag" viewBox="0 0 36 26" aria-hidden="true"><path fill="#0055A4" d="M0 0h12v26H0z"/><path fill="#FFF" d="M12 0h12v26H12z"/><path fill="#EF4135" d="M24 0h12v26H24z"/></svg>':`<span class="subject-glyph">${esc(icon)}</span>`;
    return `<span class="subject-icon" aria-hidden="true">${flag}</span>`;
  }
  function subjectCardStyle(value,fallback){
    const { subjectSurface, colourInk } = window.WortwerkPresentation;
    const surface=subjectSurface(safeColor(value,fallback));
    return `--subject-surface:${surface};--subject-ink:${colourInk(surface)}`;
  }
  function subjectCardContents(item,fallbackIcon){
    const sets=item.id?subjectSets(item.id):[];
    const count=sets.reduce((sum,set)=>sum+(cardCounts.get(set.id)||0),0);
    return `<div class="subject-card-top">${subjectSymbol(item,fallbackIcon)}<span class="card-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></span></div><div class="subject-card-copy"><h2>${esc(item.name)}</h2><p>${sets.length} Lernstapel · ${count} ${count===1?'Karte':'Karten'}</p></div>`;
  }
  function folderSymbol(){
    return '<svg viewBox="0 0 64 52" fill="none" aria-hidden="true"><path d="M4 13a6 6 0 0 1 6-6h15l6 6h23a6 6 0 0 1 6 6v25a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V13Z" fill="currentColor"/><path d="M4 20a5 5 0 0 1 5-5h46a5 5 0 0 1 5 5v24a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V20Z" fill="currentColor" stroke="white" stroke-opacity=".22"/><path d="M10 18h44" stroke="white" stroke-opacity=".28" stroke-linecap="round"/></svg>';
  }
  function dropAttributes(subjectId,folderId){return `data-drop-subject="${esc(subjectId)}" data-drop-folder="${esc(folderId||'')}"`}
  function sidebarFolders(subjectId,parentId=null,depth=0,seen=new Set()){
    return subjectFolders(subjectId).filter(item=>(item.parentId||null)===parentId&&!seen.has(item.id)).map(item=>{
      seen.add(item.id);
      return `<button class="sidebar-folder" data-sidebar-folder="${esc(item.id)}" ${dropAttributes(subjectId,item.id)} style="--folder-depth:${Math.min(depth,6)};--dot:${safeColor(item.color,defaultFolderColor)}" ${activeFolder===item.id?'aria-current="page"':''}>${folderSymbol()}<span>${esc(item.name)}</span></button>${sidebarFolders(subjectId,item.id,depth+1,seen)}`;
    }).join('');
  }
  function itemActions(type,item){
    return `<details class="item-menu"><summary aria-label="Aktionen für ${esc(item.name)}" title="Aktionen"><svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></summary><div class="item-menu-panel"><button data-move-item="${type}" data-item-id="${esc(item.id)}">Verschieben …</button><button data-item-edit="${type}" data-item-id="${esc(item.id)}">${type==='folder'?'Name & Farbe ändern':'Bearbeiten & Design'}</button>${shareButton(type,item)}<button class="danger-action" data-item-delete="${type}" data-item-id="${esc(item.id)}">${type==='folder'?'Ordner':'Lernstapel'} löschen</button></div></details>`;
  }
  function shareButton(kind,item,detail=false){
    return `<button type="button" class="library-share-button${detail?' quiet-button':''}" data-share-kind="${kind}" data-item-id="${esc(item.id)}" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M7 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-2"/></svg>Teilen</button>`;
  }
  function libraryDetailActions(kind,item,markup){
    return `<div class="library-detail-actions">${shareButton(kind,item,true)}${managementActions(markup)}</div>`;
  }
  document.addEventListener('click',event=>{
    if(accountMenu.open&&!accountMenu.contains(event.target))accountMenu.open=false;
    document.querySelectorAll(':is(.management-menu,.item-menu)[open]').forEach(menu=>{
      if(!menu.contains(event.target))menu.open=false;
    });
    const move=event.target.closest('[data-move-item]');
    if(move){event.preventDefault();event.stopPropagation();const menu=move.closest('details');if(menu?.open)closeLibraryMenu(menu);openMoveDialog(move.dataset.moveItem,move.dataset.itemId);return}
    const remove=event.target.closest('[data-item-delete]');
    if(remove){event.preventDefault();const menu=remove.closest('details');if(menu?.open)closeLibraryMenu(menu);if(remove.dataset.itemDelete==='folder')deleteFolder(remove.dataset.itemId);else deleteSet(remove.dataset.itemId);return}
    const edit=event.target.closest('[data-item-edit]');
    if(edit){event.preventDefault();event.stopPropagation();const menu=edit.closest('details');if(menu?.open)closeLibraryMenu(menu);editEntity(edit.dataset.itemEdit,edit.dataset.itemId);return}
    const share=event.target.closest('[data-share-kind]');
    if(share){
      const menu=share.closest('details');
      const opener=menu?.querySelector('summary')||share;
      if(menu)menu.open=false;
      openShareDialog(share.dataset.shareKind,share.dataset.itemId,opener);
      return;
    }
  });
  function closeLibraryMenu(menu){
    menu.open=false;
    menu.querySelector('summary').focus({preventScroll:true});
  }
  $('#content').addEventListener('click',event=>{
    const action=event.target.closest('.management-menu-panel button:not(:disabled)');
    // Restore the trigger's focus before the action opens a modal.
    if(action)closeLibraryMenu(action.closest('.management-menu'));
  },{capture:true});
  $('#content').addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const menu=event.target.closest(':is(.management-menu,.item-menu)[open]');
    if(!menu)return;
    event.preventDefault();
    closeLibraryMenu(menu);
  });
  $('#content').addEventListener('contextmenu',event=>{
    const tile=event.target.closest('.set-card,.folder-card'),menu=tile?.querySelector('.item-menu');
    if(menu&&!librarySortSaving){event.preventDefault();document.querySelectorAll('.item-menu[open]').forEach(item=>item.removeAttribute('open'));menu.open=true;menu.querySelector('button')?.focus()}
  });

  let shareContext=null;
  const shareDialog=$('#share-dialog');
  const shareCreate=$('#share-create');
  const shareCopy=$('#share-copy');
  const shareNative=$('#share-native');
  const shareUrlField=$('#share-url');
  const shareStatus=$('#share-status');
  const shareError=$('#share-error');
  function setShareError(message=''){
    shareError.textContent=message;
    shareError.hidden=!message;
  }
  function openShareDialog(kind,itemId,opener){
    if(librarySortSaving||shareDialog.open)return;
    const item=kind==='folder'?folder(itemId):setById(itemId);
    if(!item)return;
    shareContext={kind,itemId,name:item.name,owner:data,opener};
    $('#share-title').textContent=kind==='folder'?'Ordner teilen':'Lernstapel teilen';
    $('#share-item-name').textContent=item.name;
    $('#share-explanation').textContent=kind==='folder'
      ? 'Wer den Link hat, sieht eine Vorschau und kann den Ordner samt Unterordnern und Lernstapeln in die eigene Bibliothek kopieren.'
      : 'Wer den Link hat, sieht eine Vorschau und kann den Lernstapel in die eigene Bibliothek kopieren.';
    shareUrlField.value='';
    $('#share-link-field').hidden=true;
    shareCopy.hidden=true;
    shareNative.hidden=true;
    shareCreate.hidden=false;
    shareCreate.disabled=false;
    shareCreate.textContent='Link erstellen';
    shareStatus.textContent='';
    setShareError();
    shareDialog.showModal();
    shareCreate.focus();
  }
  function isCurrentShare(context){
    return context&&shareDialog.open&&shareContext===context&&context.owner===data;
  }
  $('#share-close').addEventListener('click',()=>shareDialog.close());
  shareDialog.addEventListener('close',()=>{
    if(shareDialog.open)return;
    const context=shareContext;
    shareContext=null;
    shareUrlField.value='';
    $('#share-item-name').textContent='';
    shareStatus.textContent='';
    setShareError();
    if(context?.owner===data&&context.opener?.isConnected)context.opener.focus();
  });
  shareDialog.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();
    const context=shareContext;
    if(!isCurrentShare(context)||shareCreate.disabled||shareCreate.hidden)return;
    shareCreate.disabled=true;
    shareCreate.textContent='Link wird vorbereitet …';
    setShareError();
    try{
      let userId;
      try{
        userId=await window.WortwerkRepository.flushLibraryWrites();
      }catch{
        if(isCurrentShare(context))setShareError('Speichere deine Änderungen und versuche es erneut.');
        return;
      }
      if(!isCurrentShare(context))return;
      const token=await createLibraryShare(context.kind,context.itemId,userId);
      if(!isCurrentShare(context))return;
      shareUrlField.value=libraryShareUrl(token);
      $('#share-link-field').hidden=false;
      shareUrlField.setSelectionRange(0,0);
      shareUrlField.scrollLeft=0;
      shareCreate.hidden=true;
      shareCopy.hidden=false;
      shareNative.hidden=typeof navigator.share!=='function';
      shareCopy.focus();
    }catch(error){
      if(!isCurrentShare(context))return;
      if(error?.code==='P0002')setShareError('Dieser Inhalt ist in deiner Bibliothek nicht mehr verfügbar.');
      else if(error?.code==='42501')setShareError('Melde dich erneut an, um diesen Inhalt zu teilen.');
      else setShareError('Der Link konnte nicht erstellt werden. Prüfe deine Verbindung und versuche es erneut.');
    }finally{
      if(isCurrentShare(context)){
        shareCreate.disabled=false;
        shareCreate.textContent='Link erstellen';
      }
    }
  });
  shareCopy.addEventListener('click',async()=>{
    const context=shareContext;
    if(!isCurrentShare(context)||!shareUrlField.value)return;
    try{
      await navigator.clipboard.writeText(shareUrlField.value);
      if(!isCurrentShare(context))return;
      showCopyConfirmation(shareStatus,'Link kopiert.');
    }catch{
      if(!isCurrentShare(context))return;
      shareUrlField.focus();
      shareUrlField.select();
      shareStatus.textContent='Der Link ist markiert. Du kannst ihn manuell kopieren.';
    }
  });
  shareNative.addEventListener('click',async()=>{
    const context=shareContext;
    if(!isCurrentShare(context)||!shareUrlField.value)return;
    try{
      await navigator.share({title:context.name,url:shareUrlField.value});
    }catch(error){
      if(isCurrentShare(context)&&error.name!=='AbortError')shareStatus.textContent='Verwende „Link kopieren“, um den Link weiterzugeben.';
    }
  });

  let moveContext=null;
  const moveDialog=$('#move-dialog');
  const libraryModel=window.WortwerkModel;
  const libraryItem=(type,key)=>({subject,folder,set:setById})[type]?.(key);
  const parentId=(type,item)=>(type==='folder'?item.parentId:item.folderId)||null;
  const locationSnapshot=()=>({activeSubject,activeFolder,activeSet,view,librarySorting,scrollY:window.scrollY});
  function openMoveDialog(type,itemId){
    if(librarySortSaving)return;
    const item=libraryItem(type,itemId);if(!item)return;
    const currentId=parentId(type,item);
    moveContext={type,id:itemId,owner:data,destinations:new Map()};
    $('#move-item-name').textContent=item.name;
    $('#move-origin').textContent=`Aktuell: ${subject(item.subjectId)?.name||'Fach'}${currentId?' / '+folderLabel(folder(currentId)):' · direkt im Fach'}`;
    $('#move-destination').innerHTML=data.subjects.map(destination=>{
      const entries=[{id:null,name:'Direkt im Fach'},...subjectFolders(destination.id).map(entry=>({id:entry.id,name:folderLabel(entry)}))];
      const options=entries.map(entry=>{
        const current=destination.id===item.subjectId&&entry.id===currentId;
        const move={type,id:itemId,subjectId:destination.id,folderId:entry.id};
        if(!current&&!libraryModel.canMoveLibraryItem(data,move))return '';
        const key=entry.id||`subject:${destination.id}`;
        moveContext.destinations.set(key,move);
        return `<option value="${esc(key)}"${current?' selected':''}>${esc(entry.name)}${current?' (aktueller Speicherort)':''}</option>`;
      }).join('');
      return options?`<optgroup label="${esc(destination.name)}">${options}</optgroup>`:'';
    }).join('');
    updateMoveDestination();moveDialog.showModal();
  }
  function updateMoveDestination(){
    const move=moveContext?.destinations.get($('#move-destination').value);
    $('#move-submit').disabled=!move||!libraryModel.canMoveLibraryItem(data,move);
  }
  $('#move-destination').addEventListener('change',updateMoveDestination);
  moveDialog.querySelectorAll('[data-cancel-move]').forEach(button=>button.onclick=()=>moveDialog.close());
  moveDialog.addEventListener('close',()=>{moveContext=null});
  $('#move-form').addEventListener('submit',event=>{
    event.preventDefault();if(!moveContext||moveContext.owner!==data||$('#move-submit').disabled)return;
    const move=moveContext.destinations.get($('#move-destination').value);
    moveDialog.close();performLibraryMove(move);
  });
  function performLibraryMove(options,visual,landing,origin){
    const item=libraryItem(options.type,options.id);if(!item){visual?.finish(null);return Promise.resolve(false)}
    const destination=options.folderId?folder(options.folderId)?.name:subject(options.subjectId||item.subjectId)?.name;
    return persistOrganisation(()=>{
      const changed=libraryModel.moveLibraryItem(data,options);
      if(changed&&activeSet===options.id&&options.type==='set'){
        activeSubject=options.subjectId||item.subjectId;
        activeFolder=options.folderId;
      }
      return changed;
    },options.targetId?'Reihenfolge gespeichert.':`„${item.name}“ nach „${destination}“ verschoben.`,null,visual,landing,origin);
  }

  function dragSource(tile){
    if(librarySortSaving||recoveryAwaitingChoice||entitySaving||view!=='library'||$('dialog[open]'))return null;
    const {sortType:type,sortId:id}=tile.dataset;
    const item=libraryItem(type,id);
    if(!item)return null;
    const index=type==='subject'?data.subjects.findIndex(entry=>entry.id===id):null;
    return {type,id,index,owner:data,origin:locationSnapshot(),valid:new Map()};
  }
  function dragTile(type,id){
    return $(`#content [data-sort-type="${type}"][data-sort-id="${CSS.escape(id)}"]`);
  }
  function canDragMove(source,move){
    if(source.owner!==data)return false;
    const key=JSON.stringify(move);
    if(!source.valid.has(key))source.valid.set(key,libraryModel.canMoveLibraryItem(data,move));
    return source.valid.get(key);
  }
  function destinationMove(source,element){
    if(!element||source.type==='subject')return null;
    const {dropSubject:subjectId,dropFolder:folderId}=element.dataset;
    const move={type:source.type,id:source.id,subjectId,folderId:folderId||null};
    return canDragMove(source,move)?move:null;
  }
  function visibleDragTargets(source){
    if(source.type==='subject')return [];
    return [...document.querySelectorAll('[data-drop-folder]')].filter(element=>element.getClientRects().length&&destinationMove(source,element));
  }
  function dragDestinationBar(source){
    if(source.type==='subject')return null;
    const bar=document.createElement('div');
    bar.className='library-drag-destinations';
    bar.setAttribute('aria-label','Ablageziele');
    bar.innerHTML=data.subjects.map(item=>{
      const move={type:source.type,id:source.id,subjectId:item.id,folderId:null};
      if(!canDragMove(source,move))return '';
      return `<span ${dropAttributes(item.id,null)}>${esc(item.name)}</span>`;
    }).join('');
    if(!bar.children.length)return null;
    document.body.append(bar);
    return bar;
  }
  function resolveDragTarget(source,hit,x,y){
    const tile=hit?.closest('#content [data-sort-id]');
    if(tile?.dataset.sortId===source.id&&tile.dataset.sortType===source.type)return null;
    if(tile?.dataset.sortType===source.type){
      const target=libraryItem(source.type,tile.dataset.sortId);
      if(!target)return null;
      const rect=tile.getBoundingClientRect();
      const columns=getComputedStyle(tile.parentElement).gridTemplateColumns.split(' ').length;
      const fraction=columns>1?(x-rect.left)/rect.width:(y-rect.top)/rect.height;
      // The centre of a folder nests. Its edges insert beside it.
      const inside=source.type==='folder'&&fraction>.27&&fraction<.73;
      if(!inside){
        const placement=fraction<.5?'before':'after';
        const move={type:source.type,id:source.id,targetId:target.id,placement};
        if(source.type!=='subject')Object.assign(move,{subjectId:target.subjectId,folderId:parentId(source.type,target)});
        const targetIndex=source.type==='subject'?data.subjects.indexOf(target):null;
        const valid=source.type==='subject'
          ? source.index!==targetIndex-Number(source.index<targetIndex)+Number(placement==='after')
          : canDragMove(source,move);
        if(valid)return {element:tile,move,placement,label:`${placement==='before'?'Vor':'Nach'} „${target.name}“ einordnen`};
        return null;
      }
    }
    const element=hit?.closest('[data-drop-folder]');
    const move=destinationMove(source,element);
    if(!move)return null;
    const label=(move.folderId?folder(move.folderId):subject(move.subjectId))?.name;
    const alreadyHere=activeSubject===move.subjectId&&activeFolder===move.folderId;
    return {element,move,open:!alreadyHere,key:JSON.stringify([move.subjectId,move.folderId]),label:`In „${label}“ verschieben`};
  }
  function navigateDrag(source,{move}){
    if(source.owner!==data)return false;
    activeSubject=move.subjectId;activeFolder=move.folderId;activeSet=null;librarySorting=false;
    expandedSidebarSubjects.add(activeSubject);
    render();
    return true;
  }
  function cancelDragNavigation(source){
    if(source.owner!==data)return null;
    ({activeSubject,activeFolder,activeSet,view,librarySorting}=source.origin);
    render();
    window.scrollTo({top:source.origin.scrollY,behavior:'instant'});
    return dragTile(source.type,source.id);
  }
  const clearOrganisationPointer=bindLibraryDrag({
    identify:dragSource,targets:visibleDragTargets,resolve:resolveDragTarget,destinations:dragDestinationBar,
    navigate:navigateDrag,cancelNavigation:cancelDragNavigation,
    drop(source,target,visual){
      if(source.owner!==data){visual.finish(null);return}
      const {move,element}=target;
      const landing=()=>{
        const moved=dragTile(source.type,source.id);if(moved)return moved;
        if(element.isConnected&&element.getClientRects().length)return element;
        const destination=[...document.querySelectorAll('[data-drop-folder]')].filter(item=>item.getClientRects().length&&item.dataset.dropSubject===move.subjectId&&item.dataset.dropFolder===(move.folderId||''));
        return destination.find(item=>item.classList.contains('folder-card'))||destination.find(item=>item.closest('#content'))||destination[0];
      };
      if(source.type==='subject')reorderItem(move.type,move.id,move.targetId,move.placement,visual,landing);
      else performLibraryMove(move,visual,landing,source.origin);
    }
  });

  function appearanceFields(type,color,preview){
    const isSubject=type==='subject';
    const palette=isSubject?subjectPalette:folderPalette;
    const swatches=palette.map(([hex,name])=>{
      const selected=hex.toLowerCase()===color.toLowerCase();
      return `<button type="button" class="appearance-preset${selected?' selected':''}" data-color="${hex}" aria-label="${name}" aria-pressed="${selected}" title="${name}" style="--swatch:${hex}"><span class="appearance-preset-chip" aria-hidden="true"></span><span>${name}</span></button>`;
    }).join('');
    return `<fieldset class="appearance-field"><legend>${isSubject?'Fachfarbe':'Ordnerfarbe'}</legend><input type="hidden" id="f-color" name="color" value="${color}">${preview}<div class="color-palette" role="group" aria-label="${isSubject?'Farbstift-Schachtel':'Schulordner-Farbpalette'}">${swatches}</div><div class="custom-colour"><label for="colour-picker">Eigene Farbe</label><input type="color" id="colour-picker" value="${color}" aria-label="Eigene Farbe wählen"><label class="sr-only" for="colour-hex">Farbcode</label><input type="text" id="colour-hex" value="${color}" pattern="#[0-9a-fA-F]{6}" maxlength="7" required aria-label="Farbcode" spellcheck="false" autocomplete="off"></div></fieldset>`;
  }
  function bindColourPicker(){
    const input=$('#f-color'),picker=$('#colour-picker'),hex=$('#colour-hex');
    const subjectPreview=$('#subject-card-preview'),folderPreview=$('#folder-colour-preview');
    const swatches=document.querySelectorAll('#form-fields [data-color]');
    const choose=(color,fromHex=false)=>{
      if(!/^#[0-9a-f]{6}$/i.test(color))return;
      input.value=color;picker.value=color;if(!fromHex)hex.value=color.toUpperCase();
      if(subjectPreview)subjectPreview.style.cssText=subjectCardStyle(color);
      folderPreview?.style.setProperty('--dot',color);
      swatches.forEach(button=>{const selected=button.dataset.color.toLowerCase()===color.toLowerCase();button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});
    };
    swatches.forEach(button=>button.onclick=()=>choose(button.dataset.color));
    picker.addEventListener('input',()=>choose(picker.value));hex.addEventListener('input',()=>choose(hex.value,true));
    if(folderPreview){
      const name=$('#f-name'),previewName=$('#folder-preview-name');
      name.addEventListener('input',()=>{previewName.textContent=name.value.trim()||'Ordnername'});
    }
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
    $('#breadcrumbs').innerHTML=entries.map((part,index)=>`<span>${index===entries.length-1?`<b aria-current="location" title="${esc(part.label)}" ${part.level==='folder'?dropAttributes(folder(part.id)?.subjectId,part.id):''}>${esc(part.label)}</b>`:`<button class="breadcrumb-link" title="${esc(part.label)}" data-crumb="${index}" ${part.level==='subject'?dropAttributes(part.id,null):part.level==='folder'?dropAttributes(folder(part.id)?.subjectId,part.id):''}>${esc(part.label)}</button>`}</span>`).join('');
    $('#breadcrumbs').querySelectorAll('[data-crumb]').forEach(button=>button.onclick=()=>{const part=entries[Number(button.dataset.crumb)];librarySorting=false;activeSet=null;view='library';if(part.level==='library'){activeSubject=null;activeFolder=null}else if(part.level==='subject'){activeSubject=part.id;activeFolder=null}else if(part.level==='folder'){activeFolder=part.id;activeSubject=folder(part.id)?.subjectId||activeSubject}render()});
  }
  function libraryCrumbs(item,tail){return [{label:'Bibliothek',level:'library'},{label:subject(item.subjectId)?.name||'Fach',level:'subject',id:item.subjectId},...folderPath(item.folderId||item.parentId).map(part=>({label:part.name,level:'folder',id:part.id})),{label:item.name,...(tail?{}:{level:'folder',id:item.id})}]}
  function managementActions(markup){return `<details class="management-menu"><summary>Verwalten <span class="management-chevron" aria-hidden="true"></span></summary><div class="management-menu-panel">${markup}</div></details>`}
  function sortingButton(){return `<button type="button" class="quiet-button sort-toggle" data-toggle-sort aria-pressed="${librarySorting}" ${librarySortSaving?'disabled':''}>${librarySorting?'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg> Fertig':'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V4m-3 3 3-3 3 3m5-3v12m-3-3 3 3 3-3"/></svg> Reihenfolge'}</button>`}
  function sortControls(type,item){if(!librarySorting)return '';const siblings=window.WortwerkModel.getLibrarySiblings(data,type,item.id),index=siblings.findIndex(record=>record.id===item.id);return `<div class="sort-controls"><button type="button" class="sort-handle" data-sort-handle aria-label="${esc(item.name)} ziehen zum Sortieren" title="Ziehen zum Sortieren" ${librarySortSaving?'disabled':''}>⠿</button><span class="sort-position">${index+1} / ${siblings.length}</span><button type="button" data-sort-step="-1" aria-label="${esc(item.name)} früher anordnen" title="Früher anordnen" ${index===0||librarySortSaving?'disabled':''}>←</button><button type="button" data-sort-step="1" aria-label="${esc(item.name)} später anordnen" title="Später anordnen" ${index===siblings.length-1||librarySortSaving?'disabled':''}>→</button></div>`}
  function sortAttributes(type,item){return `data-sort-type="${type}" data-sort-id="${esc(item.id)}"`}
  async function persistOrganisation(change,message,focusId,visual,landing,origin){
    if(librarySortSaving||recoveryAwaitingChoice||entitySaving){visual?.finish();return false}
    const owner=data;
    const before={subjects:data.subjects,folders:data.folders,sets:data.sets};
    const location=origin||locationSnapshot();
    let saved=false;
    Object.assign(data,structuredClone(before));
    if(!change()){Object.assign(data,before);visual?.finish();return false}
    const after={subjects:data.subjects,folders:data.folders,sets:data.sets};
    librarySortSaving=true;render();
    visual?.finish(landing?.()||null);
    try{
      await window.WortwerkRepository.saveLibraryOrganisation(before,after);
      if(data!==owner)return false;
      saved=true;toast(message);return true;
    }catch(error){
      if(data!==owner)return false;
      Object.assign(data,before);
      ({activeSubject,activeFolder,activeSet,view,librarySorting}=location);
      if(error?.code==='40001'){
        toast('Die Reihenfolge oder Ablage wurde inzwischen geändert. Deine Bibliothek wird neu geladen.');
        const reloadVersion=libraryLoadVersion+1;
        await window.WortwerkReloadLibrary();
        if(libraryLoadVersion!==reloadVersion)return false;
        librarySortSaving=false;
        $('#content').inert=recoveryAwaitingChoice;
        $('#content').setAttribute('aria-busy','false');
        if(data!==owner)render();
        return false;
      }else {
        toast('Die Verschiebung konnte nicht gespeichert werden. Prüfe deine Verbindung und versuche es erneut.');
      }
      return false;
    }finally{
      if(data===owner&&librarySortSaving){
        librarySortSaving=false;
        if(saved&&visual&&!librarySorting){
          $('#content').inert=recoveryAwaitingChoice;
          $('#content').setAttribute('aria-busy','false');
          $('#content [data-toggle-sort]')?.removeAttribute('disabled');
        }else {
          render();
          if(!saved)window.scrollTo({top:location.scrollY,behavior:'instant'});
        }
        if(focusId){
          const tile=[...document.querySelectorAll('[data-sort-id]')].find(el=>el.dataset.sortId===focusId);
          (tile?.querySelector('[data-sort-handle]')||tile)?.focus();
        }
      }
    }
  }
  function reorderItem(type,itemId,targetId,placement,visual,landing){
    return persistOrganisation(()=>libraryModel.reorderLibraryItems(data,{type,id:itemId,targetId,placement}),'Reihenfolge gespeichert.',visual?null:itemId,visual,landing);
  }
  $('#content').addEventListener('click',event=>{
    if(event.target.closest('[data-toggle-sort]')){librarySorting=!librarySorting;render();document.querySelector('[data-toggle-sort]')?.focus();return}
    const step=event.target.closest('[data-sort-step]');if(!step)return;
    const tile=step.closest('[data-sort-id]'),{sortType:type,sortId:itemId}=tile.dataset,siblings=window.WortwerkModel.getLibrarySiblings(data,type,itemId),index=siblings.findIndex(item=>item.id===itemId),direction=Number(step.dataset.sortStep),target=siblings[index+direction];
    if(target)reorderItem(type,itemId,target.id,direction>0?'after':'before');
  });
  const searchIcon='<svg class="library-search-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m13 13 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  function renderLibrarySearch(){
    if(activeSet||view==='donations'||librarySorting||!data.subjects.length)return;
    const scope=`${view}:${activeSubject||''}:${activeFolder||''}`;
    if(librarySearchScope!==scope){librarySearchScope=scope;librarySearchQuery='';librarySearchLimit=100}
    const heading=$('.page-heading, .subpage-heading');if(!heading)return;
    const toolbar=document.createElement('div');toolbar.className='library-search-toolbar';
    const location=activeFolder?folder(activeFolder)?.name:activeSubject?subject(activeSubject)?.name:view==='recent'?'Zuletzt gelernt':'Bibliothek';
    toolbar.innerHTML=`<div class="library-search">${searchIcon}<input id="library-search" type="search" aria-label="${esc(location)} durchsuchen" autocomplete="off" placeholder="${activeSubject?'Namen oder Ablageort suchen':'Fächer, Ordner oder Lernstapel suchen'}" value="${esc(librarySearchQuery)}"><button class="icon-button library-search-clear" type="button" aria-label="Suche zurücksetzen" title="Suche zurücksetzen" hidden><svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10m0-10L5 15"/></svg></button></div><span class="library-search-summary" role="status"></span>`;
    heading.after(toolbar);
    const results=document.createElement('div');results.className='library-search-results';results.hidden=true;toolbar.after(results);
    $('#library-search').addEventListener('input',event=>{librarySearchQuery=event.currentTarget.value;librarySearchLimit=100;refreshLibrarySearch()});
    $('.library-search-clear').onclick=()=>{librarySearchQuery='';librarySearchLimit=100;$('#library-search').value='';refreshLibrarySearch();$('#library-search').focus()};
    refreshLibrarySearch();
  }
  function refreshLibrarySearch(){
    const toolbar=$('.library-search-toolbar'),results=$('.library-search-results');if(!toolbar||!results)return;
    const searching=Boolean(librarySearchQuery.trim());
    for(const child of $('#content').children){
      if(child===toolbar||child===results||child.matches('.page-heading, .subpage-heading'))continue;
      if(searching&&!child.hidden){child.dataset.librarySearchHidden='true';child.hidden=true}
      else if(!searching&&child.dataset.librarySearchHidden){delete child.dataset.librarySearchHidden;child.hidden=false}
    }
    results.hidden=!searching;$('.library-search-clear').hidden=!searching;
    if(!searching){results.innerHTML='';$('.library-search-summary').textContent=activeFolder?'Mit Unterordnern':activeSubject?'Im ganzen Fach':'';return}
    const recentIds=view==='recent'?(data.recent||[]).map(item=>item.setId):null;
    const found=searchLibrary(data,librarySearchQuery,{subjectId:activeSubject,folderId:activeFolder,setIds:recentIds,limit:librarySearchLimit});
    const count=found.subjects.length+found.folders.length+found.sets.length;
    $('.library-search-summary').textContent=`${count<found.total?`${count} von `:''}${found.total} Treffer`;
    const group=(entries,type,label)=>entries.length?`<section class="library-search-group"><h2>${label}<span class="count-label">${entries.length}</span></h2>${entries.map(({item,path})=>`<button type="button" class="library-search-result" data-open-${type}="${esc(item.id)}"><span class="library-search-result-icon" style="--dot:${safeColor(item.color)}" aria-hidden="true">${type==='folder'?folderSymbol():type==='subject'?'▤':'<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 18H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="8" y="6" width="13" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'}</span><span class="library-search-result-copy"><strong>${esc(item.name)}</strong><small>${esc(path)}</small></span><span class="library-search-result-kind">${type==='set'?`${cardCounts.get(item.id)||0} ${(cardCounts.get(item.id)||0)===1?'Karte':'Karten'}`:type==='subject'?'Fach':'Ordner'}</span><span aria-hidden="true">→</span></button>`).join('')}</section>`:'';
    results.innerHTML=group(found.subjects,'subject','Fächer')+group(found.folders,'folder','Ordner')+group(found.sets,'set','Lernstapel')+(!found.total?'<div class="library-search-empty"><h2>Keine passenden Inhalte</h2><p>Versuche einen anderen Namen oder Ablageort.</p></div>':'')+(count<found.total?'<button class="quiet-button" type="button" id="library-search-more">Weitere 100 Ergebnisse anzeigen</button>':'');
    $('#library-search-more')?.addEventListener('click',()=>{librarySearchLimit+=100;refreshLibrarySearch()});
    bindSubjectCards();bindFolderCards();bindSetCards();
  }
  function renderLibrary(){
    activeSubject=null;activeFolder=null;activeSet=null;
    if(view==='recent'){
      const recentSets=[...new Set(data.recent.map(item=>item.setId))].map(setById).filter(Boolean).slice(0,30);
      $('#content').innerHTML=`<div class="page-heading"><div><h1 class="page-title">Zuletzt gelernt</h1><p class="page-subtitle">Hier findest du deine zuletzt geöffneten Lernstapel und kannst direkt weiterlernen.</p></div></div>${recentSets.length?`<div class="set-grid">${recentSets.map(setCard).join('')}</div>`:empty('Noch keine Lernrunde','Öffne einen Lernstapel und starte deine erste Runde. Deine letzten Stapel erscheinen danach hier.',true)}`;
      $('#empty-to-library')?.addEventListener('click',()=>{view='library';render();$('#content').focus({preventScroll:true})});
      bindSetCards();return;
    }
    const subjectCards=data.subjects.map((item,index)=>`<article class="subject-card" ${sortAttributes('subject',item)} tabindex="0" data-open-subject="${esc(item.id)}" style="${subjectCardStyle(item.color,subjectColors[index%subjectColors.length])}">${subjectCardContents(item,icons[index%icons.length])}${sortControls('subject',item)}</article>`).join('');
    $('#content').innerHTML=`<div class="page-heading"><div><h1 class="page-title">Bibliothek</h1><p class="page-subtitle">Deine Fächer, Ordner und Lernstapel.</p></div><div class="page-primary-actions"><button class="quiet-button" id="home-add-subject">＋ Fach anlegen</button><button class="primary-button" id="home-create-set">＋ Lernstapel erstellen</button></div></div>${data.subjects.length?`<section class="library-section"><div class="section-head"><h2>Fächer <span class="count-label">${data.subjects.length}</span></h2>${data.subjects.length>1?sortingButton():''}</div>${librarySorting?'<p class="sort-instructions">Halte eine Kachel gedrückt und ziehe sie an eine neue Stelle. Du kannst auch die Pfeile verwenden.</p>':''}<div class="subject-grid">${subjectCards}</div></section>`:empty('Dein Lernraum ist noch leer','Lege ein Fach an, um deine Lernstapel zu organisieren.')}`;
    $('#home-add-subject')?.addEventListener('click',()=>openEntity('subject'));
    $('#home-create-set')?.addEventListener('click',()=>openEntity('set'));
    bindSubjectCards();bindSetCards();
  }
  function empty(title,copy,showLibraryLink=false){
    return `<div class="empty-state"><h2>${title}</h2><p>${copy}</p>${showLibraryLink?'<button type="button" class="quiet-button" id="empty-to-library">Zur Bibliothek</button>':''}</div>`;
  }
  function bindSubjectCards(){
    document.querySelectorAll('[data-open-subject]').forEach(element=>{
      const open=()=>{activeSubject=element.dataset.openSubject;expandedSidebarSubjects.add(activeSubject);activeFolder=null;activeSet=null;view='library';render()};
      element.onclick=event=>{if((event.target.closest('button,details')&&event.target.closest('button,details')!==element)||librarySorting)return;open()};element.onkeydown=event=>{if(event.target===element&&!librarySorting&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open()}};
    });
  }
  function setCard(set){
    const parent=folder(set.folderId),sub=subject(set.subjectId),count=cardCounts.get(set.id)||0,theme=cardThemes.getTheme(cardThemes.resolveSetThemeId(set,activeCardThemeId));
    return `<article class="set-card" ${sortAttributes('set',set)} tabindex="0" data-open-set="${esc(set.id)}" style="--set-front:${theme.front.surface};--set-back:${theme.back.surface}"><div class="set-card-top"><span class="set-cover" data-organise-handle aria-hidden="true"><span></span><span></span></span>${itemActions('set',set)}</div><div class="set-card-meta">${esc(view==='recent'&&sub?[sub.name,parent?.name].filter(Boolean).join(' / '):parent?.name||sub?.name||'Fach')}</div><h2>${esc(set.name)}</h2><div class="set-card-bottom"><span>${count} ${count===1?'Karte':'Karten'}</span><span class="set-actions"><button type="button" class="quiet-button" data-quick-study="${esc(set.id)}" ${count?'':'disabled'}>${studyActionLabel(set.id)}</button><button type="button" class="quiet-button" data-quick-edit="${esc(set.id)}">Öffnen</button></span></div>${sortControls('set',set)}</article>`;
  }
  function bindSetCards(){
    document.querySelectorAll('[data-open-set]').forEach(element=>{
      const open=()=>{activeSet=element.dataset.openSet;const set=setById(activeSet);activeSubject=set?.subjectId||null;activeFolder=set?.folderId||null;view='library';if(element.classList.contains('library-search-result')&&activeSubject)expandedSidebarSubjects.add(activeSubject);render()};
      element.onclick=event=>{if((event.target.closest('button,details')&&event.target.closest('button,details')!==element)||librarySorting)return;open()};element.onkeydown=event=>{if(event.target===element&&!librarySorting&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open()}};
    });
    document.querySelectorAll('[data-quick-study]').forEach(button=>button.onclick=event=>{event.stopPropagation();beginStudy(button.dataset.quickStudy)});
    document.querySelectorAll('[data-quick-edit]').forEach(button=>button.onclick=event=>{event.stopPropagation();(()=>{activeSet=button.dataset.quickEdit;const item=setById(activeSet);activeSubject=item?.subjectId;activeFolder=item?.folderId;view='library';render()})()});
  }
  function folderCard(item){
    const count=subjectSets(item.subjectId).filter(set=>set.folderId===item.id).length,children=subjectFolders(item.subjectId).filter(child=>child.parentId===item.id).length;
    return `<article class="folder-card" ${sortAttributes('folder',item)} ${dropAttributes(item.subjectId,item.id)} tabindex="0" data-open-folder="${esc(item.id)}" style="--dot:${safeColor(item.color,defaultFolderColor)}"><span class="folder-icon" data-organise-handle aria-hidden="true">${folderSymbol()}</span><div class="folder-card-copy"><h3>${esc(item.name)}</h3><p>${count} Lernstapel${children?` · ${children} Unterordner`:''}</p></div>${itemActions('folder',item)}${sortControls('folder',item)}</article>`;
  }
  function bindFolderCards(){
    document.querySelectorAll('[data-open-folder]').forEach(element=>{
      const open=()=>{activeFolder=element.dataset.openFolder;activeSubject=folder(activeFolder)?.subjectId||null;activeSet=null;view='library';if(element.classList.contains('library-search-result')&&activeSubject)expandedSidebarSubjects.add(activeSubject);render()};
      element.onclick=event=>{if((event.target.closest('button,details')&&event.target.closest('button,details')!==element)||librarySorting)return;open()};element.onkeydown=event=>{if(event.target===element&&!librarySorting&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open()}};
    });
    document.querySelectorAll('[data-edit-folder]').forEach(button=>button.onclick=()=>editEntity('folder',button.dataset.editFolder));
    document.querySelectorAll('[data-delete-folder]').forEach(button=>button.onclick=()=>deleteFolder(button.dataset.deleteFolder));
  }
  function backButton(label,dropSubject,dropFolder){
    const destination=esc(label?`Zurück zu ${label}`:'Zurück');
    return `<button type="button" class="back-button" id="go-back" ${dropSubject?dropAttributes(dropSubject,dropFolder):''} aria-label="${destination}" title="${destination}"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13 6-6 6 6 6M7 12h12"/></svg></button>`;
  }
  function renderSubject(){
    const item=subject(activeSubject);if(!item){activeSubject=null;return renderLibrary()}
    crumbs(['Bibliothek',item.name]);
    const folders=subjectFolders(item.id).filter(child=>!child.parentId),looseSets=subjectSets(item.id).filter(set=>!set.folderId);
    const cardCount=subjectSets(item.id).reduce((sum,set)=>sum+(cardCounts.get(set.id)||0),0);
    const folderSection=folders.length?`<div class="folder-grid">${folders.map(folderCard).join('')}</div>`:'';
    const looseSection=looseSets.length?`<section class="library-section"><div class="section-head"><h2>Lernstapel <span class="count-label">${looseSets.length}</span></h2></div><div class="set-grid">${looseSets.map(setCard).join('')}</div></section>`:'';
    $('#content').innerHTML=`<div class="subpage-heading">${backButton('Bibliothek')}<div class="subject-heading" ${dropAttributes(item.id,null)}>${subjectSymbol(item)}<div><h1 class="page-title">${esc(item.name)}</h1><p class="page-subtitle">${subjectSets(item.id).length} Lernstapel · ${cardCount} ${cardCount===1?'Karte':'Karten'}</p></div></div>${managementActions('<button id="edit-subject">Fach bearbeiten</button><button class="danger-action" id="delete-subject">Fach löschen</button>')}</div><div class="section-actions library-folder-actions">${sortingButton()}<button class="quiet-button" id="add-folder">＋ Ordner anlegen</button><button class="primary-button" id="subject-new-set">＋ Lernstapel erstellen</button></div><section class="library-section"><div class="section-head"><h2>Ordner <span class="count-label">${folders.length}</span></h2></div>${folderSection||'<p class="section-note">Ordner sind optional. Lege sie an, wenn du deine Lernstapel weiter gliedern möchtest.</p>'}</section>${looseSection}`;
    $('#go-back').onclick=()=>{librarySorting=false;activeSubject=null;activeFolder=null;render()};$('#edit-subject').onclick=()=>editEntity('subject',item.id);$('#delete-subject').onclick=()=>deleteSubject(item.id);$('#add-folder').onclick=()=>openEntity('folder');$('#subject-new-set').onclick=()=>openEntity('set');
    bindFolderCards();bindSetCards();bindSubjectCards();
  }
  function renderFolder(){
    const item=folder(activeFolder);if(!item){activeFolder=null;return renderSubject()}
    const parent=subject(item.subjectId);if(!parent){activeFolder=null;return renderLibrary()}
    const sets=subjectSets(parent.id).filter(set=>set.folderId===item.id),children=subjectFolders(parent.id).filter(child=>child.parentId===item.id);crumbs(libraryCrumbs(item));
    const subfolders=children.length?`<section class="library-section"><div class="section-head"><h2>Unterordner <span class="count-label">${children.length}</span></h2></div><div class="folder-grid">${children.map(folderCard).join('')}</div></section>`:'';
    const stacks=sets.length?`<section class="library-section"><div class="section-head"><h2>Lernstapel <span class="count-label">${sets.length}</span></h2></div><div class="set-grid">${sets.map(setCard).join('')}</div></section>`:'';
    $('#content').innerHTML=`<div class="subpage-heading">${backButton(folder(item.parentId)?.name||parent.name,item.subjectId,item.parentId||null)}<div class="subject-heading library-folder-heading" ${dropAttributes(item.subjectId,item.id)} style="--dot:${safeColor(item.color,defaultFolderColor)}"><span class="subject-icon" aria-hidden="true">${folderSymbol()}</span><div><div class="page-context">Ordner</div><h1 class="page-title">${esc(item.name)}</h1><p class="page-subtitle">${children.length} Unterordner · ${sets.length} Lernstapel</p></div></div>${libraryDetailActions('folder',item,`<button id="edit-folder-current">Ordner bearbeiten</button><button data-move-item="folder" data-item-id="${esc(item.id)}">Ordner verschieben …</button><button class="danger-action" id="delete-folder-current">Ordner löschen</button>`)}</div><div class="section-actions library-folder-actions">${sortingButton()}<button class="quiet-button" id="add-subfolder">＋ Unterordner</button><button class="primary-button" id="folder-new-set">＋ Lernstapel erstellen</button></div>${subfolders}${stacks}${!children.length&&!sets.length?`<div ${dropAttributes(item.subjectId,item.id)}>${empty('Dieser Ordner ist leer','Lege einen Lernstapel oder einen Unterordner an.')}</div>`:''}`;
    $('#go-back').onclick=()=>{librarySorting=false;activeFolder=item.parentId||null;render()};$('#edit-folder-current').onclick=()=>editEntity('folder',item.id);$('#delete-folder-current').onclick=()=>deleteFolder(item.id);$('#folder-new-set').onclick=()=>openEntity('set');$('#add-subfolder').onclick=()=>openEntity('folder');bindFolderCards();bindSetCards();bindSubjectCards();
  }
  function renderSet(){
    const item=setById(activeSet);if(!item){activeSet=null;return render()}
    const parent=subject(item.subjectId),parentFolder=folder(item.folderId),cards=setCards(item.id);
    if(cardListSetId!==item.id){cardListSetId=item.id;cardListQuery='';cardListLimit=100}
    crumbs(libraryCrumbs(item,true));
    const previous=parentFolder?.name||parent?.name;
    const progress=window.WortwerkModel.getSetProgress(cards);
    const studyLabel=studyActionLabel(item.id);
    $('#content').innerHTML=`<div class="subpage-heading">${backButton(previous,item.subjectId,item.folderId||null)}<div><div class="page-context">${esc(parentFolder?.name||parent?.name||'Lernstapel')}</div><h1 class="page-title">${esc(item.name)}</h1><p class="page-subtitle">${cards.length} ${cards.length===1?'Lernkarte':'Lernkarten'}</p></div>${libraryDetailActions('set',item,`<button id="edit-set">Lernstapel bearbeiten</button><button data-move-item="set" data-item-id="${esc(item.id)}">Lernstapel verschieben …</button><button id="swap-card-sides" ${cards.length?'':'disabled'}>Vorder- und Rückseiten tauschen</button><button class="danger-action" id="delete-set">Lernstapel löschen</button>`)}</div>${cards.length?`<section class="study-banner" aria-labelledby="learning-progress-title"><div class="learning-progress-copy"><h2 id="learning-progress-title">Lernfortschritt</h2><p>${cards.length} ${cards.length===1?'Karte':'Karten'} · ${progress.secure} sicher · ${progress.practice} zu üben · ${progress.new} neu</p><div class="library-progress" role="progressbar" aria-label="Sicher beherrschte Karten" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percentage}"><span style="width:${progress.percentage}%"></span></div><small class="study-progress-caption">${progress.percentage}% sicher beherrscht · mindestens zwei richtige Antworten.</small></div><div class="study-banner-actions"><button class="primary-button" id="start-study">${studyLabel}</button><button class="quiet-button" id="reset-progress">Lernfortschritt zurücksetzen</button></div></section>`:''}<section class="library-section"><div class="section-head"><h2>Lernkarten <span class="count-label">${cards.length}</span></h2><div class="section-actions"><button class="quiet-button" id="import-this">Karten importieren</button><button class="${cards.length?'quiet-button':'primary-button'}" id="add-card">＋ Karte erstellen</button></div></div>${cards.length?renderCardList(cards):empty('Noch keine Lernkarten','Erstelle deine erste Karte oder importiere mehrere Begriffe aus Text.')}</section>`;
    $('#go-back').onclick=()=>{librarySorting=false;activeSet=null;activeFolder=item.folderId||null;render()};$('#edit-set').onclick=()=>editEntity('set',item.id);$('#delete-set').onclick=()=>deleteSet(item.id);$('#start-study')?.addEventListener('click',()=>beginStudy(item.id));$('#reset-progress')?.addEventListener('click',()=>openResetProgress(item.id));$('#swap-card-sides').onclick=()=>swapSetSides(item.id);$('#add-card').onclick=()=>openEntity('card');$('#import-this').onclick=()=>openImport(item.id);
    bindCardList();bindSubjectCards();
  }
  function renderCardList(cards){
    const page=cardListPage(cards,cardListQuery,cardListLimit),positions=new Map(cards.map((card,index)=>[card.id,index]));
    return `<div class="card-list-toolbar"><label class="card-search">${searchIcon}<span class="sr-only">Lernkarten durchsuchen</span><input type="search" id="card-search" placeholder="Begriffe oder Beispielsätze suchen" value="${esc(cardListQuery)}"></label><span class="card-list-count" role="status">${page.cards.length} von ${page.total} ${cardListQuery?(page.total===1?'Treffer':'Treffern'):(page.total===1?'Karte':'Karten')}</span></div><div id="card-list-results">${cardRows(page,positions,cards.length)}</div>`;
  }
  function cardRows(page,positions,total){
    return `${page.total?'<div class="card-list-columns" aria-hidden="true"><span>Vorderseite</span><span>Rückseite</span><span></span></div>':''}<div class="card-list">${page.cards.map(card=>{const index=positions.get(card.id),progress=window.WortwerkModel.getCardProgress(card),label=progress.state==='secure'?'Sicher':progress.state==='practice'?'Zu üben':'Neu';return `<div class="flash-row"><div class="term">${cardSideMarkup(card,'front')}<small class="flash-progress">${label} · ${progress.attempts} ${progress.attempts===1?'Versuch':'Versuche'}</small></div><div class="definition">${cardSideMarkup(card,'back')}</div><div class="row-actions"><button data-move-card="${esc(card.id)}" data-direction="-1" aria-label="Karte nach oben verschieben" title="Karte nach oben verschieben" ${index===0?'disabled':''}>↑</button><button data-move-card="${esc(card.id)}" data-direction="1" aria-label="Karte nach unten verschieben" title="Karte nach unten verschieben" ${index===total-1?'disabled':''}>↓</button><button data-edit-card="${esc(card.id)}" aria-label="Karte bearbeiten" title="Karte bearbeiten">✎</button><button data-delete-card="${esc(card.id)}" aria-label="Karte löschen" title="Karte löschen">×</button></div></div>`}).join('')}</div>${!page.total?'<p class="section-note">Keine passenden Karten. Versuche einen anderen Suchbegriff.</p>':''}${page.cards.length<page.total?'<button type="button" class="quiet-button card-list-more" id="card-list-more">Weitere 100 Karten anzeigen</button>':''}`;
  }
  function bindCardList(){
    const search=$('#card-search');if(search)search.oninput=()=>{cardListQuery=search.value;cardListLimit=100;refreshCardRows()};
    document.querySelectorAll('[data-move-card]').forEach(button=>button.onclick=()=>moveCard(button.dataset.moveCard,Number(button.dataset.direction)));
    document.querySelectorAll('[data-edit-card]').forEach(button=>button.onclick=()=>editCard(button.dataset.editCard));document.querySelectorAll('[data-delete-card]').forEach(button=>button.onclick=()=>deleteCard(button.dataset.deleteCard));
    $('#card-list-more')?.addEventListener('click',()=>{cardListLimit+=100;refreshCardRows()});
  }
  function refreshCardRows(){const cards=setCards(activeSet),page=cardListPage(cards,cardListQuery,cardListLimit);$('#card-list-results').innerHTML=cardRows(page,new Map(cards.map((card,index)=>[card.id,index])),cards.length);$('.card-list-count').textContent=`${page.cards.length} von ${page.total} ${cardListQuery?(page.total===1?'Treffer':'Treffern'):(page.total===1?'Karte':'Karten')}`;bindCardList()}
  function openEntity(type){formContext={type};fillForm(type);$('#form-dialog').showModal()}
  function editEntity(type,key){formContext={type,key};fillForm(type, type==='subject'?subject(key):type==='folder'?folder(key):setById(key));$('#form-dialog').showModal()}
  function verbSideFields(side,label,verb){
    const field=(name,caption,value,required=true)=>`<label class="verb-edit-field" for="f-${side}-${name}">
      <span>${caption}</span><input id="f-${side}-${name}" name="${side}-${name}" value="${esc(value)}" ${required?'required':''}>
    </label>`;
    return `<fieldset class="verb-edit">
      <legend>${label} · Französisches Verb</legend>
      <div class="verb-edit-grid">
        ${field('infinitive','Infinitiv',verb.infinitive)}
        ${field('stem','Imparfait-Stamm (optional)',verb.stem,false)}
        <label class="verb-edit-field" for="f-${side}-auxiliary"><span>Hilfsverb</span>
          <select id="f-${side}-auxiliary" name="${side}-auxiliary">
            <option value="">Leer lassen</option>
            ${['avoir','être','avoir / être'].map(value=>`<option${verb.auxiliary===value?' selected':''}>${value}</option>`).join('')}
          </select>
        </label>
        ${field('participle','Partizip Perfekt',verb.participle,false)}
      </div>
      <div class="field-hint">Schreibe die Präsensformen mit ihrem Pronomen. Wenn der Stamm fehlt, wird er nach Möglichkeit aus der nous-Form ergänzt.</div>
      <div class="verb-edit-grid verb-edit-forms">
        ${verb.forms.map(({pronoun,separator,form},index)=>field(`form-${index}`,frenchVerbFormLabels[index],pronoun+separator+form,false)).join('')}
      </div>
    </fieldset>`;
  }
  function cardSideFields(card,side,label,placeholder){
    const {term,exampleSentence,verb}=cardSideContent(card,side);
    const fields=verb?verbSideFields(side,label,verb):`<label class="field-label" for="f-${side}">${label}</label><textarea id="f-${side}" name="${side}" rows="3" maxlength="${side==='front'?2000:3000}" required placeholder="${placeholder}">${esc(term)}</textarea>`;
    return fields+`<label class="field-label" for="f-${side}-example">Beispielsatz auf der ${label} <span class="optional-label">(optional)</span></label><textarea id="f-${side}-example" name="${side}ExampleSentence" rows="2" maxlength="3000" placeholder="Ein Beispielsatz zur ${label}">${esc(exampleSentence)}</textarea>`;
  }
  function fillForm(type,entity){const dialog=$('#form-dialog');dialog.classList.toggle('has-set-design',type==='set');dialog.classList.toggle('has-subject-appearance',type==='subject');dialog.classList.toggle('has-folder-appearance',type==='folder');$('#form-save-error').hidden=true;$('#form-save-error').textContent='';const title=entity?`Bearbeite ${{subject:'Fach',folder:'Ordner',set:'Lernstapel',card:'Lernkarte'}[type]}`:({subject:'Fach anlegen',folder:'Ordner anlegen',set:'Lernstapel erstellen',card:'Lernkarte erstellen'})[type];$('#form-title').textContent=title;$('#form-eyebrow').textContent=entity?'BEARBEITEN':'NEU IN DEINER BIBLIOTHEK';$('#form-submit').textContent=entity?'Speichern':'Erstellen';let fields='';const input=(name,label,value='',placeholder='',required=true)=>`<label class="field-label" for="f-${name}">${label}</label><input id="f-${name}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="100" ${required?'required':''}>`;
    if(type==='subject'){
      const subjectIndex=entity?data.subjects.indexOf(entity):data.subjects.length;
      const selectedEmoji=entity?.emoji||entity?.icon||(entity?icons[subjectIndex%icons.length]:'📚');
      const color=safeColor(entity?.color,subjectColors[subjectIndex%subjectColors.length]);
      const subjectPreview=`<div class="subject-colour-preview"><div class="subject-preview-label">Kachelvorschau</div><div id="subject-card-preview" class="subject-card subject-card-preview" style="${subjectCardStyle(color)}" aria-hidden="true">${subjectCardContents({id:entity?.id,name:entity?.name||'Fachname',emoji:selectedEmoji})}</div><small class="subject-preview-label">Sehr kräftige eigene Farben erscheinen auf der Kachel dezenter.</small></div>`;
      fields=input('name','Fachname',entity?.name,'z. B. Französisch')+appearanceFields(type,color,subjectPreview)+`<span class="field-label" id="emoji-label">Symbol</span><input type="hidden" id="f-emoji" name="emoji" value="${esc(selectedEmoji)}"><label class="emoji-entry-wrap"><span class="emoji-current" id="emoji-current" aria-hidden="true">${esc(selectedEmoji)}</span><input id="emoji-entry" type="text" value="${esc(selectedEmoji)}" maxlength="20" aria-label="Eigenes Emoji eingeben" autocomplete="off"></label><label class="emoji-search-label"><span class="sr-only">Emoji suchen</span><input id="emoji-search" type="search" placeholder="Emoji suchen …" autocomplete="off"></label><div class="emoji-grid" role="group" aria-labelledby="emoji-label">${emojiChoices.map(([emoji,keywords,category])=>`<button type="button" class="emoji-option ${emoji===selectedEmoji?'selected':''}" data-emoji="${esc(emoji)}" data-search="${esc((keywords+' '+category).toLocaleLowerCase('de'))}" aria-label="${esc(keywords.split(' ')[0])}" aria-pressed="${emoji===selectedEmoji}">${emoji}</button>`).join('')}</div>`;
    }
    if(type==='folder'){
      const color=safeColor(entity?.color,defaultFolderColor);
      const preview=`<div id="folder-colour-preview" class="folder-colour-preview" style="--dot:${color}" aria-hidden="true"><span class="folder-icon">${folderSymbol()}</span><span><small>Vorschau</small><strong id="folder-preview-name">${esc(entity?.name||'Ordnername')}</strong></span></div>`;
      fields=input('name','Ordnername',entity?.name||'','z. B. Kapitel 1')+appearanceFields(type,color,preview)+`<div class="field-hint">Die Ordnerfarbe ist unabhängig vom Fach und den Designs deiner Lernstapel.</div>`;
    }
    if(type==='set'){
      const contextSubject=formContext?.defaultSubjectId||activeSubject||data.subjects[0]?.id||'';
      const subjectId=entity?.subjectId||contextSubject;
      const subjectChoice=!entity?`<label class="field-label" for="f-subject">Fach <span class="optional-label">(optional)</span></label><select id="f-subject" name="subjectId"><option value="">${data.subjects.length?'Standardfach':'Fach wird bei Bedarf angelegt'}</option>${data.subjects.map(item=>`<option value="${esc(item.id)}" ${item.id===contextSubject?'selected':''}>${esc(item.name)}</option>`).join('')}</select>`:'';
      const folderId=entity?entity.folderId||'':(formContext?.defaultFolderId&&folder(formContext.defaultFolderId)?.subjectId===subjectId?formContext.defaultFolderId:activeFolder&&folder(activeFolder)?.subjectId===subjectId?activeFolder:'');
      fields=subjectChoice+input('name',`Name des Lernstapels <span class="optional-label">(optional)</span>`,entity?.name,window.WortwerkModel.nextSetName(data.sets,subjectId||'__default__',folderId||null),Boolean(entity))+`<div class="field-hint">Ohne Namen vergeben wir automatisch den nächsten freien „Lernstapel“-Namen.</div><label class="field-label" for="f-folder">Ordner <span class="optional-label">(optional)</span></label><select id="f-folder" name="folderId"><option value="">${subjectFolders(subjectId).length?'Kein Ordner':'Ohne Ordner'}</option>${subjectFolders(subjectId).map(f=>`<option value="${esc(f.id)}" ${folderId===f.id?'selected':''}>${esc(folderLabel(f))}</option>`).join('')}</select><div class="field-hint">Der Lernstapel wird im ausgewählten Fach gespeichert. Ein Ordner ist optional.</div>`
    }
    if(type==='set')fields+=setDesignFields(entity?.cardThemeId||'');
    if(type==='card'){
      fields=cardSideFields(entity,'front','Vorderseite','Begriff, Frage oder Wort')+
        cardSideFields(entity,'back','Rückseite','Übersetzung, Antwort oder Erklärung')+
        '<div class="field-hint">Beispielsätze werden beim Lernen kleiner unter dem Begriff angezeigt.</div>';
    }
    $('#form-fields').innerHTML=fields;if(type==='subject'||type==='folder')bindColourPicker();if(type==='subject')bindSubjectAppearance();if(type==='set'){bindSetSubject();bindSetDesign()}$('#form-submit').onclick=e=>{e.preventDefault();submitEntity()};$('#entity-form').onsubmit=e=>{e.preventDefault();submitEntity()}}
  function bindSetSubject(){const selector=$('#f-subject');if(!selector)return;selector.addEventListener('change',()=>{$('#f-folder').innerHTML=`<option value="">Ohne Ordner</option>${subjectFolders(selector.value).map(item=>`<option value="${esc(item.id)}">${esc(folderLabel(item))}</option>`).join('')}`})}
  function bindSubjectAppearance(){
    const emojiInput=$('#f-emoji'),emojiEntry=$('#emoji-entry'),current=$('#emoji-current'),grid=$('.emoji-grid');
    const preview=$('#subject-card-preview'),name=$('#f-name');
    name.addEventListener('input',()=>{$('h2',preview).textContent=name.value.trim()||'Fachname'});
    const chooseEmoji=value=>{
      const emoji=value.trim()||'📚';
      emojiInput.value=emoji;current.textContent=emoji;
      $('.subject-icon',preview).outerHTML=subjectSymbol({emoji});
      grid.querySelectorAll('[data-emoji]').forEach(button=>{
        const selected=button.dataset.emoji===emoji;
        button.classList.toggle('selected',selected);
        button.setAttribute('aria-pressed',String(selected));
      });
    };
    emojiEntry.addEventListener('input',()=>chooseEmoji(emojiEntry.value));
    grid.querySelectorAll('[data-emoji]').forEach(button=>button.onclick=()=>{emojiEntry.value=button.dataset.emoji;chooseEmoji(button.dataset.emoji)});
    $('#emoji-search').addEventListener('input',e=>{
      const query=e.target.value.trim().toLocaleLowerCase('de');
      grid.querySelectorAll('[data-emoji]').forEach(button=>{button.hidden=!!query&&!button.dataset.search.includes(query)});
    });
  }
  async function submitEntity(){if(entitySaving||librarySortSaving)return;const type=formContext?.type;const form=$('#entity-form');if(!form.reportValidity())return;const awaitSave=['subject','folder'].includes(type)||(type==='set'&&!formContext.copyCards?.length),owner=data,snapshot=awaitSave?{subjects:structuredClone(data.subjects),folders:structuredClone(data.folders),sets:structuredClone(data.sets)}:null,previousLocation={activeSubject,activeFolder,activeSet};$('#form-save-error').hidden=true;const fd=new FormData(form);let successNotice=null;if(type==='subject'){const v={name:fd.get('name').trim(),color:fd.get('color'),emoji:fd.get('emoji')||'📚'};if(!v.name){toast('Der Fachname darf nicht leer sein.');return} if(formContext.key)Object.assign(subject(formContext.key),v,{updatedAt:new Date().toISOString()});else{const timestamp=new Date().toISOString();const s={id:id(),...v,icon:v.emoji,createdAt:timestamp,updatedAt:timestamp};s.position=window.WortwerkModel.nextLibraryPosition(data,'subject',s);data.subjects.push(s);activeSubject=s.id;activeFolder=null}}
    if(type==='folder'){const name=fd.get('name').trim();if(!name){toast('Der Ordnername darf nicht leer sein.');return}if(!activeSubject||!subject(activeSubject)){toast('Wähle zuerst ein Fach für den Ordner.');return}if(formContext.key)Object.assign(folder(formContext.key),{name,color:fd.get('color'),updatedAt:new Date().toISOString()});else{const timestamp=new Date().toISOString();const created={id:id(),name,color:fd.get('color'),subjectId:activeSubject,parentId:activeFolder||null,createdAt:timestamp,updatedAt:timestamp};created.position=window.WortwerkModel.nextLibraryPosition(data,'folder',created);data.folders.push(created)}}
    if(type==='set'){
      const existing=formContext.key?setById(formContext.key):null;
      let subjectId=existing?.subjectId||fd.get('subjectId')||formContext.defaultSubjectId||activeSubject||data.subjects[0]?.id||null;
      if(!subject(subjectId)){
        if(data.subjects.length)subjectId=data.subjects[0].id;
        else{
          const timestamp=new Date().toISOString(),defaultSubject={id:id(),name:'Allgemein',color:subjectColors[0],emoji:'📚',icon:'📚',createdAt:timestamp,updatedAt:timestamp};
          defaultSubject.position=window.WortwerkModel.nextLibraryPosition(data,'subject',defaultSubject);data.subjects.push(defaultSubject);subjectId=defaultSubject.id;
        }
      }
      const selectedFolder=fd.get('folderId')||null;
      const folderId=selectedFolder&&folder(selectedFolder)?.subjectId===subjectId?selectedFolder:null;
      const rawName=fd.get('name').trim();
      const name=rawName||(existing?.name||window.WortwerkModel.nextSetName(data.sets,subjectId,folderId));
      const duplicate=data.sets.some(set=>set.id!==existing?.id&&set.subjectId===subjectId&&(set.folderId||null)===(folderId||null)&&set.name.trim().toLocaleLowerCase('de')===name.trim().toLocaleLowerCase('de'));
      if(duplicate&&(existing?.name!==name||(existing?.folderId||null)!==folderId)){toast('An diesem Speicherort gibt es bereits einen Lernstapel mit diesem Namen.');return}
      const selectedTheme=fd.get('cardThemeId')||null;const v={name,folderId,cardThemeId:cardThemes.themes.some(theme=>theme.id===selectedTheme)?selectedTheme:null};
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
      const card=formContext.key?data.cards.find(c=>c.id===formContext.key):null;
      const v={},examples={frontExampleSentence:fd.get('frontExampleSentence').trim(),backExampleSentence:fd.get('backExampleSentence').trim()},timestamp=new Date().toISOString();
      for(const side of ['front','back']){
        if(fd.has(side)){v[side]=fd.get(side).trim();continue}
        const names=['infinitive','stem','auxiliary','participle',...frenchVerbFormLabels.map((_,index)=>`form-${index}`)];
        const {verb,reason}=validateFrenchVerbSide(names.map(name=>fd.get(`${side}-${name}`)).join(' | '));
        if(!verb){toast(reason);return}
        v[side]=formatFrenchVerbSide(verb);
      }
      if(!v.front||!v.back){toast('Vorder- und Rückseite dürfen nicht leer sein.');return}
      if(card){Object.assign(card,v,{updatedAt:timestamp});for(const [key,value] of Object.entries(examples)){if(value)card[key]=value;else delete card[key]}}
      else data.cards.push({id:id(),setId:activeSet,...v,...Object.fromEntries(Object.entries(examples).filter(([,value])=>value)),position:setCards(activeSet).length,correctCount:0,incorrectCount:0,attemptCount:0,lastReviewedAt:null,nextReviewAt:null,createdAt:timestamp,updatedAt:timestamp});
      const s=setById(activeSet);if(s)s.updatedAt=timestamp;
    }
    if(type==='set'&&formContext?.copyCards?.length&&session?.id===formContext.sourceSessionId){session.missedSetPending=false;const record=data.studySessions?.[session.setId];if(record)record.missedCardIdsCopied=[...(session.missedCardIdsCopied||[])];updateMissedSetActions()}
    refreshLibraryOrder();const keepStudyView=type==='set'&&Boolean(formContext?.copyCards?.length);
    if(awaitSave){
      entitySaving=true;form.inert=true;form.setAttribute('aria-busy','true');const submitLabel=$('#form-submit').textContent;$('#form-submit').textContent='Wird gespeichert …';
      try{await save();if(data!==owner)return;$('#form-dialog').close();render();toast(successNotice||'Änderungen gespeichert.');}
      catch(error){if(data!==owner)return;Object.assign(data,snapshot);if(error?.code!=='40001')window.WortwerkRepository.stagePendingRecovery?.(data);activeSubject=previousLocation.activeSubject;activeFolder=previousLocation.activeFolder;activeSet=previousLocation.activeSet;toast(error?.code==='40001'?'Die Ablage wurde zwischenzeitlich geändert. Schliess den Dialog und lade den aktuellen Stand über den Hinweis oben.':'Speichern fehlgeschlagen. Deine Eingaben bleiben geöffnet. Bitte erneut versuchen.');}
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
  let importPreviewFormat=null;
  const importRemovedLines=new Set();
  let importUpdateCheck=null;
  function checkImportAppVersion(){
    const notice=$('#import-app-update');
    if(!import.meta.env.PROD||!notice.hidden||importUpdateCheck)return;
    const selector='script[type="module"][src]';
    const currentEntry=$(selector)?.getAttribute('src');
    if(!currentEntry)return;
    importUpdateCheck=fetch('/',{cache:'no-store'})
      .then(async response=>{
        if(!response.ok)return;
        const latestDocument=new DOMParser().parseFromString(await response.text(),'text/html');
        const latestEntry=$(selector,latestDocument)?.getAttribute('src');
        if(!latestEntry||latestEntry===currentEntry)return;
        notice.hidden=false;
        $('#import-app-update-status').textContent='Eine neuere App-Version ist verfügbar.';
        updateImportReloadLabel();
      })
      .catch(()=>{})
      .finally(()=>{importUpdateCheck=null});
  }
  function updateImportReloadLabel(){
    $('#import-app-reload').textContent=$('#import-text').value.trim()?'Liste kopieren und neu laden':'Seite neu laden';
  }
  function updateImportFormat(){
    const input=$('#import-text');
    updateImportReloadLabel();
    const mode=$('#import-mode input:checked').value;
    const format=mode==='auto'?detectImportFormat(input.value):mode;
    const descriptions={vocabulary:'import-vocabulary-description','french-verbs':'import-verb-description'};
    const description=descriptions[format]||'import-auto-description';
    for(const id of ['import-auto-description',...Object.values(descriptions)])$('#'+id).hidden=id!==description;
    input.setAttribute('aria-describedby',description);
    input.placeholder=mode==='french-verbs'?frenchVerbExample:mode==='vocabulary'?'das Haus = la maison\nder Hund = le chien':'Liste einfügen oder eine Textdatei wählen';
    const status=$('#import-format-status');
    const message=mode!=='auto'||!format?'':format==='french-verbs'?'Französische Verben erkannt.':'Vokabelformat erkannt.';
    if(status.textContent!==message)status.textContent=message;
    return format;
  }
  function resetImportPreview(){
    importRows=[];importErrors=[];importChecked=false;importHasErrors=false;importPreviewFormat=null;
    importRemovedLines.clear();
    $('#import-preview').replaceChildren();
    updateImportActionState();
  }
  function updateImportActionState(){
    const button=$('#import-submit'),hint=$('#import-action-hint');
    const previewCount=$('#import-preview .preview-head span:last-child');
    if(previewCount)previewCount.textContent=`${importRows.length} ${importRows.length===1?'Karte':'Karten'} · ${importErrors.length} Fehler`;
    if(!importChecked){button.textContent='Import prüfen';button.disabled=!$('#import-text').value.trim();hint.textContent=button.disabled?'Füge Lernmaterial ein oder wähle eine Textdatei.':'Mit «Import prüfen» öffnest du die Vorschau.';return}
    if(importHasErrors){
      button.textContent='Eingaben korrigieren';button.disabled=true;
      if(importErrors.some(error=>error.correction))hint.textContent='Übernimm eine passende Korrektur in der Vorschau oder bearbeite die betroffene Zeile.';
      else hint.textContent=importPreviewFormat?'Einige Zeilen sind ungültig. Korrigiere den Text oben und prüfe ihn erneut.':'Format konnte nicht erkannt werden. Wähle oben ein Format oder korrigiere die Zeilen.';
      return;
    }
    if(!importRows.length){button.textContent='Keine Karten zum Erstellen';button.disabled=true;hint.textContent='Es sind keine gültigen Karten in der Vorschau.';return}
    if(importRows.some(row=>!row.front.trim()||!row.back.trim())){button.textContent='Leere Seiten beheben';button.disabled=true;hint.textContent='Ergänze Vorder- und Rückseite in der Vorschau.';return}
    button.textContent='Lernkarten erstellen';button.disabled=false;hint.textContent=`Vorschau geprüft · ${importRows.length} ${importRows.length===1?'Karte':'Karten'} bereit.`;
  }
  function openImport(targetSet){
    if(!data.sets.length){toast('Erstelle zuerst einen Lernstapel für den Import.');return}
    $('#import-text').value='';
    $('#import-file').value='';
    $('#import-file-name').textContent='TXT · UTF-8';
    $('#import-mode input[value="auto"]').checked=true;
    $('#import-set').innerHTML=data.sets.map(s=>`<option value="${esc(s.id)}" ${targetSet===s.id?'selected':''}>${esc(subject(s.subjectId)?.name||'Fach')} · ${esc(s.name)}</option>`).join('');
    updateImportFormat();
    resetImportPreview();
    $('#import-dialog').showModal();
    checkImportAppVersion();
  }
  function updateImportPreview({preserveRemovals=false,reveal=false}={}){
    const text=$('#import-text').value;
    importPreviewFormat=updateImportFormat();
    const result=importPreviewFormat==='french-verbs'?parseFrenchVerbImport(text):window.WortwerkParser.parseImport(text);
    if(!preserveRemovals)importRemovedLines.clear();
    importRows=result.rows.filter(row=>!importRemovedLines.has(row.line));importErrors=result.errors;importChecked=true;importHasErrors=result.errors.length>0;importPreviewLimit=100;
    renderImportPreview();
    if(reveal&&$('#import-preview').childElementCount){
      $('#import-preview').scrollTop=0;
      $('#import-preview').scrollIntoView({block:'nearest'});
    }
    if(importHasErrors)checkImportAppVersion();
  }
  function importVerbPreview(row,index){
    return `<div class="preview-line verb-preview">
      <span class="preview-index">${row.line}</span>
      <div class="preview-front"><span class="muted">Vorderseite</span> <strong>${esc(row.front)}</strong></div>
      <div class="preview-back"><span class="sr-only">Rückseite</span>${cardSideMarkup(row,'back')}</div>
      <button type="button" class="row-remove" data-import-remove="${index}" aria-label="Karte aus Vorschau entfernen">×</button>
    </div>`;
  }
  function renderImportPreview(){
    const preview=$('#import-preview'),verbs=importPreviewFormat==='french-verbs';
    const rows=importRows.slice(0,importPreviewLimit).map((row,index)=>verbs?importVerbPreview(row,index):`
      <div class="preview-line editable-preview">
        <span class="preview-index">${row.line}</span>
        <div class="preview-side preview-front">
          <input aria-label="Vorderseite Zeile ${row.line}" data-import-front="${index}" value="${esc(row.front)}">
          <input aria-label="Beispielsatz auf der Vorderseite Zeile ${row.line} (optional)" placeholder="Beispielsatz vorne" data-import-front-example="${index}" value="${esc(row.frontExampleSentence||'')}">
        </div>
        <div class="preview-side preview-back">
          <input aria-label="Rückseite Zeile ${row.line}" data-import-back="${index}" value="${esc(row.back)}">
          <input aria-label="Beispielsatz auf der Rückseite Zeile ${row.line} (optional)" placeholder="Beispielsatz hinten" data-import-back-example="${index}" value="${esc(row.backExampleSentence||'')}">
        </div>
        <button type="button" class="row-remove" data-import-remove="${index}" aria-label="Karte aus Vorschau entfernen">×</button>
      </div>`).join('');
    const errors=importErrors.slice(0,100).map((error,index)=>`<div class="preview-line bad">
      <span class="preview-index">Zeile ${error.line}</span>
      <div class="preview-error"><strong>${esc(error.reason)}</strong><br><code>${esc(error.text)}</code>
        ${error.correction?`<button type="button" class="quiet-button" data-import-correct="${index}" aria-label="Korrektur übernehmen für Zeile ${error.line}">Korrektur übernehmen</button>`:''}
      </div>
    </div>`).join('');
    preview.innerHTML=(importRows.length||importErrors.length)?`
      <div class="preview-head"><span>IMPORT-VORSCHAU</span><span>${importRows.length} Karten · ${importErrors.length} Fehler</span></div>
      ${errors}
      ${importErrors.length>100?'<p class="field-hint">Die ersten 100 Fehler werden angezeigt. Korrigiere die Eingaben oben und prüfe erneut.</p>':''}
      ${rows}
      ${importRows.length>importPreviewLimit?`<p class="field-hint">${importPreviewLimit} von ${importRows.length} Karten angezeigt. Alle gültigen Karten werden übernommen.</p><button type="button" class="quiet-button" id="import-preview-more">Weitere 100 anzeigen</button>`:''}`:'';
    $('#import-preview-more')?.addEventListener('click',()=>{importPreviewLimit+=100;renderImportPreview()});
    updateImportActionState();
  }
  $('#import-mode').addEventListener('change',()=>{updateImportFormat();resetImportPreview()});
  $('#import-text').addEventListener('input',()=>{updateImportFormat();resetImportPreview()});
  $('#import-app-reload').addEventListener('click',async()=>{
    const input=$('#import-text');
    try{
      if(input.value.trim())await navigator.clipboard.writeText(input.value);
      window.location.reload();
    }catch{
      input.focus();
      input.select();
      $('#import-app-update-status').textContent='Die Liste ist markiert. Kopiere sie, bevor du die Seite neu lädst.';
    }
  });
  $('#import-preview').addEventListener('input',event=>{
    const {importFront,importBack,importFrontExample,importBackExample}=event.target.dataset;
    const value=event.target.value;
    if(importFront!==undefined)importRows[Number(importFront)].front=value;
    if(importBack!==undefined)importRows[Number(importBack)].back=value;
    if(importFrontExample!==undefined)importRows[Number(importFrontExample)].frontExampleSentence=value;
    if(importBackExample!==undefined)importRows[Number(importBackExample)].backExampleSentence=value;
    updateImportActionState();
  });
  $('#import-preview').addEventListener('click',event=>{
    const {importCorrect,importRemove}=event.target.dataset;
    if(importCorrect!==undefined){
      const {line,text,correction}=importErrors[Number(importCorrect)]||{};
      if(!correction)return;
      const input=$('#import-text'),parts=input.value.split(/(\r\n?|\n|\u2028|\u2029)/u),index=(line-1)*2;
      if((index===0?parts[index]?.replace(/^\uFEFF/u,''):parts[index])!==text)return;
      parts[index]=correction;
      input.value=parts.join('');
      updateImportPreview({preserveRemovals:true});
      const submit=$('#import-submit');
      (submit.disabled?input:submit).focus();
    }else if(importRemove!==undefined){
      const [removed]=importRows.splice(Number(importRemove),1);
      if(removed)importRemovedLines.add(removed.line);
      renderImportPreview();
    }
  });
  $('#import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;$('#import-file-name').textContent=file.name;const draft=$('#import-text').value;try{const text=await file.text();if(!$('#import-dialog').open||$('#import-file').files?.[0]!==file||$('#import-text').value!==draft)return;$('#import-text').value=text;updateImportPreview({reveal:true})}catch(error){console.error('Textdatei konnte nicht gelesen werden.',error);toast('Die Textdatei konnte nicht gelesen werden.')} });
  function cancelEntityForm(){if(formContext?.copyCards?.length&&session?.id===formContext.sourceSessionId){session.missedSetPending=false;updateMissedSetActions()}formContext=null;$('#form-dialog').close()}
  document.querySelectorAll('#entity-form [value="cancel"]').forEach(button=>button.addEventListener('click',cancelEntityForm));
  $('#form-dialog').addEventListener('close',()=>{if(formContext?.copyCards?.length&&session?.id===formContext.sourceSessionId){session.missedSetPending=false;updateMissedSetActions()}formContext=null});
  $('#import-form').querySelectorAll('[value="cancel"]').forEach(button=>button.addEventListener('click',()=>$('#import-dialog').close()));
  $('#import-submit').addEventListener('click',e=>{e.preventDefault();if(!importChecked){updateImportPreview({reveal:true});return}const setId=$('#import-set').value;if(!setById(setId)||!importRows.length||importHasErrors||importRows.some(row=>!row.front.trim()||!row.back.trim()))return;const timestamp=new Date().toISOString(),position=setCards(setId).length,newCards=window.WortwerkModel.createImportedCards(importRows,{setId,position,timestamp,createId:id});data.cards=data.cards.concat(newCards);setById(setId).updatedAt=timestamp;save();$('#import-dialog').close();if(activeSet===setId)render();toast(`${newCards.length} Karten erstellt`)});
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
    const record={id:session.id,setId:session.setId,startedAt:session.startedAt,cardIds:session.cards.map(card=>card.id),results,resultsByCardId:{...session.resultsByCardId},historyCardIds:session.historyCardIds.slice(),historyIndex:session.historyIndex,currentCardId:session.currentCardId,shuffleRemainingCardIds:session.shuffleRemainingCardIds.slice(),index:Math.max(0,Math.min(index,session.cards.length-1)),missedCardIdsCopied:[...(session.missedCardIdsCopied||[])]};
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
  function updateStudyScoreCounts(){
    if(!session)return;
    const results=window.WortwerkModel.getStudyResults(session);
    const known=results.filter(result=>result===true).length;
    const missed=results.filter(result=>result===false).length;
    const reviewed=known+missed,total=session.cards.length;
    $('#known-count').textContent=String(known);
    $('#missed-count').textContent=String(missed);
    $('#study-progress-bar').style.width=`${total?Math.round(reviewed/total*100):0}%`;
    const track=$('#study-progress-track');
    track.setAttribute('aria-valuemax',String(total));
    track.setAttribute('aria-valuenow',String(reviewed));
    track.setAttribute('aria-valuetext',`${reviewed} von ${total} bewertet`);
    $('#answer-yes').setAttribute('aria-label',`Gewusst, bisher ${known}`);
    $('#answer-no').setAttribute('aria-label',`Nicht gewusst, bisher ${missed}`);
    $('#shuffle-toggle').disabled=Boolean(session.transitioning);
    updateMissedSetActions();
  }
  function getUncopiedMissedCards(){if(!session)return[];const copied=session.missedCardIdsCopied||new Set();return session.cards.filter(card=>window.WortwerkModel.getStudyResult(session,card.id)===false&&!copied.has(card.id))}
  function updateMissedSetActions(){if(!session)return;const results=window.WortwerkModel.getStudyResults(session),totalMissed=results.filter(result=>result===false).length,available=getUncopiedMissedCards().length,pending=Boolean(session.missedSetPending);const button=$('#create-missed-set');button.disabled=!available||pending||session.transitioning;button.textContent=available?`Lernstapel aus ${available} falschen Karten erstellen`:totalMissed?'Lernstapel erstellt':'Lernstapel aus falschen Karten erstellen';button.title=available?'Bisher falsch bewertete Karten in einen eigenen Lernstapel kopieren':totalMissed?'Alle bisher falschen Karten wurden bereits kopiert':'Bewerte zuerst eine Karte als Nicht gewusst';const resultButton=$('#create-missed-set-complete');resultButton.hidden=totalMissed===0;resultButton.disabled=!available||pending;resultButton.textContent=available?`Lernstapel aus ${available} falschen Karten erstellen`:totalMissed?'Lernstapel erstellt':'Lernstapel aus falschen Karten erstellen';resultButton.title=button.title}
  function openMissedSetCreation(){if(!session||session.missedSetPending)return;const cards=getUncopiedMissedCards();if(!cards.length){toast('Bewerte zuerst Karten als „Nicht gewusst“.');return}const originalSet=setById(session.setId);session.missedSetPending=true;formContext={type:'set',defaultSubjectId:originalSet?.subjectId||activeSubject||data.subjects[0]?.id||'',defaultFolderId:originalSet?.folderId||null,copyCards:cards.slice(),sourceSessionId:session.id};fillForm('set');$('#form-submit').textContent='Lernstapel erstellen';$('#form-dialog').showModal();$('#f-name').focus();updateMissedSetActions()}
  function resetSlotOrientation(slotObj){
    if(!slotObj)return;
    slotObj.button.setAttribute('aria-pressed','false');
    slotObj.inner.classList.add('no-transition');
    slotObj.inner.classList.remove('flipped');
    void slotObj.inner.offsetWidth;
    slotObj.inner.classList.remove('no-transition');
  }
  function renderStudyCard(){
    if(!session)return;
    const total=session.cards.length,index=window.WortwerkModel.getStudyCurrentIndex(session),card=window.WortwerkModel.getStudyCard(session);
    const nextCardId=window.WortwerkModel.getNextStudyCardId(session),hasNext=Boolean(nextCardId);
    $('#study-progress-label').textContent=`Karte ${index+1} von ${total}`;
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
      stack.button.setAttribute('aria-label','Nächste Karte. '+describeCardSide(nextCard,'front'));
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
    const canFinish=!hasNext&&window.WortwerkModel.getStudyResults(session).every(result=>result!==null);
    $('#study-next').disabled=!hasNext&&!canFinish;
    $('#study-next').setAttribute('aria-label',canFinish?'Lernrunde abschliessen':'Nächste Karte');
    $('#study-next').title=canFinish?'Lernrunde abschliessen':'Nächste Karte';
    $('#study-next .study-step-label').textContent=canFinish?'Abschliessen':'Weiter';
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
    const remaining=session.shuffleRemainingCardIds.length>0||window.WortwerkModel.getStudyResults(session).some(result=>result===null);
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
      active.feedbackText.textContent='Gewusst';
      active.slot.className='study-card-slot is-active is-correct';
    }else{
      active.feedbackText.textContent='Noch zu üben';
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
  function finishStudy(){
    if(!session)return;
    const results=window.WortwerkModel.getStudyResults(session);
    if(!session.completionRecorded)completeSession({id:session.id,setId:session.setId,startedAt:session.startedAt,cardIds:session.cards.map(card=>card.id),results});
    const {known,missed,unrated,percentage}=window.WortwerkModel.summarizeResults(results);
    const evaluated=known+missed,circumference=2*Math.PI*42;
    const knownLength=evaluated?circumference*known/evaluated:0;
    const missedLength=evaluated?circumference*missed/evaluated:0;
    $('#complete-copy').textContent=`${evaluated} von ${session.cards.length} ${session.cards.length===1?'Karte':'Karten'} bewertet`;
    $('#score-value').textContent=`${percentage}%`;
    $('#score-ring-known').style.strokeDasharray=`${knownLength} ${circumference-knownLength}`;
    $('#score-ring-missed').style.strokeDasharray=`${missedLength} ${circumference-missedLength}`;
    $('#score-ring-missed').style.strokeDashoffset=String(-knownLength);
    $('#result-chart').setAttribute('aria-label',`${percentage} Prozent richtig: ${known} gewusst und ${missed} noch zu üben`);
    $('#result-known').textContent=String(known);
    $('#result-missed').textContent=String(missed);
    $('#result-unrated').textContent=String(unrated);
    $('#retry-missed').hidden=missed===0;
    $('#study-complete').hidden=false;
    updateMissedSetActions();
    $('#complete-title').focus({preventScroll:true});
  }
  function retryMissed(){if(!session)return;const cards=session.cards.filter(card=>window.WortwerkModel.getStudyResult(session,card.id)===false);if(!cards.length)return;const retryState=window.WortwerkModel.createStudySession(cards);session={...retryState,id:id(),setId:session.setId,startedAt:new Date().toISOString(),flipped:false,missedCardIdsCopied:new Set(),missedSetPending:false};activeSlotIndex=0;saveSessionProgress();$('#study-title').textContent=`Wiederholung · ${setById(session.setId)?.name||'Lernsession'}`;$('#study-complete').hidden=true;$('#shuffle-toggle').setAttribute('aria-pressed','false');renderStudyCard()}
  const studyDialog=$('#study-dialog');
  const settingsDialog=$('#settings-dialog');
  function syncAppearanceOptions(){
    settingsDialog.querySelectorAll('input[name="app-appearance"]').forEach(input=>{input.checked=input.value===appAppearance.preference});
  }
  appAppearance.subscribe(syncAppearanceOptions);
  $('#appearance-options').addEventListener('change',event=>{
    const input=event.target.closest('input[name="app-appearance"]');
    if(!input?.checked)return;
    const result=appAppearance.setPreference(input.value);
    if(!result.persisted)toast('Die Darstellung wurde geändert, konnte aber in diesem Browser nicht gespeichert werden.');
  });
  $('#card-theme-open').onclick=()=>{closeNavigation();syncAppearanceOptions();renderCardThemeOptions();$('#donation-reminder-enabled').checked=isDonationReminderEnabled();settingsDialog.showModal()};
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
  function endStudy(){const setId=session?.setId;clearActiveStudyTransition();if(document.fullscreenElement===studyDialog)document.exitFullscreen().catch(()=>{});studyDialog.classList.remove('is-fullscreen');studyDialog.close();session=null;cardThemes.applyTheme(activeCardThemeId);syncFullscreenButton();if(setId){const label=studyActionLabel(setId);if(activeSet===setId){const button=$('#start-study');if(button)button.textContent=label}document.querySelectorAll('[data-quick-study]').forEach(button=>{if(button.dataset.quickStudy===setId)button.textContent=label});render()}}
  studyDialog.addEventListener('fullscreenchange',syncFullscreenButton);
  studyDialog.addEventListener('cancel',event=>{event.preventDefault();endStudy()});
  $('#study-expand').onclick=toggleStudyFullscreen;
  $('#study-card-0').onclick=flip;$('#study-card-1').onclick=flip;$('#answer-no').onclick=()=>scoreCard(false);$('#answer-yes').onclick=()=>scoreCard(true);$('#study-prev').onclick=()=>moveStudy(-1);$('#study-next').onclick=nextStudyCard;$('#study-close').onclick=endStudy;$('#finish-study').onclick=endStudy;$('#retry-missed').onclick=retryMissed;$('#create-missed-set').onclick=openMissedSetCreation;$('#create-missed-set-complete').onclick=openMissedSetCreation;$('#study-manage').onclick=endStudy;$('#shuffle-toggle').onclick=()=>{if(!session||session.transitioning||!$('#study-complete').hidden)return;const shuffled=window.WortwerkModel.shuffleStudyCards(session);if(!shuffled){toast('Zum Mischen brauchst du mindestens zwei Karten.');return}session.flipped=false;$('#shuffle-toggle').setAttribute('aria-pressed','true');saveSessionProgress();studyDialog.classList.add('is-instant-navigation');activeSlotIndex=1-activeSlotIndex;renderStudyCard();void studyDialog.offsetWidth;studyDialog.classList.remove('is-instant-navigation');toast('Alle Karten neu gemischt. Bewertungen bleiben erhalten.')};
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
  window.addEventListener('library-save-error',event=>{unsavedChanges=true;saveFailed=true;showSaveStatus(event.detail?.error?.code==='40001'?'Ablage wurde geändert':'Nicht synchronisiert',true)});
  saveRetry.onclick=()=>{if(recoveryAwaitingChoice){$('#recovery-notice [data-recover]')?.focus();return}if(entitySaving||librarySortSaving)return;if(window.WortwerkRepository.getPendingRecovery()?.preserveOrganisation){window.WortwerkReloadLibrary();return}save().catch(()=>{})};
  window.addEventListener('online',()=>{if(saveFailed&&!entitySaving&&!librarySortSaving&&!recoveryAwaitingChoice&&!window.WortwerkRepository.getPendingRecovery()?.preserveOrganisation)save().catch(()=>{})});
  window.addEventListener('beforeunload',event=>{if(unsavedChanges){event.preventDefault();event.returnValue=''}});
  let libraryLoadVersion=0;
  window.WortwerkResetWorkspace=()=>{libraryLoadVersion++;window.WortwerkRepository.resetLibraryOwner?.();if(session)endStudy();clearOrganisationPointer();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());data=initial();activeSubject=null;activeFolder=null;activeSet=null;view='library';expandedSidebarSubjects.clear();cardListSetId=null;librarySearchScope='';librarySearchQuery='';librarySearchLimit=100;formContext=null;librarySortSaving=false;entitySaving=false;$('#entity-form').inert=false;recoveryAwaitingChoice=false;$('#recovery-notice')?.remove();unsavedChanges=false;saveFailed=false;showSaveStatus('');closeNavigation();$('#content').innerHTML=''};

  function offerPendingRecovery(){
    $('#recovery-notice')?.remove();
    const recovery=window.WortwerkRepository.getPendingRecovery?.();if(!recovery)return;
    recoveryAwaitingChoice=true;$('#content').inert=true;unsavedChanges=true;saveFailed=true;showSaveStatus('Lokaler Stand nicht synchronisiert',true);
    const notice=document.createElement('aside');notice.id='recovery-notice';notice.className='recovery-notice';notice.setAttribute('aria-label','Nicht synchronisierte Änderungen');
    notice.innerHTML='<h2>Ein lokaler Lernstand wartet auf dich.</h2><p>Ein früherer Speichervorgang wurde nicht abgeschlossen. Beim Wiederherstellen werden lokale Änderungen übernommen; zusätzlich auf dem Server vorhandene Inhalte bleiben erhalten. Lokale Löschungen werden nicht nachgeholt.</p><button type="button" class="primary-button" data-recover>Lokalen Stand wiederherstellen</button><button type="button" class="quiet-button" data-keep-server>Serverstand behalten</button>';
    $('#content').before(notice);
    notice.querySelector('[data-recover]').onclick=async()=>{data=window.WortwerkModel.normalizeLibrary(window.WortwerkRepository.mergePendingLibrary(data,recovery.library,{preserveOrganisation:recovery.preserveOrganisation}));recoveryAwaitingChoice=false;notice.remove();render();try{await save();toast('Lokaler Lernstand wiederhergestellt.')}catch{toast('Der lokale Stand ist wieder geöffnet. Prüfe die Verbindung und speichere erneut.')}};
    notice.querySelector('[data-keep-server]').onclick=()=>{window.WortwerkRepository.discardPendingRecovery();recoveryAwaitingChoice=false;unsavedChanges=false;saveFailed=false;showSaveStatus('Serverstand geladen');notice.remove();render()};
  }
  window.WortwerkReloadLibrary=async()=>{
    const version=++libraryLoadVersion;
    clearOrganisationPointer();
    moveDialog.close();
    try{
      const loaded=await window.WortwerkRepository.loadLibrary(window.WortwerkModel.normalizeLibrary);
      if(version!==libraryLoadVersion)return false;
      data=loaded;
      render();
      offerPendingRecovery();
      return true;
    }catch(error){
      if(version!==libraryLoadVersion)return false;
      console.error('Lernbibliothek konnte nicht geladen werden.',error);
      $('#content').innerHTML='<section class="empty-state"><h2>Deine Bibliothek konnte nicht geladen werden.</h2><p>Bitte prüfe deine Verbindung und lade die Seite erneut.</p><button class="quiet-button" onclick="location.reload()">Erneut laden</button></section>';
      return false;
    }
  };
  window.WortwerkShareDestinations=()=>data.subjects.map(({id,name})=>({id,name}));
  window.WortwerkSaveSharedCopy=async (expectedUserId,saveCopy,isCurrent)=>{
    const version=libraryLoadVersion;
    try{
      const owner=await window.WortwerkRepository.flushLibraryWrites();
      if(owner!==expectedUserId||version!==libraryLoadVersion)throw new Error('Die aktive Sitzung hat sich geändert. Bitte versuche es erneut.');
    }catch(error){
      throw Object.assign(error,{code:'SHARE_LIBRARY_NOT_READY'});
    }
    if(!isCurrent())return null;
    const result=await saveCopy();
    if(result&&!result.missing&&version===libraryLoadVersion&&isCurrent())await window.WortwerkReloadLibrary();
    return result;
  };
  window.WortwerkOpenSharedCopy=async(kind,key)=>{
    const find=kind==='folder'?folder:setById;
    if(!find(key)&&!await window.WortwerkReloadLibrary())return false;
    const item=find(key);
    if(!item)return false;
    activeSubject=item.subjectId;
    activeFolder=kind==='folder'?item.id:item.folderId||null;
    activeSet=kind==='set'?item.id:null;
    expandedSidebarSubjects.add(activeSubject);
    librarySorting=false;
    view='library';
    render();
    return true;
  };
  window.WortwerkAppReady=window.WortwerkReloadLibrary();
})();
