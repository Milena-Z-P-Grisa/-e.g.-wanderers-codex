/* =======================================================================
   THE WANDERER'S CODEX — app.js
   A reusable, game-like travel journal. Vanilla JS, no build step.

   All trip content comes from a trip-data.json file (see README.md for
   the schema). This file only knows how to render *any* well-formed
   trip — it has no knowledge of San Marino, Japan, or any specific trip.

   Sections:
     1. Constants & storage helpers
     2. Utility functions
     3. Trip validation & normalization
     4. Progress (per-trip saved state)
     5. Settings
     6. Bootstrapping the current trip
     7. Achievement engine
     8. Budget helpers
     9. Toasts
    10. Application state & router
    11. Screen renderers
    12. Event delegation (click / change / submit)
    13. Import / export
    14. Init
   ======================================================================= */
(function () {
  'use strict';

  /* ---------- 1. CONSTANTS & STORAGE HELPERS ---------- */
  var LS_PREFIX = 'wanderersCodex:v1:';

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(LS_PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Wanderer\'s Codex: could not read', key, e);
      return fallback;
    }
  }
  function lsSet(key, value) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Wanderer\'s Codex: could not write', key, e);
      return false;
    }
  }

  /* ---------- 2. UTILITY FUNCTIONS ---------- */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function slugify(str) {
    var s = String(str || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    return s || uid('trip');
  }
  function toRoman(num) {
    var map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    var n = num, out = '';
    for (var i = 0; i < map.length; i++) {
      while (n >= map[i][0]) { out += map[i][1]; n -= map[i][0]; }
    }
    return out || String(num);
  }
  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso.length > 10 ? iso : iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function formatMoney(amount, currency) {
    var n = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n);
    } catch (e) {
      return (currency || '') + ' ' + n.toFixed(0);
    }
  }
  function todayISO() {
    var d = new Date();
    function pad(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function toggleInArray(arr, value) {
    var idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
  }
  function downloadJSON(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- 3. TRIP VALIDATION & NORMALIZATION ---------- */
  function validateTripShape(data) {
    var errors = [];
    if (!data || typeof data !== 'object') {
      errors.push('The file is not a JSON object.');
      return errors;
    }
    if (!data.meta || !data.meta.title) errors.push('Missing "meta.title".');
    if (!Array.isArray(data.cities) || data.cities.length === 0) errors.push('Missing or empty "cities" array.');
    if (!Array.isArray(data.days)) errors.push('Missing "days" array (use [] if there are none yet).');
    return errors;
  }

  function normalizeTripData(raw) {
    var data = JSON.parse(JSON.stringify(raw));
    data.meta = data.meta || {};
    data.meta.tripId = slugify(data.meta.tripId || data.meta.title);
    data.meta.subtitle = data.meta.subtitle || '';
    data.meta.travelStyle = Array.isArray(data.meta.travelStyle) ? data.meta.travelStyle : [];
    data.meta.currency = data.meta.currency || (data.budget && data.budget.currency) || 'EUR';
    data.meta.openingNarrative = data.meta.openingNarrative || '';
    data.meta.dates = data.meta.dates || {};

    data.cities = Array.isArray(data.cities) ? data.cities : [];
    data.cities.forEach(function (c) {
      c.id = c.id || slugify(c.name);
      c.highlights = Array.isArray(c.highlights) ? c.highlights : [];
      c.coords = c.coords && typeof c.coords.x === 'number' ? c.coords : { x: 50, y: 50 };
    });

    data.route = (Array.isArray(data.route) && data.route.length) ? data.route : data.cities.map(function (c) { return c.id; });

    data.days = Array.isArray(data.days) ? data.days : [];
    data.days.forEach(function (d, i) {
      d.day = d.day || (i + 1);
      d.activities = Array.isArray(d.activities) ? d.activities : [];
      d.questIds = Array.isArray(d.questIds) ? d.questIds : [];
    });

    data.quests = Array.isArray(data.quests) ? data.quests : [];
    data.quests.forEach(function (q) { q.id = q.id || uid('quest'); });

    data.packing = Array.isArray(data.packing) ? data.packing : [];
    data.packing.forEach(function (cat) {
      cat.id = cat.id || slugify(cat.category);
      cat.items = Array.isArray(cat.items) ? cat.items : [];
      cat.items.forEach(function (i) { i.id = i.id || uid('pack'); });
    });

    data.budget = data.budget || {};
    data.budget.currency = data.budget.currency || data.meta.currency;
    data.budget.categories = Array.isArray(data.budget.categories) ? data.budget.categories : [];
    data.budget.categories.forEach(function (c) { c.id = c.id || slugify(c.name); c.estimate = Number(c.estimate) || 0; });

    data.achievements = Array.isArray(data.achievements) ? data.achievements : [];
    data.achievements.forEach(function (a) { a.id = a.id || uid('ach'); a.criteria = a.criteria || {}; });

    data.seed = data.seed || {};
    data.seed.journalEntries = Array.isArray(data.seed.journalEntries) ? data.seed.journalEntries : [];
    data.seed.decisions = Array.isArray(data.seed.decisions) ? data.seed.decisions : [];

    return data;
  }

  /* ---------- 4. PROGRESS ---------- */
  function defaultProgress() {
    return {
      completedQuests: [],
      visitedCities: [],
      completedDays: [],
      packingChecked: [],
      customPacking: [],
      budgetActual: {},
      customBudgetCategories: [],
      journalEntries: [],
      decisions: [],
      achievementsUnlocked: {}
    };
  }

  function seedProgress(progress, trip) {
    (trip.seed.journalEntries || []).forEach(function (e) {
      progress.journalEntries.push(Object.assign({ seeded: true }, e, { id: e.id || uid('journal') }));
    });
    (trip.seed.decisions || []).forEach(function (d) {
      progress.decisions.push(Object.assign({ seeded: true }, d, { id: d.id || uid('decision') }));
    });
    return progress;
  }

  function loadProgressForTrip(trip) {
    var key = 'progress:' + trip.meta.tripId;
    var progress = lsGet(key, null);
    if (!progress) {
      progress = seedProgress(defaultProgress(), trip);
      lsSet(key, progress);
    }
    var defaults = defaultProgress();
    Object.keys(defaults).forEach(function (k) { if (!(k in progress)) progress[k] = defaults[k]; });
    return progress;
  }

  function saveProgress() {
    if (!state.trip) return;
    lsSet('progress:' + state.trip.meta.tripId, state.progress);
  }

  /* ---------- 5. SETTINGS ---------- */
  function defaultSettings() {
    return { adventurerName: '', theme: 'twilight', fontSize: 'medium', reduceMotion: false };
  }
  function loadSettings() {
    var s = lsGet('settings', null);
    return s ? Object.assign(defaultSettings(), s) : defaultSettings();
  }
  function saveSettings() {
    lsSet('settings', state.settings);
    applySettings();
  }
  function applySettings() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    document.documentElement.setAttribute('data-fontsize', state.settings.fontSize);
    document.documentElement.classList.toggle('reduce-motion', !!state.settings.reduceMotion);
  }

  /* ---------- 6. BOOTSTRAPPING THE CURRENT TRIP ---------- */
  function setCurrentTrip(trip) {
    state.trip = trip;
    lsSet('currentTrip', trip);
    state.progress = loadProgressForTrip(trip);
    state.selectedCityId = null;
    state.cityView = 'list';
    state.questFilter = { city: 'all', type: 'all', status: 'all' };
  }

  function fetchTripFile(path) {
    return fetch(path, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function bootstrapTrip() {
    var stored = lsGet('currentTrip', null);
    if (stored) {
      setCurrentTrip(stored);
      return Promise.resolve();
    }
    var candidates = ['./trip-data.json', './trip-data.example.json'];
    var chain = Promise.resolve();
    var found = false;
    candidates.forEach(function (path) {
      chain = chain.then(function () {
        if (found) return;
        return fetchTripFile(path).then(function (data) {
          if (found) return;
          var errors = validateTripShape(data);
          if (errors.length) return;
          setCurrentTrip(normalizeTripData(data));
          found = true;
        }).catch(function () { /* try next candidate */ });
      });
    });
    return chain;
  }

  /* ---------- 7. ACHIEVEMENT ENGINE ---------- */
  function computeAchievementState(ach) {
    var c = ach.criteria || {};
    var trip = state.trip, progress = state.progress;
    switch (c.type) {
      case 'quests_completed_all': {
        var total = trip.quests.length;
        var done = trip.quests.filter(function (q) { return progress.completedQuests.indexOf(q.id) >= 0; }).length;
        return { unlocked: total > 0 && done === total, progressText: done + ' / ' + total + ' quests' };
      }
      case 'quests_completed_in_city': {
        var inCity = trip.quests.filter(function (q) { return q.cityId === c.cityId; });
        var doneC = inCity.filter(function (q) { return progress.completedQuests.indexOf(q.id) >= 0; }).length;
        return { unlocked: inCity.length > 0 && doneC === inCity.length, progressText: doneC + ' / ' + inCity.length + ' quests' };
      }
      case 'cities_visited_all': {
        var totalCities = trip.cities.length;
        var doneCities = trip.cities.filter(function (ct) { return progress.visitedCities.indexOf(ct.id) >= 0; }).length;
        return { unlocked: totalCities > 0 && doneCities === totalCities, progressText: doneCities + ' / ' + totalCities + ' cities' };
      }
      case 'packing_complete_all': {
        var allItems = trip.packing.reduce(function (acc, cat) { return acc.concat(cat.items.map(function (i) { return i.id; })); }, []);
        allItems = allItems.concat(progress.customPacking.map(function (i) { return i.id; }));
        var donePack = allItems.filter(function (id) { return progress.packingChecked.indexOf(id) >= 0; }).length;
        return { unlocked: allItems.length > 0 && donePack === allItems.length, progressText: donePack + ' / ' + allItems.length + ' items' };
      }
      case 'budget_within_total': {
        var totals = getBudgetTotals();
        return {
          unlocked: totals.actual > 0 && totals.actual <= totals.estimate,
          progressText: formatMoney(totals.actual, trip.budget.currency) + ' / ' + formatMoney(totals.estimate, trip.budget.currency)
        };
      }
      case 'journal_entries_count': {
        var target1 = c.target || 1;
        return { unlocked: progress.journalEntries.length >= target1, progressText: progress.journalEntries.length + ' / ' + target1 + ' entries' };
      }
      case 'decisions_logged_count': {
        var target2 = c.target || 1;
        return { unlocked: progress.decisions.length >= target2, progressText: progress.decisions.length + ' / ' + target2 + ' decisions' };
      }
      default:
        return { unlocked: false, progressText: '' };
    }
  }

  function evaluateAchievements(silent) {
    if (!state.trip) return;
    var newly = [];
    state.trip.achievements.forEach(function (ach) {
      var result = computeAchievementState(ach);
      if (result.unlocked && !state.progress.achievementsUnlocked[ach.id]) {
        state.progress.achievementsUnlocked[ach.id] = new Date().toISOString();
        newly.push(ach);
      }
    });
    if (newly.length) {
      saveProgress();
      if (!silent) newly.forEach(function (a) { showToast(a.title, 'Achievement Unlocked', 'achievement'); });
    }
  }

  /* ---------- 8. BUDGET HELPERS ---------- */
  function getBudgetTotals() {
    var trip = state.trip, progress = state.progress;
    var categories = trip.budget.categories.concat(progress.customBudgetCategories);
    var estimate = 0, actual = 0;
    categories.forEach(function (cat) {
      estimate += Number(cat.estimate) || 0;
      actual += Number(progress.budgetActual[cat.id]) || 0;
    });
    return { estimate: estimate, actual: actual, categories: categories };
  }

  /* ---------- 9. TOASTS ---------- */
  function showToast(title, subtitle, kind) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast';
    var glyph = kind === 'achievement' ? '🏅' : '✦';
    el.innerHTML = '<span class="wax-seal sm"><span class="wax-seal-glyph">' + glyph + '</span></span>' +
      '<span class="toast-text"><strong>' + esc(subtitle || '') + '</strong>' + esc(title || '') + '</span>';
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add('leaving');
      setTimeout(function () { el.remove(); }, 400);
    }, 3200);
  }

  /* ---------- 10. APPLICATION STATE & ROUTER ---------- */
  var state = {
    trip: null,
    progress: null,
    settings: null,
    screen: 'opening',
    selectedCityId: null,
    cityView: 'list',
    questFilter: { city: 'all', type: 'all', status: 'all' },
    editingJournalId: null,
    editingDecisionId: null
  };

  var MENU_ITEMS = [
    { id: 'overview', numeral: 'I', glyph: '📜', title: 'Trip Overview', desc: 'The chronicle at a glance' },
    { id: 'map', numeral: 'II', glyph: '🗺️', title: 'World Map', desc: 'Chart the route' },
    { id: 'itinerary', numeral: 'III', glyph: '🕰️', title: 'Day-by-Day Itinerary', desc: 'The days, in order' },
    { id: 'cities', numeral: 'IV', glyph: '🏰', title: 'City Chapters', desc: 'Lore of each stop' },
    { id: 'quests', numeral: 'V', glyph: '⚔️', title: 'Quests', desc: 'Things to see and do' },
    { id: 'inventory', numeral: 'VI', glyph: '🎒', title: 'Inventory', desc: 'The packing checklist' },
    { id: 'budget', numeral: 'VII', glyph: '💰', title: 'Budget', desc: 'Coin and coffer' },
    { id: 'journal', numeral: 'VIII', glyph: '📖', title: 'Journal', desc: 'Your own words' },
    { id: 'achievements', numeral: 'IX', glyph: '🏅', title: 'Achievements', desc: 'Seals you have earned' },
    { id: 'decisions', numeral: 'X', glyph: '⚖️', title: 'Decision Log', desc: 'Choices made along the way' },
    { id: 'settings', numeral: 'XI', glyph: '⚙️', title: 'Settings', desc: 'Tune the Codex' },
    { id: 'import-export', numeral: 'XII', glyph: '📥', title: 'Load & Save', desc: 'Import or export data' }
  ];

  function navigateTo(screen, opts) {
    opts = opts || {};
    state.screen = screen;
    if (opts.cityId !== undefined) state.selectedCityId = opts.cityId;
    if (opts.cityView) state.cityView = opts.cityView;
    render();
    var contentEl = document.getElementById('app-content');
    if (contentEl) contentEl.scrollTop = 0;
  }

  function render() {
    var header = document.getElementById('app-header');
    var contentEl = document.getElementById('app-content');
    var tray = document.getElementById('app-tray');

    if (!state.trip && state.screen !== 'opening') state.screen = 'opening';

    if (state.screen === 'opening') {
      header.hidden = true;
      tray.hidden = true;
      contentEl.innerHTML = renderOpening();
      return;
    }

    header.hidden = false;
    var menuMeta = MENU_ITEMS.filter(function (m) { return m.id === state.screen; })[0];
    document.getElementById('header-eyebrow').textContent = state.trip ? state.trip.meta.title : '';
    document.getElementById('header-title').textContent = menuMeta ? menuMeta.title : (state.screen === 'menu' ? 'Table of Contents' : "The Wanderer's Codex");
    document.getElementById('btn-back-menu').style.visibility = state.screen === 'menu' ? 'hidden' : 'visible';

    var html = '';
    switch (state.screen) {
      case 'menu': html = renderMenu(); break;
      case 'overview': html = renderOverview(); break;
      case 'map': html = renderMap(); break;
      case 'itinerary': html = renderItinerary(); break;
      case 'cities': html = (state.cityView === 'detail') ? renderCityDetail() : renderCitiesList(); break;
      case 'quests': html = renderQuests(); break;
      case 'inventory': html = renderInventory(); break;
      case 'budget': html = renderBudget(); break;
      case 'journal': html = renderJournal(); break;
      case 'achievements': html = renderAchievements(); break;
      case 'decisions': html = renderDecisions(); break;
      case 'settings': html = renderSettings(); break;
      case 'import-export': html = renderImportExport(); break;
      default: html = renderMenu();
    }
    contentEl.innerHTML = html;
    tray.hidden = false;
    tray.innerHTML = renderTray();
  }

  /* ---------- 11. SCREEN RENDERERS ---------- */

  function renderOpening() {
    if (!state.trip) {
      return (
        '<div class="opening">' +
          '<div class="wax-seal"><span class="wax-seal-glyph">&#9993;</span></div>' +
          '<h1 class="opening-title">The Wanderer\'s Codex</h1>' +
          '<p class="opening-subtitle">No chronicle is bound to these pages yet.</p>' +
          '<div class="codex-page no-trip-panel">' +
            '<span class="eyebrow">Begin a Codex</span>' +
            '<p>Place a <code>trip-data.json</code> file next to <code>index.html</code> and reload the page — or load one right now:</p>' +
            renderImportPanel('opening') +
          '</div>' +
        '</div>'
      );
    }
    var t = state.trip;
    var styleTags = (t.meta.travelStyle || []).slice(0, 3).join(' · ') || 'A Journey';
    var dateRange = (t.meta.dates.start ? formatDate(t.meta.dates.start) : '') + (t.meta.dates.end ? ' — ' + formatDate(t.meta.dates.end) : '');
    return (
      '<div class="opening">' +
        '<div class="wax-seal"><span class="wax-seal-glyph">&#10022;</span></div>' +
        '<span class="eyebrow">' + esc(styleTags) + '</span>' +
        '<h1 class="opening-title">' + esc(t.meta.title) + '</h1>' +
        (t.meta.subtitle ? '<p class="opening-subtitle">' + esc(t.meta.subtitle) + '</p>' : '') +
        (t.meta.openingNarrative ? '<p class="opening-narrative">' + esc(t.meta.openingNarrative) + '</p>' : '') +
        (dateRange ? '<p class="opening-meta">' + esc(dateRange) + '</p>' : '') +
        '<div class="field opening-name-field">' +
          '<label for="adventurer-name">Your name, wanderer</label>' +
          '<input type="text" id="adventurer-name" data-action="set-name" value="' + esc(state.settings.adventurerName) + '" placeholder="Leave blank to remain anonymous">' +
        '</div>' +
        '<div class="opening-actions">' +
          '<button type="button" class="btn btn-primary btn-block" data-action="go-menu">Begin the Journey</button>' +
          '<button type="button" class="btn btn-ghost btn-block" data-action="go-import-export">Load a Different Codex</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderMenu() {
    var name = state.settings.adventurerName ? esc(state.settings.adventurerName) : '';
    return (
      '<div class="codex-page">' +
        (name ? '<p class="lede">Welcome back, ' + name + '.</p>' : '') +
        '<span class="eyebrow">Table of Contents</span>' +
        '<h2>' + esc(state.trip.meta.title) + '</h2>' +
        '<div class="menu-list">' +
          MENU_ITEMS.map(function (item) {
            return (
              '<button type="button" class="menu-item" data-action="go-' + item.id + '">' +
                '<span class="menu-item-numeral">' + item.numeral + '</span>' +
                '<span class="menu-item-glyph">' + item.glyph + '</span>' +
                '<span class="menu-item-text">' +
                  '<span class="menu-item-title">' + esc(item.title) + '</span>' +
                  '<span class="menu-item-desc">' + esc(item.desc) + '</span>' +
                '</span>' +
                '<span class="menu-item-arrow">&rsaquo;</span>' +
              '</button>'
            );
          }).join('') +
        '</div>' +
      '</div>'
    );
  }

  function renderTray() {
    var items = [
      { id: 'menu', glyph: '&#9776;', label: 'Menu' },
      { id: 'map', glyph: '&#128506;', label: 'Map' },
      { id: 'quests', glyph: '&#9876;', label: 'Quests' },
      { id: 'inventory', glyph: '&#127890;', label: 'Pack' },
      { id: 'journal', glyph: '&#128214;', label: 'Journal' }
    ];
    return items.map(function (i) {
      var activeStyle = state.screen === i.id ? 'border-color:var(--gold);color:var(--gold-glow);' : '';
      return (
        '<button type="button" class="rune-btn" data-action="go-' + i.id + '" aria-label="' + i.label + '" title="' + i.label + '" style="' + activeStyle + '">' +
          '<span class="rune-btn-glyph">' + i.glyph + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function renderOverview() {
    var t = state.trip;
    var totalQuests = t.quests.length;
    var doneQuests = t.quests.filter(function (q) { return state.progress.completedQuests.indexOf(q.id) >= 0; }).length;
    var totals = getBudgetTotals();
    var packedAll = t.packing.reduce(function (acc, c) { return acc.concat(c.items.map(function (i) { return i.id; })); }, []);
    packedAll = packedAll.concat(state.progress.customPacking.map(function (i) { return i.id; }));
    var packedDone = packedAll.filter(function (id) { return state.progress.packingChecked.indexOf(id) >= 0; }).length;
    var daysCount = t.days.length;
    var daysDone = state.progress.completedDays.length;
    var dateRange = (t.meta.dates.start ? formatDate(t.meta.dates.start) : '') + (t.meta.dates.end ? ' — ' + formatDate(t.meta.dates.end) : '');

    return (
      '<div class="codex-page">' +
        '<div class="wax-seal overview-crest"><span class="wax-seal-glyph">&#10022;</span></div>' +
        '<span class="eyebrow center" style="display:block;text-align:center">Chapter I</span>' +
        '<h2 class="center">' + esc(t.meta.title) + '</h2>' +
        (t.meta.subtitle ? '<p class="lede center">' + esc(t.meta.subtitle) + '</p>' : '') +
        (dateRange ? '<p class="center muted">' + esc(dateRange) + '</p>' : '') +
        '<div class="tag-row" style="justify-content:center">' + (t.meta.travelStyle || []).map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('') + '</div>' +
        '<div class="divider"></div>' +
        '<div class="stat-grid">' +
          '<div class="stat-chip"><span class="num">' + t.cities.length + '</span><span class="label">Cities</span></div>' +
          '<div class="stat-chip"><span class="num">' + daysDone + '/' + daysCount + '</span><span class="label">Days Traveled</span></div>' +
          '<div class="stat-chip"><span class="num">' + doneQuests + '/' + totalQuests + '</span><span class="label">Quests</span></div>' +
          '<div class="stat-chip"><span class="num">' + (packedAll.length ? Math.round(packedDone / packedAll.length * 100) : 0) + '%</span><span class="label">Packed</span></div>' +
        '</div>' +
        '<p class="field-hint center">Budget so far: ' + formatMoney(totals.actual, t.budget.currency) + ' of ' + formatMoney(totals.estimate, t.budget.currency) + ' estimated</p>' +
        (t.meta.openingNarrative ? '<div class="divider"></div><p class="lede">' + esc(t.meta.openingNarrative) + '</p>' : '') +
      '</div>'
    );
  }

  function renderMap() {
    var t = state.trip;
    var routeCities = t.route.map(function (id) { return t.cities.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
    var points = routeCities.map(function (c) { return c.coords.x + ',' + c.coords.y; }).join(' ');
    var markers = t.cities.map(function (c) {
      var visited = state.progress.visitedCities.indexOf(c.id) >= 0;
      return (
        '<button type="button" class="map-marker ' + (visited ? 'visited' : '') + '" style="left:' + c.coords.x + '%;top:' + c.coords.y + '%" data-action="open-city" data-id="' + esc(c.id) + '">' +
          '<span class="wax-seal sm ' + (visited ? '' : 'locked') + '"><span class="wax-seal-glyph">' + (visited ? '&#9733;' : '&#9679;') + '</span></span>' +
          '<span class="map-marker-label">' + esc(c.name) + '</span>' +
        '</button>'
      );
    }).join('');
    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter II</span>' +
        '<h2>World Map</h2>' +
        '<p class="lede">The route across the realm, from stop to stop.</p>' +
        '<div class="map-wrap">' +
          '<svg class="map-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
            '<polyline class="map-route-line" points="' + points + '"></polyline>' +
          '</svg>' +
          markers +
        '</div>' +
        '<div class="tag-row map-legend">' + (t.meta.travelStyle || []).map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('') + '</div>' +
      '</div>'
    );
  }

  function renderItinerary() {
    var t = state.trip;
    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter III</span>' +
        '<h2>Day-by-Day Itinerary</h2>' +
        '<p class="lede">' + t.days.length + ' days across ' + t.cities.length + ' cities.</p>' +
      '</div>' +
      t.days.map(renderDayCard).join('')
    );
  }

  function cityNameById(id) {
    var c = state.trip.cities.filter(function (c2) { return c2.id === id; })[0];
    return c ? c.name : '';
  }

  function renderDayCard(d) {
    var city = cityNameById(d.cityId);
    var done = state.progress.completedDays.indexOf(d.day) >= 0;
    var quests = state.trip.quests.filter(function (q) { return (d.questIds || []).indexOf(q.id) >= 0; });
    return (
      '<div class="codex-page day-card">' +
        '<span class="day-num">Day ' + d.day + (d.date ? ' · ' + formatDate(d.date) : '') + (city ? ' · ' + esc(city) : '') + '</span>' +
        '<h3>' + esc(d.title || '') + '</h3>' +
        (d.summary ? '<p class="lede">' + esc(d.summary) + '</p>' : '') +
        (d.activities || []).map(function (a) {
          return '<div class="activity-row"><span class="activity-time">' + esc(a.time || '') + '</span><span>' + esc(a.description || '') + '</span></div>';
        }).join('') +
        (quests.length ? '<div class="tag-row">' + quests.map(function (q) { return '<span class="tag">' + esc(q.title) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="checkbox-row day-toggle ' + (done ? 'checked' : '') + '">' +
          '<input type="checkbox" id="day-' + d.day + '" data-action="toggle-day" data-id="' + d.day + '" ' + (done ? 'checked' : '') + '>' +
          '<label for="day-' + d.day + '">Mark this day as traveled</label>' +
        '</div>' +
      '</div>'
    );
  }

  function renderCitiesList() {
    var t = state.trip;
    var cities = t.route.map(function (id) { return t.cities.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter IV</span>' +
        '<h2>City Chapters</h2>' +
        '<p class="lede">Each city, its lore, and the quests that live there.</p>' +
        '<div class="menu-list">' +
          cities.map(function (c, i) {
            var visited = state.progress.visitedCities.indexOf(c.id) >= 0;
            return (
              '<button type="button" class="menu-item chapter-item" data-action="open-city" data-id="' + esc(c.id) + '">' +
                '<span class="chapter-roman">' + toRoman(i + 1) + '</span>' +
                '<span class="menu-item-text">' +
                  '<span class="menu-item-title">' + esc(c.name) + '</span>' +
                  '<span class="menu-item-desc">' + esc(c.region || '') + '</span>' +
                '</span>' +
                (visited ? '<span class="chapter-visited-badge">Visited</span>' : '') +
                '<span class="menu-item-arrow">&rsaquo;</span>' +
              '</button>'
            );
          }).join('') +
        '</div>' +
      '</div>'
    );
  }

  function renderCityDetail() {
    var t = state.trip;
    var c = t.cities.filter(function (c2) { return c2.id === state.selectedCityId; })[0];
    if (!c) { state.cityView = 'list'; return renderCitiesList(); }
    var quests = t.quests.filter(function (q) { return q.cityId === c.id; });
    var visited = state.progress.visitedCities.indexOf(c.id) >= 0;
    return (
      '<div class="codex-page">' +
        '<button type="button" class="btn btn-ghost btn-sm city-detail-back" data-action="back-to-cities">&lsaquo; All Chapters</button>' +
        '<span class="eyebrow">' + esc(c.region || '') + '</span>' +
        '<h2>' + esc(c.name) + '</h2>' +
        '<p>' + esc(c.description || '') + '</p>' +
        (c.highlights && c.highlights.length ? '<h3>Highlights</h3><ul>' + c.highlights.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>' : '') +
        (c.transportToNext ? '<p class="muted"><strong>Onward:</strong> ' + esc(c.transportToNext) + '</p>' : '') +
        '<button type="button" class="btn ' + (visited ? 'btn-ghost' : 'btn-primary') + ' btn-block" data-action="toggle-visited" data-id="' + esc(c.id) + '">' +
          (visited ? '&#10003; Marked as Visited' : 'Mark as Visited') +
        '</button>' +
      '</div>' +
      (quests.length ? '<div class="codex-page"><h3>Quests Here</h3>' + quests.map(renderQuestCard).join('') + '</div>' : '')
    );
  }

  function renderQuestCard(q) {
    var done = state.progress.completedQuests.indexOf(q.id) >= 0;
    var city = state.trip.cities.filter(function (c) { return c.id === q.cityId; })[0];
    var cityName = city ? city.name : '';
    return (
      '<div class="card quest-card ' + (done ? 'completed' : '') + '">' +
        '<span class="quest-check"><input type="checkbox" data-action="toggle-quest" data-id="' + esc(q.id) + '" ' + (done ? 'checked' : '') + ' id="qc-' + esc(q.id) + '"></span>' +
        '<div>' +
          '<label for="qc-' + esc(q.id) + '"><strong>' + esc(q.title) + '</strong></label>' +
          '<div class="quest-type">' + esc(q.type || 'quest') + (cityName ? ' · ' + esc(cityName) : '') + '</div>' +
          '<p>' + esc(q.description || '') + '</p>' +
          (q.reward ? '<div class="quest-reward">Reward: ' + esc(q.reward) + '</div>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function renderQuests() {
    var t = state.trip;
    var f = state.questFilter;
    var quests = t.quests.slice();
    if (f.city !== 'all') quests = quests.filter(function (q) { return q.cityId === f.city; });
    if (f.type !== 'all') quests = quests.filter(function (q) { return (q.type || 'quest') === f.type; });
    if (f.status !== 'all') {
      quests = quests.filter(function (q) {
        var done = state.progress.completedQuests.indexOf(q.id) >= 0;
        return f.status === 'done' ? done : !done;
      });
    }
    var cityOptions = t.cities.map(function (c) { return '<option value="' + esc(c.id) + '" ' + (f.city === c.id ? 'selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    var total = t.quests.length;
    var done = t.quests.filter(function (q) { return state.progress.completedQuests.indexOf(q.id) >= 0; }).length;
    var pct = total ? Math.round(done / total * 100) : 0;

    function chip(group, value, label) {
      var active = f[group] === value;
      return '<button type="button" class="filter-chip ' + (active ? 'active' : '') + '" data-action="filter-quest-' + group + '" data-value="' + value + '">' + label + '</button>';
    }

    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter V</span>' +
        '<h2>Quests</h2>' +
        '<div class="progress-label"><span>' + done + ' of ' + total + ' complete</span><span>' + pct + '%</span></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="divider"></div>' +
        '<div class="filter-row">' +
          '<select data-action="filter-quest-city" aria-label="Filter by city">' +
            '<option value="all" ' + (f.city === 'all' ? 'selected' : '') + '>All Cities</option>' +
            cityOptions +
          '</select>' +
          chip('type', 'all', 'All Types') + chip('type', 'main', 'Main') + chip('type', 'side', 'Side') +
          chip('status', 'all', 'All') + chip('status', 'active', 'Active') + chip('status', 'done', 'Done') +
        '</div>' +
      '</div>' +
      '<div class="codex-page">' +
        (quests.length ? quests.map(renderQuestCard).join('') : '<p class="muted">No quests match these filters.</p>') +
      '</div>'
    );
  }

  function renderInventory() {
    var t = state.trip;
    var customByCategory = {};
    state.progress.customPacking.forEach(function (ci) {
      customByCategory[ci.categoryId] = customByCategory[ci.categoryId] || [];
      customByCategory[ci.categoryId].push(ci);
    });
    var knownCatIds = t.packing.map(function (c) { return c.id; });
    var orphanCustom = state.progress.customPacking.filter(function (ci) { return knownCatIds.indexOf(ci.categoryId) === -1; });

    var allItemIds = t.packing.reduce(function (acc, c) { return acc.concat(c.items.map(function (i) { return i.id; })); }, []);
    allItemIds = allItemIds.concat(state.progress.customPacking.map(function (i) { return i.id; }));
    var doneCount = allItemIds.filter(function (id) { return state.progress.packingChecked.indexOf(id) >= 0; }).length;
    var pct = allItemIds.length ? Math.round(doneCount / allItemIds.length * 100) : 0;

    function itemRow(item) {
      var checked = state.progress.packingChecked.indexOf(item.id) >= 0;
      return (
        '<div class="checkbox-row ' + (checked ? 'checked' : '') + '">' +
          '<input type="checkbox" id="pk-' + esc(item.id) + '" data-action="toggle-pack" data-id="' + esc(item.id) + '" ' + (checked ? 'checked' : '') + '>' +
          '<label for="pk-' + esc(item.id) + '">' + esc(item.name) + '</label>' +
        '</div>'
      );
    }

    var categoriesHtml = t.packing.map(function (cat) {
      var items = cat.items.concat(customByCategory[cat.id] || []);
      return (
        '<div class="codex-page">' +
          '<div class="pack-category-title"><h3>' + esc(cat.category) + '</h3></div>' +
          items.map(itemRow).join('') +
          '<div class="add-item-row">' +
            '<input type="text" placeholder="Add an item…" data-role="new-pack-item" data-cat="' + esc(cat.id) + '">' +
            '<button type="button" class="btn btn-sm" data-action="add-pack-item" data-cat="' + esc(cat.id) + '">Add</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var miscHtml = (
      '<div class="codex-page">' +
        '<div class="pack-category-title"><h3>Miscellaneous</h3></div>' +
        orphanCustom.map(itemRow).join('') +
        '<div class="add-item-row">' +
          '<input type="text" placeholder="Add a miscellaneous item…" data-role="new-pack-item" data-cat="misc-custom">' +
          '<button type="button" class="btn btn-sm" data-action="add-pack-item" data-cat="misc-custom">Add</button>' +
        '</div>' +
      '</div>'
    );

    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter VI</span>' +
        '<h2>Inventory</h2>' +
        '<div class="progress-label"><span>' + doneCount + ' of ' + allItemIds.length + ' packed</span><span>' + pct + '%</span></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '</div>' +
      categoriesHtml + miscHtml
    );
  }

  function renderBudget() {
    var t = state.trip;
    var currency = t.budget.currency || t.meta.currency;
    var totals = getBudgetTotals();
    var rows = totals.categories.map(function (cat) {
      var actualVal = state.progress.budgetActual[cat.id];
      var actual = (actualVal === undefined || actualVal === null) ? '' : actualVal;
      return (
        '<tr>' +
          '<td>' + esc(cat.name) + '</td>' +
          '<td>' + formatMoney(cat.estimate, currency) + '</td>' +
          '<td><input type="number" min="0" step="1" placeholder="0" value="' + esc(actual) + '" data-action="set-budget-actual" data-id="' + esc(cat.id) + '"></td>' +
        '</tr>'
      );
    }).join('');
    var overUnder = totals.actual - totals.estimate;

    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter VII</span>' +
        '<h2>Budget</h2>' +
        (t.budget.note ? '<p class="lede">' + esc(t.budget.note) + '</p>' : '') +
        '<table class="budget-table">' +
          '<thead><tr><th>Category</th><th>Estimated</th><th>Actual</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '<tfoot>' +
            '<tr class="budget-total-row"><td>Total</td><td>' + formatMoney(totals.estimate, currency) + '</td><td>' + formatMoney(totals.actual, currency) + '</td></tr>' +
            '<tr><td colspan="3" class="' + (overUnder > 0 ? 'budget-over' : 'budget-under') + '">' +
              (overUnder > 0 ? formatMoney(overUnder, currency) + ' over estimate' : formatMoney(Math.abs(overUnder), currency) + ' under estimate') +
            '</td></tr>' +
          '</tfoot>' +
        '</table>' +
        '<div class="divider"></div>' +
        '<h3>Add a Category</h3>' +
        '<div class="add-item-row">' +
          '<input type="text" placeholder="Category name…" id="new-budget-cat-name">' +
          '<input type="number" placeholder="Estimate" id="new-budget-cat-estimate" style="max-width:8em">' +
          '<button type="button" class="btn btn-sm" data-action="add-budget-cat">Add</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderJournal() {
    var entries = state.progress.journalEntries.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var editing = state.editingJournalId ? state.progress.journalEntries.filter(function (e) { return e.id === state.editingJournalId; })[0] : null;
    var moods = ['✨', '😊', '😌', '🥾', '😴', '🌧️', '🎉', '🤔'];
    var cityOpts = state.trip.cities.map(function (c) { return '<option value="' + esc(c.id) + '" ' + (editing && editing.cityId === c.id ? 'selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    var moodOpts = moods.map(function (m) { return '<option value="' + m + '" ' + (editing && editing.mood === m ? 'selected' : '') + '>' + m + '</option>'; }).join('');

    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter VIII</span>' +
        '<h2>Journal</h2>' +
        '<p class="lede">Your own account of the journey.</p>' +
        '<form data-form="journal">' +
          '<input type="hidden" name="id" value="' + (editing ? esc(editing.id) : '') + '">' +
          '<div class="form-grid">' +
            '<div class="field"><label>Date</label><input type="date" name="date" value="' + (editing ? esc(editing.date) : todayISO()) + '"></div>' +
            '<div class="field"><label>City (optional)</label><select name="cityId"><option value="">&mdash;</option>' + cityOpts + '</select></div>' +
          '</div>' +
          '<div class="field"><label>Title</label><input type="text" name="title" value="' + (editing ? esc(editing.title) : '') + '" placeholder="A title for this page"></div>' +
          '<div class="field"><label>Mood</label><select name="mood">' + moodOpts + '</select></div>' +
          '<div class="field"><label>Entry</label><textarea name="text" placeholder="What happened today?">' + (editing ? esc(editing.text) : '') + '</textarea></div>' +
          '<div class="btn-row">' +
            '<button type="submit" class="btn btn-primary">' + (editing ? 'Save Changes' : 'Add Entry') + '</button>' +
            (editing ? '<button type="button" class="btn btn-ghost" data-action="cancel-journal-edit">Cancel</button>' : '') +
          '</div>' +
        '</form>' +
      '</div>' +
      '<div class="codex-page">' +
        (entries.length ? entries.map(renderJournalEntry).join('') : '<p class="muted">No entries yet. The first page is always blank.</p>') +
      '</div>'
    );
  }

  function renderJournalEntry(e) {
    var city = e.cityId ? state.trip.cities.filter(function (c) { return c.id === e.cityId; })[0] : null;
    return (
      '<div class="card journal-entry">' +
        '<div class="journal-entry-head">' +
          '<span class="journal-entry-date">' + formatDate(e.date) + '</span>' +
          '<span class="journal-entry-mood">' + esc(e.mood || '') + '</span>' +
          (city ? '<span class="journal-entry-city">' + esc(city.name) + '</span>' : '') +
          (e.seeded ? '<span class="seed-flag">example</span>' : '') +
        '</div>' +
        (e.title ? '<strong>' + esc(e.title) + '</strong>' : '') +
        '<div class="journal-entry-text">' + esc(e.text || '') + '</div>' +
        '<div class="journal-entry-actions btn-row">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-action="edit-journal" data-id="' + esc(e.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-action="delete-journal" data-id="' + esc(e.id) + '">Delete</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderDecisions() {
    var decisions = state.progress.decisions.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var editing = state.editingDecisionId ? state.progress.decisions.filter(function (d) { return d.id === state.editingDecisionId; })[0] : null;
    var cityOpts = state.trip.cities.map(function (c) { return '<option value="' + esc(c.id) + '" ' + (editing && editing.cityId === c.id ? 'selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');

    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter X</span>' +
        '<h2>Decision Log</h2>' +
        '<p class="lede">The choices that shaped the road taken.</p>' +
        '<form data-form="decision">' +
          '<input type="hidden" name="id" value="' + (editing ? esc(editing.id) : '') + '">' +
          '<div class="form-grid">' +
            '<div class="field"><label>Date</label><input type="date" name="date" value="' + (editing ? esc(editing.date) : todayISO()) + '"></div>' +
            '<div class="field"><label>City (optional)</label><select name="cityId"><option value="">&mdash;</option>' + cityOpts + '</select></div>' +
          '</div>' +
          '<div class="field"><label>Decision</label><input type="text" name="title" value="' + (editing ? esc(editing.title) : '') + '" placeholder="What did you need to decide?"></div>' +
          '<div class="field"><label>Options considered (one per line)</label><textarea name="options">' + (editing ? esc((editing.options || []).join('\n')) : '') + '</textarea></div>' +
          '<div class="field"><label>What you chose</label><input type="text" name="choice" value="' + (editing ? esc(editing.choice) : '') + '"></div>' +
          '<div class="field"><label>Why</label><textarea name="reasoning">' + (editing ? esc(editing.reasoning) : '') + '</textarea></div>' +
          '<div class="btn-row">' +
            '<button type="submit" class="btn btn-primary">' + (editing ? 'Save Changes' : 'Log Decision') + '</button>' +
            (editing ? '<button type="button" class="btn btn-ghost" data-action="cancel-decision-edit">Cancel</button>' : '') +
          '</div>' +
        '</form>' +
      '</div>' +
      '<div class="codex-page">' +
        (decisions.length ? decisions.map(renderDecisionEntry).join('') : '<p class="muted">No decisions logged yet.</p>') +
      '</div>'
    );
  }

  function renderDecisionEntry(d) {
    var city = d.cityId ? state.trip.cities.filter(function (c) { return c.id === d.cityId; })[0] : null;
    return (
      '<div class="card">' +
        '<div class="journal-entry-head">' +
          '<span class="journal-entry-date">' + formatDate(d.date) + '</span>' +
          (city ? '<span class="journal-entry-city">' + esc(city.name) + '</span>' : '') +
          (d.seeded ? '<span class="seed-flag">example</span>' : '') +
        '</div>' +
        '<strong>' + esc(d.title) + '</strong>' +
        ((d.options && d.options.length) ? '<div class="decision-options">Considered: ' + d.options.map(esc).join(' · ') + '</div>' : '') +
        '<div>Chose: <span class="decision-choice">' + esc(d.choice) + '</span></div>' +
        (d.reasoning ? '<p>' + esc(d.reasoning) + '</p>' : '') +
        '<div class="journal-entry-actions btn-row">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-action="edit-decision" data-id="' + esc(d.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-action="delete-decision" data-id="' + esc(d.id) + '">Delete</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderAchievements() {
    var t = state.trip;
    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter IX</span>' +
        '<h2>Achievements</h2>' +
        '<p class="lede">Seals earned along the way.</p>' +
        '<div class="ach-grid">' +
          (t.achievements.length ? t.achievements.map(function (a) {
            var unlockedAt = state.progress.achievementsUnlocked[a.id];
            var stateInfo = computeAchievementState(a);
            return (
              '<div class="ach-item">' +
                '<div class="wax-seal ' + (unlockedAt ? '' : 'locked') + '"><span class="wax-seal-glyph">' + (unlockedAt ? '&#127941;' : '?') + '</span></div>' +
                '<div class="ach-title">' + esc(a.title) + '</div>' +
                '<div class="ach-desc">' + esc(a.description || '') + '</div>' +
                (unlockedAt ? '<div class="ach-date">Earned ' + formatDate(unlockedAt.slice(0, 10)) + '</div>' : '<div class="ach-date muted">' + esc(stateInfo.progressText) + '</div>') +
              '</div>'
            );
          }).join('') : '<p class="muted">This trip has no achievements defined yet.</p>') +
        '</div>' +
      '</div>'
    );
  }

  function renderSettings() {
    var s = state.settings;
    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter XI</span>' +
        '<h2>Settings</h2>' +

        '<div class="settings-group">' +
          '<h3>Your Name</h3>' +
          '<input type="text" data-action="set-name" value="' + esc(s.adventurerName) + '" placeholder="How the Codex should address you">' +
        '</div>' +

        '<div class="settings-group">' +
          '<h3>Theme</h3>' +
          '<div class="theme-swatch-row">' +
            '<button type="button" class="theme-swatch ' + (s.theme === 'twilight' ? 'active' : '') + '" data-action="set-theme" data-value="twilight"><div class="swatch-preview twilight"></div>Twilight Plum</button>' +
            '<button type="button" class="theme-swatch ' + (s.theme === 'parchment' ? 'active' : '') + '" data-action="set-theme" data-value="parchment"><div class="swatch-preview parchment"></div>Ivory Parchment</button>' +
          '</div>' +
        '</div>' +

        '<div class="settings-group">' +
          '<h3>Text Size</h3>' +
          '<div class="segmented">' +
            '<button type="button" class="' + (s.fontSize === 'small' ? 'active' : '') + '" data-action="set-fontsize" data-value="small">Small</button>' +
            '<button type="button" class="' + (s.fontSize === 'medium' ? 'active' : '') + '" data-action="set-fontsize" data-value="medium">Medium</button>' +
            '<button type="button" class="' + (s.fontSize === 'large' ? 'active' : '') + '" data-action="set-fontsize" data-value="large">Large</button>' +
          '</div>' +
        '</div>' +

        '<div class="settings-group">' +
          '<h3>Motion</h3>' +
          '<div class="checkbox-row"><input type="checkbox" id="reduce-motion" data-action="set-reduce-motion" ' + (s.reduceMotion ? 'checked' : '') + '><label for="reduce-motion">Reduce animation</label></div>' +
        '</div>' +

        '<div class="divider"></div>' +

        '<div class="settings-group">' +
          '<h3>Data</h3>' +
          '<div class="btn-row">' +
            '<button type="button" class="btn btn-ghost" data-action="go-import-export">Import / Export Data</button>' +
            '<button type="button" class="btn btn-danger" data-action="reset-trip-progress">Reset This Trip\'s Progress</button>' +
          '</div>' +
        '</div>' +

        '<div class="card danger-zone">' +
          '<h3>Clear Everything</h3>' +
          '<p class="muted">Erases every trip and every saved progress from this browser. This cannot be undone.</p>' +
          '<button type="button" class="btn btn-danger" data-action="clear-all-data">Clear All Codex Data</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderImportPanel(context) {
    return (
      '<div class="field">' +
        '<label>Paste JSON</label>' +
        '<textarea id="paste-json-' + context + '" placeholder="Paste the full contents of a trip-data.json file here…"></textarea>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-primary" data-action="load-pasted-json" data-context="' + context + '">Load Codex</button>' +
        '<button type="button" class="btn btn-ghost" data-action="trigger-upload-trip">Upload a File Instead</button>' +
      '</div>' +
      '<div id="import-feedback-' + context + '" class="import-feedback"></div>'
    );
  }

  function renderImportExport() {
    return (
      '<div class="codex-page">' +
        '<span class="eyebrow">Chapter XII</span>' +
        '<h2>Load a New Codex</h2>' +
        '<p class="lede">Paste or upload any trip-data.json to instantly generate a new Codex. This never touches the HTML — only the JSON changes.</p>' +
        '<div class="dropzone">' + renderImportPanel('main') + '</div>' +
      '</div>' +
      '<div class="codex-page">' +
        '<h3>Export</h3>' +
        '<p class="muted">Save copies of your current trip data, or your personal progress (quests, checklist, budget, journal, achievements, and decisions).</p>' +
        '<div class="btn-row">' +
          '<button type="button" class="btn btn-ghost" data-action="export-trip" ' + (state.trip ? '' : 'disabled') + '>Export Current Trip JSON</button>' +
          '<button type="button" class="btn btn-ghost" data-action="export-progress" ' + (state.trip ? '' : 'disabled') + '>Export My Progress</button>' +
        '</div>' +
      '</div>' +
      '<div class="codex-page">' +
        '<h3>Restore Progress</h3>' +
        '<p class="muted">Import a progress backup you exported earlier. It will be applied to the currently loaded trip.</p>' +
        '<button type="button" class="btn btn-ghost" data-action="trigger-upload-progress">Upload Progress File</button>' +
      '</div>'
    );
  }

  /* ---------- 12. EVENT DELEGATION ---------- */

  function onGlobalClick(e) {
    var el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) return;
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');

    if (action.indexOf('go-') === 0) {
      e.preventDefault();
      navigateTo(action.slice(3));
      return;
    }

    switch (action) {
      case 'open-city':
        navigateTo('cities', { cityId: id, cityView: 'detail' });
        break;
      case 'back-to-cities':
        state.cityView = 'list';
        render();
        break;
      case 'toggle-visited':
        toggleInArray(state.progress.visitedCities, id);
        saveProgress(); evaluateAchievements(); render();
        break;
      case 'filter-quest-type':
        state.questFilter.type = el.getAttribute('data-value'); render();
        break;
      case 'filter-quest-status':
        state.questFilter.status = el.getAttribute('data-value'); render();
        break;
      case 'add-pack-item': {
        var catId = el.getAttribute('data-cat');
        var input = document.querySelector('[data-role="new-pack-item"][data-cat="' + catId + '"]');
        var name = input && input.value.trim();
        if (name) {
          state.progress.customPacking.push({ id: uid('pack'), categoryId: catId, name: name });
          saveProgress(); render();
        }
        break;
      }
      case 'add-budget-cat': {
        var nameEl = document.getElementById('new-budget-cat-name');
        var estEl = document.getElementById('new-budget-cat-estimate');
        var catName = nameEl.value.trim();
        if (catName) {
          state.progress.customBudgetCategories.push({ id: uid('budget'), name: catName, estimate: Number(estEl.value) || 0 });
          saveProgress(); render();
        }
        break;
      }
      case 'set-theme':
        state.settings.theme = el.getAttribute('data-value'); saveSettings(); render();
        break;
      case 'set-fontsize':
        state.settings.fontSize = el.getAttribute('data-value'); saveSettings(); render();
        break;
      case 'reset-trip-progress':
        if (confirm('Reset all progress for this trip? Quests, packing, budget, journal, achievements, and decisions will be cleared.')) {
          state.progress = seedProgress(defaultProgress(), state.trip);
          saveProgress(); render();
        }
        break;
      case 'clear-all-data':
        if (confirm('This will erase every trip and every saved progress in this browser. Continue?')) {
          clearAllCodexData();
          location.reload();
        }
        break;
      case 'trigger-upload-trip':
        document.getElementById('file-input-trip').click();
        break;
      case 'trigger-upload-progress':
        document.getElementById('file-input-progress').click();
        break;
      case 'load-pasted-json': {
        var ctx = el.getAttribute('data-context');
        var ta = document.getElementById('paste-json-' + ctx);
        attemptLoadTripText(ta.value, ctx);
        break;
      }
      case 'export-trip':
        if (state.trip) downloadJSON(slugify(state.trip.meta.title) + '.json', state.trip);
        break;
      case 'export-progress':
        if (state.trip) downloadJSON(slugify(state.trip.meta.title) + '-progress.json', state.progress);
        break;
      case 'edit-journal':
        state.editingJournalId = id; render();
        break;
      case 'cancel-journal-edit':
        state.editingJournalId = null; render();
        break;
      case 'delete-journal':
        if (confirm('Delete this journal entry?')) {
          state.progress.journalEntries = state.progress.journalEntries.filter(function (e) { return e.id !== id; });
          if (state.editingJournalId === id) state.editingJournalId = null;
          saveProgress(); render();
        }
        break;
      case 'edit-decision':
        state.editingDecisionId = id; render();
        break;
      case 'cancel-decision-edit':
        state.editingDecisionId = null; render();
        break;
      case 'delete-decision':
        if (confirm('Delete this decision?')) {
          state.progress.decisions = state.progress.decisions.filter(function (d) { return d.id !== id; });
          if (state.editingDecisionId === id) state.editingDecisionId = null;
          saveProgress(); render();
        }
        break;
    }
  }

  function onGlobalChange(e) {
    var el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (el) {
      var action = el.getAttribute('data-action');
      var id = el.getAttribute('data-id');
      switch (action) {
        case 'toggle-quest':
          toggleInArray(state.progress.completedQuests, id);
          saveProgress(); evaluateAchievements(); render();
          return;
        case 'toggle-pack':
          toggleInArray(state.progress.packingChecked, id);
          saveProgress(); evaluateAchievements(); render();
          return;
        case 'toggle-day':
          toggleInArray(state.progress.completedDays, Number(id));
          saveProgress(); render();
          return;
        case 'set-budget-actual':
          if (el.value === '') { delete state.progress.budgetActual[id]; }
          else { state.progress.budgetActual[id] = Number(el.value); }
          saveProgress(); evaluateAchievements(); render();
          return;
        case 'set-name':
          state.settings.adventurerName = el.value; saveSettings();
          return;
        case 'set-reduce-motion':
          state.settings.reduceMotion = el.checked; saveSettings(); render();
          return;
        case 'filter-quest-city':
          state.questFilter.city = el.value; render();
          return;
      }
    }
    if (e.target.id === 'file-input-trip') { handleTripFileUpload(e.target.files[0]); return; }
    if (e.target.id === 'file-input-progress') { handleProgressFileUpload(e.target.files[0]); return; }
  }

  function onGlobalSubmit(e) {
    var form = e.target.closest ? e.target.closest('form[data-form]') : null;
    if (!form) return;
    e.preventDefault();
    var type = form.getAttribute('data-form');
    var fd = new FormData(form);

    if (type === 'journal') {
      var jid = fd.get('id');
      var entry = {
        id: jid || uid('journal'),
        date: fd.get('date') || todayISO(),
        cityId: fd.get('cityId') || null,
        title: fd.get('title') || '',
        mood: fd.get('mood') || '',
        text: fd.get('text') || ''
      };
      if (jid) {
        var jidx = state.progress.journalEntries.findIndex(function (j) { return j.id === jid; });
        if (jidx >= 0) state.progress.journalEntries[jidx] = Object.assign({}, state.progress.journalEntries[jidx], entry);
      } else {
        state.progress.journalEntries.push(entry);
      }
      state.editingJournalId = null;
      saveProgress(); evaluateAchievements(); render();
    } else if (type === 'decision') {
      var did = fd.get('id');
      var optionsRaw = fd.get('options') || '';
      var options = optionsRaw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      var decision = {
        id: did || uid('decision'),
        date: fd.get('date') || todayISO(),
        cityId: fd.get('cityId') || null,
        title: fd.get('title') || '',
        options: options,
        choice: fd.get('choice') || '',
        reasoning: fd.get('reasoning') || ''
      };
      if (did) {
        var didx = state.progress.decisions.findIndex(function (d) { return d.id === did; });
        if (didx >= 0) state.progress.decisions[didx] = Object.assign({}, state.progress.decisions[didx], decision);
      } else {
        state.progress.decisions.push(decision);
      }
      state.editingDecisionId = null;
      saveProgress(); evaluateAchievements(); render();
    }
  }

  /* ---------- 13. IMPORT / EXPORT ---------- */

  function attemptLoadTripText(text, context) {
    var feedbackEl = document.getElementById('import-feedback-' + context);
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      var msg1 = 'That is not valid JSON: ' + e.message;
      if (feedbackEl) { feedbackEl.textContent = msg1; feedbackEl.className = 'import-feedback error'; }
      else alert(msg1);
      return;
    }
    var errors = validateTripShape(data);
    if (errors.length) {
      var msg2 = 'This file is missing required fields — ' + errors.join(' ');
      if (feedbackEl) { feedbackEl.textContent = msg2; feedbackEl.className = 'import-feedback error'; }
      else alert(msg2);
      return;
    }
    var normalized = normalizeTripData(data);
    setCurrentTrip(normalized);
    if (feedbackEl) { feedbackEl.textContent = 'Codex loaded: ' + normalized.meta.title; feedbackEl.className = 'import-feedback success'; }
    navigateTo('opening');
  }

  function handleTripFileUpload(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { attemptLoadTripText(String(reader.result), 'main'); };
    reader.onerror = function () { alert('Could not read that file.'); };
    reader.readAsText(file);
  }

  function handleProgressFileUpload(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        state.progress = Object.assign(defaultProgress(), data);
        saveProgress();
        evaluateAchievements(true);
        showToast('Import complete', 'Progress Restored');
        render();
      } catch (e) {
        alert('Could not read that progress file: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  function clearAllCodexData() {
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(LS_PREFIX) === 0) toRemove.push(k);
    }
    toRemove.forEach(function (k) { localStorage.removeItem(k); });
  }

  /* ---------- 14. INIT ---------- */

  function init() {
    state.settings = loadSettings();
    applySettings();
    document.addEventListener('click', onGlobalClick);
    document.addEventListener('change', onGlobalChange);
    document.addEventListener('submit', onGlobalSubmit);

    bootstrapTrip().then(function () {
      if (state.trip) evaluateAchievements(true);
      navigateTo('opening');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
