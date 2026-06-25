// ============================================================
// Task Oracle — app.js  (v2 — Campaigns)
// D20-powered productivity oracle. Roll the die. Do the thing.
// ============================================================
// v2 adds Campaigns: up to 4 named boards, each with its own
// tasks, curse deck, and buff deck. Switch via the bottom bar.
//
// Architecture:
//   - All data lives in localStorage (no server needed)
//   - One global `state` object drives everything
//   - state.campaigns[] holds each campaign object
//   - activeCampaign() returns whichever one is currently active
//   - Views are HTML divs toggled with showView()
//   - Modals are separate overlays
// ============================================================


// ────────────────────────────────────────────────────────────
// DEFAULT DATA — seeds a fresh campaign on first launch
// ────────────────────────────────────────────────────────────

const DEFAULT_TASKS = [
  { id: 'task-d1', title: 'Clear the sink',     desc: 'Dishes and counters.',             vibe: 1, zone: 'challenge', minutes: 15, keep: 'keep', completedAt: null },
  { id: 'task-d2', title: 'Tackle the inbox',   desc: 'Process email or messages.',        vibe: 2, zone: 'challenge', minutes: 20, keep: 'keep', completedAt: null },
  { id: 'task-d3', title: 'Hobby time',         desc: 'Whatever you\'ve been putting off.',vibe: 5, zone: 'reward',    minutes: 30, keep: 'keep', completedAt: null },
  { id: 'task-d4', title: 'Read something good',desc: 'Book, article — your call.',        vibe: 4, zone: 'reward',    minutes: 25, keep: 'keep', completedAt: null },
  { id: 'task-d5', title: 'Take a walk',        desc: 'Outside. Counts.',                  vibe: 4, zone: 'reward',    minutes: 20, keep: 'keep', completedAt: null }
];

const DEFAULT_CURSES = [
  { id: 'curse-d1', text: 'Double the time on your next challenge task.',                            enabled: true },
  { id: 'curse-d2', text: 'Do the least desirable available task for 20 minutes before rolling again.', enabled: true },
  { id: 'curse-d3', text: 'Add one task you have been ignoring back onto the board.',                enabled: true },
  { id: 'curse-d4', text: 'No rerolls allowed for your next roll.',                                  enabled: true },
  { id: 'curse-d5', text: 'Clean or organize one small area before rolling again.',                  enabled: true },
  { id: 'curse-d6', text: 'If your next roll lands on a reward, cut its time in half.',              enabled: true }
];

const DEFAULT_BUFFS = [
  { id: 'buff-d1', text: 'Choose any task from the reward zone — your pick.',       enabled: true },
  { id: 'buff-d2', text: 'Extend your current reward activity by 15 minutes.',      enabled: true },
  { id: 'buff-d3', text: 'Skip one challenge task today.',                           enabled: true },
  { id: 'buff-d4', text: 'Bank a free reroll — use it any time.',                   enabled: true },
  { id: 'buff-d5', text: 'Convert one chore into a 10-minute mini-version.',        enabled: true },
  { id: 'buff-d6', text: 'Take a reward break before your next challenge roll.',     enabled: true }
];

const DEFAULT_SETTINGS = {
  neutralBehavior: 'reroll',
  rerolls: 0
};

// Emoji options shown in the campaign picker
const CAMPAIGN_EMOJIS = ['🎯','🏠','🏢','💑','💪','📚','🎮','🎨','🌱','🚗','💰','⭐','🔥','🧹','🎵','🌙'];


// ────────────────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────────────────

let state = {
  campaigns:        [],   // array of { id, name, emoji, tasks, curses, buffs }
  activeCampaignId: '',   // id of the active campaign
  settings:         {},   // global (neutral behavior, rerolls)

  // Roll session
  lastRoll:     null,
  currentTask:  null,
  currentCard:  null,
  currentZone:  null,

  // Timer session
  timerDuration:   0,
  timerRemaining:  0,
  timerInterval:   null,
  timerRunning:    false,
  timerTaskTitle:  ''
};

// Helper: always returns the active campaign object
function activeCampaign() {
  return state.campaigns.find(c => c.id === state.activeCampaignId)
      || state.campaigns[0];
}

// Helper: make a fresh default campaign with its own copy of default data
function makeDefaultCampaign(name, emoji) {
  return {
    id:     makeId(),
    name:   name   || 'My Tasks',
    emoji:  emoji  || '🎯',
    tasks:  DEFAULT_TASKS.map(t  => ({...t,  id: makeId()})),
    curses: DEFAULT_CURSES.map(c => ({...c,  id: makeId()})),
    buffs:  DEFAULT_BUFFS.map(b  => ({...b,  id: makeId()}))
  };
}


// ────────────────────────────────────────────────────────────
// PERSISTENCE
// ────────────────────────────────────────────────────────────

function saveState() {
  localStorage.setItem('taskOracle_campaigns',      JSON.stringify(state.campaigns));
  localStorage.setItem('taskOracle_activeCampaign', state.activeCampaignId);
  localStorage.setItem('taskOracle_settings',       JSON.stringify(state.settings));
}

function loadState() {
  // ── Migration: v1 stored tasks/curses/buffs at the top level ──
  // If old keys exist and no campaigns key, wrap them into a first campaign.
  const oldTasks = localStorage.getItem('taskOracle_tasks');
  if (oldTasks && !localStorage.getItem('taskOracle_campaigns')) {
    const migrated = {
      id:     makeId(),
      name:   'My Tasks',
      emoji:  '🎯',
      tasks:  JSON.parse(oldTasks) || [],
      curses: JSON.parse(localStorage.getItem('taskOracle_curses')) || DEFAULT_CURSES.map(c => ({...c})),
      buffs:  JSON.parse(localStorage.getItem('taskOracle_buffs'))  || DEFAULT_BUFFS.map(b => ({...b}))
    };
    state.campaigns        = [migrated];
    state.activeCampaignId = migrated.id;
    state.settings = JSON.parse(localStorage.getItem('taskOracle_settings')) || {...DEFAULT_SETTINGS};
    // Remove old keys so we don't migrate again
    ['taskOracle_tasks','taskOracle_curses','taskOracle_buffs'].forEach(k => localStorage.removeItem(k));
    saveState();
    return;
  }

  // ── Normal load ──
  const campaigns = JSON.parse(localStorage.getItem('taskOracle_campaigns'));
  if (campaigns && campaigns.length > 0) {
    state.campaigns        = campaigns;
    state.activeCampaignId = localStorage.getItem('taskOracle_activeCampaign') || campaigns[0].id;
    // Ensure activeCampaignId actually exists (in case a campaign was deleted)
    if (!state.campaigns.find(c => c.id === state.activeCampaignId)) {
      state.activeCampaignId = state.campaigns[0].id;
    }
  } else {
    // First launch — create a single default campaign and persist it immediately
    const first = makeDefaultCampaign('My Tasks', '🎯');
    state.campaigns        = [first];
    state.activeCampaignId = first.id;
    state.settings = {...DEFAULT_SETTINGS};
    saveState();
  }

  state.settings = JSON.parse(localStorage.getItem('taskOracle_settings')) || {...DEFAULT_SETTINGS};
}


// ────────────────────────────────────────────────────────────
// UNIQUE ID
// ────────────────────────────────────────────────────────────

function makeId() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}


// ────────────────────────────────────────────────────────────
// VIEW NAVIGATION
// ────────────────────────────────────────────────────────────

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + id);
  if (target) target.classList.add('active');
  if (id === 'board') renderBoard();
  window.scrollTo(0, 0);
}


// ────────────────────────────────────────────────────────────
// CAMPAIGN BAR
// ────────────────────────────────────────────────────────────

function renderCampaignBar() {
  const bar = document.getElementById('campaign-bar');
  if (!bar) return;  // guard: old cached HTML may not have this element yet
  const ac  = activeCampaign();
  if (!ac) return;

  let html = state.campaigns.map(c => `
    <button
      class="campaign-tab ${c.id === state.activeCampaignId ? 'active' : ''}"
      onclick="handleCampaignTabTap('${c.id}')"
      title="${escapeHtml(c.name)}"
    >
      <div class="campaign-tab-emoji">${c.emoji}</div>
      <div class="campaign-tab-name">${escapeHtml(c.name)}</div>
    </button>
  `).join('');

  // Show "+" only if fewer than 4 campaigns
  if (state.campaigns.length < 4) {
    html += `<button class="campaign-tab campaign-tab-add" onclick="openCampaignModal(null)" title="New campaign">＋</button>`;
  }

  bar.innerHTML = html;
}

function handleCampaignTabTap(id) {
  if (id === state.activeCampaignId) {
    // Tapping the active campaign opens its edit modal
    openCampaignModal(id);
  } else {
    switchCampaign(id);
  }
}

function switchCampaign(id) {
  state.activeCampaignId = id;
  saveState();
  renderBoard();
  renderCampaignBar();
  showToast(`📋 ${activeCampaign().name}`);
}


// ────────────────────────────────────────────────────────────
// CAMPAIGN MODAL — create / edit / delete
// ────────────────────────────────────────────────────────────

let modalCampaignEmoji = '🎯'; // tracks emoji selection during modal

function openCampaignModal(campaignId) {
  const modal  = document.getElementById('modal-campaign');
  const isNew  = !campaignId;
  const title  = document.getElementById('modal-campaign-title');
  const nameEl = document.getElementById('campaign-name');
  const delRow = document.getElementById('campaign-delete-row');

  document.getElementById('campaign-id').value = campaignId || '';
  title.textContent = isNew ? 'New Campaign' : 'Edit Campaign';
  delRow.style.display = isNew ? 'none' : 'block';

  if (isNew) {
    nameEl.value        = '';
    modalCampaignEmoji  = '🎯';
  } else {
    const campaign      = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    nameEl.value        = campaign.name;
    modalCampaignEmoji  = campaign.emoji;
  }

  renderEmojiPicker();
  modal.classList.add('open');
}

function renderEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  picker.innerHTML = CAMPAIGN_EMOJIS.map(e => `
    <button
      class="emoji-option ${e === modalCampaignEmoji ? 'selected' : ''}"
      onclick="selectCampaignEmoji('${e}')"
    >${e}</button>
  `).join('');
}

function selectCampaignEmoji(emoji) {
  modalCampaignEmoji = emoji;
  renderEmojiPicker();
}

function saveCampaign() {
  const name       = document.getElementById('campaign-name').value.trim();
  const campaignId = document.getElementById('campaign-id').value;
  const isNew      = !campaignId;

  if (!name) { showToast('Campaign needs a name.'); return; }

  if (isNew) {
    if (state.campaigns.length >= 4) {
      showToast('Maximum 4 campaigns.');
      return;
    }
    // New campaigns start empty (no pre-seeded tasks — user builds it fresh)
    const campaign = {
      id:     makeId(),
      name,
      emoji:  modalCampaignEmoji,
      tasks:  [],
      curses: DEFAULT_CURSES.map(c => ({...c, id: makeId()})),
      buffs:  DEFAULT_BUFFS.map(b => ({...b, id: makeId()}))
    };
    state.campaigns.push(campaign);
    state.activeCampaignId = campaign.id;
  } else {
    const idx = state.campaigns.findIndex(c => c.id === campaignId);
    if (idx !== -1) {
      state.campaigns[idx].name  = name;
      state.campaigns[idx].emoji = modalCampaignEmoji;
    }
  }

  saveState();
  closeModal('modal-campaign');
  renderCampaignBar();
  renderBoard();
  showToast(isNew ? `Campaign "${name}" created!` : 'Campaign updated.');
}

function deleteCampaign() {
  const campaignId = document.getElementById('campaign-id').value;
  if (!campaignId) return;

  if (state.campaigns.length <= 1) {
    showToast('Can\'t delete your last campaign.');
    return;
  }

  const campaign = state.campaigns.find(c => c.id === campaignId);
  if (!confirm(`Delete campaign "${campaign ? campaign.name : ''}" and all its tasks?`)) return;

  state.campaigns = state.campaigns.filter(c => c.id !== campaignId);

  // If the deleted one was active, switch to the first remaining
  if (state.activeCampaignId === campaignId) {
    state.activeCampaignId = state.campaigns[0].id;
  }

  saveState();
  closeModal('modal-campaign');
  renderCampaignBar();
  renderBoard();
  showToast('Campaign deleted.');
}


// ────────────────────────────────────────────────────────────
// BOARD RENDERING
// ────────────────────────────────────────────────────────────

function renderBoard() {
  const ac = activeCampaign();
  if (!ac) return;

  // Update the board header to show which campaign is active
  const heading = document.getElementById('board-campaign-name');
  if (heading) heading.textContent = `${ac.emoji} ${ac.name}`;

  renderTaskList('challenge-list', 'challenge', ac.tasks);
  renderTaskList('neutral-list',   'neutral',   ac.tasks);
  renderTaskList('reward-list',    'reward',    ac.tasks);
  renderCardList('curse-list',  'curse', ac.curses);
  renderCardList('buff-list',   'buff',  ac.buffs);
  updateRerollBadge();
}

function renderTaskList(containerId, zone, allTasks) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const tasks     = (allTasks || []).filter(t => t.zone === zone);

  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks yet.</div>';
    return;
  }

  container.innerHTML = tasks.map(task => `
    <div class="task-card ${zone}" onclick="openTaskModal('${task.id}')">
      <div>
        <div class="task-card-title">${escapeHtml(task.title)}</div>
        ${task.desc ? `<div class="task-card-meta" style="font-style:italic;">${escapeHtml(task.desc)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <span class="task-card-meta">${task.minutes}m</span>
        <span style="font-size:1rem;">${vibeEmoji(task.vibe)}</span>
      </div>
    </div>
  `).join('');
}

function renderCardList(containerId, type, deck) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!deck || deck.length === 0) {
    container.innerHTML = '<div class="empty-state">No cards yet.</div>';
    return;
  }

  container.innerHTML = deck.map(card => `
    <div class="special-card ${type}" onclick="openCardModal('${card.id}', '${type}')">
      <div class="special-card-text" style="${!card.enabled ? 'text-decoration:line-through;opacity:0.5;' : ''}">
        ${escapeHtml(card.text)}
      </div>
      <span style="font-size:0.75rem;color:var(--text-dim);margin-left:8px;white-space:nowrap;">
        ${card.enabled ? '✓' : '–'}
      </span>
    </div>
  `).join('');
}

// Helpers
function vibeEmoji(vibe) {
  return ['','😩','😕','😐','🙂','🌟'][vibe] || '😐';
}
function vibeToZone(vibe) {
  if (vibe <= 2) return 'challenge';
  if (vibe === 3) return 'neutral';
  return 'reward';
}
function zoneLabel(zone) {
  const labels = { challenge:'Challenge Zone', neutral:'Neutral Zone', reward:'Reward Zone', curse:'Curse Card', buff:'Buff Card' };
  return labels[zone] || zone;
}
function zoneIcon(zone) {
  const icons = { challenge:'⚔️', neutral:'😐', reward:'🌟', curse:'💀', buff:'✨' };
  return icons[zone] || '🎲';
}
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function updateRerollBadge() {
  const rerolls = state.settings.rerolls || 0;
  const badge   = document.getElementById('reroll-badge');
  const count   = document.getElementById('reroll-count');
  if (rerolls > 0) { badge.classList.add('visible'); count.textContent = rerolls; }
  else { badge.classList.remove('visible'); }
}


// ────────────────────────────────────────────────────────────
// MANUAL ROLL GRID (1–20)
// ────────────────────────────────────────────────────────────

function buildNumberGrid() {
  const grid = document.getElementById('manual-grid');
  grid.innerHTML = Array.from({length:20}, (_,i) => i+1).map(n => {
    let zClass = '';
    if (n === 1)              zClass = 'zone-curse';
    else if (n <= 9)          zClass = 'zone-challenge';
    else if (n <= 11)         zClass = 'zone-neutral';
    else if (n <= 19)         zClass = 'zone-reward';
    else                      zClass = 'zone-buff';
    return `<button class="grid-btn ${zClass}" onclick="doManualRoll(${n})">${n}</button>`;
  }).join('');
}


// ────────────────────────────────────────────────────────────
// ROLLING LOGIC
// ────────────────────────────────────────────────────────────

function doDigitalRoll() {
  const btn     = document.getElementById('btn-digital-roll');
  const display = document.getElementById('roll-number-display');
  const label   = document.getElementById('roll-label');

  if (btn.classList.contains('rolling')) return;
  btn.classList.add('rolling');
  label.textContent = 'ROLLING...';

  let flickerCount = 0;
  const flicker = setInterval(() => {
    display.textContent = Math.floor(Math.random() * 20) + 1;
    if (++flickerCount > 12) clearInterval(flicker);
  }, 60);

  setTimeout(() => {
    const roll = Math.floor(Math.random() * 20) + 1;
    display.textContent = roll;
    label.textContent   = 'ROLLED';
    btn.classList.remove('rolling');
    setTimeout(() => resolveRoll(roll), 500);
  }, 800);
}

function doManualRoll(n) {
  const btns = document.querySelectorAll('.grid-btn');
  btns.forEach(b => b.style.opacity = '0.4');
  event.target.style.opacity   = '1';
  event.target.style.transform = 'scale(1.15)';
  setTimeout(() => {
    btns.forEach(b => { b.style.opacity = ''; b.style.transform = ''; });
    resolveRoll(n);
  }, 300);
}

function resolveRoll(roll) {
  state.lastRoll = roll;
  const ac = activeCampaign();
  let zone, task = null, card = null;

  if (roll === 1) {
    zone = 'curse';
    const deck = ac.curses.filter(c => c.enabled);
    card = deck.length > 0
      ? deck[Math.floor(Math.random() * deck.length)]
      : { text: 'No curse cards active. You escaped this one.' };

  } else if (roll === 20) {
    zone = 'buff';
    const deck = ac.buffs.filter(b => b.enabled);
    card = deck.length > 0
      ? deck[Math.floor(Math.random() * deck.length)]
      : { text: 'No buff cards active. Bask in your natural 20.' };
    // If the card mentions a reroll, bank one
    if (card.text && card.text.toLowerCase().includes('reroll')) bankReroll();

  } else if (roll >= 2 && roll <= 9) {
    zone = 'challenge';
    const pool = ac.tasks.filter(t => t.zone === 'challenge');
    task = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

  } else if (roll >= 10 && roll <= 11) {
    zone = 'neutral';
    const behavior = state.settings.neutralBehavior || 'reroll';
    if (behavior === 'reroll') {
      showToast('Neutral roll — rerolling...');
      setTimeout(() => resolveRoll(Math.floor(Math.random() * 20) + 1), 800);
      return;
    } else if (behavior === 'choice') {
      card = { text: 'Neutral roll! Choose any task from the board.' };
    } else {
      const pool = ac.tasks.filter(t => t.zone === 'neutral');
      if (pool.length === 0) {
        showToast('Neutral pool empty — rerolling...');
        setTimeout(() => resolveRoll(Math.floor(Math.random() * 20) + 1), 800);
        return;
      }
      task = pool[Math.floor(Math.random() * pool.length)];
    }

  } else {
    zone = 'reward';
    const pool = ac.tasks.filter(t => t.zone === 'reward');
    task = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  state.currentTask = task;
  state.currentCard = card;
  state.currentZone = zone;
  showResultScreen(roll, zone, task, card);
}


// ────────────────────────────────────────────────────────────
// RESULT SCREEN
// ────────────────────────────────────────────────────────────

function showResultScreen(roll, zone, task, card) {
  const badge = document.getElementById('result-badge');
  badge.textContent = `Roll ${roll} — ${zoneLabel(zone)}`;
  badge.className   = 'result-roll-badge ' + zone;

  const cardEl = document.getElementById('result-card');
  cardEl.className = 'result-card ' + zone;

  document.getElementById('result-icon').textContent = zoneIcon(zone);

  const timerRow  = document.getElementById('result-timer-row');
  const startBtn  = document.getElementById('btn-start-timer');
  const rerollBtn = document.getElementById('btn-reroll-result');

  if (task) {
    document.getElementById('result-title').textContent    = task.title;
    document.getElementById('result-desc').textContent     = task.desc || zoneLabel(zone);
    document.getElementById('result-duration').value       = task.minutes;
    timerRow.style.display  = 'flex';
    startBtn.style.display  = 'block';
    rerollBtn.style.display = 'none';
  } else if (card) {
    document.getElementById('result-title').textContent    = zone === 'curse' ? '💀 Curse Card' : zone === 'buff' ? '✨ Buff Card' : '🎲 Neutral';
    document.getElementById('result-desc').textContent     = card.text;
    timerRow.style.display  = 'none';
    startBtn.style.display  = 'none';
    rerollBtn.style.display = 'block';
  } else {
    document.getElementById('result-title').textContent    = `No ${zoneLabel(zone)} tasks`;
    document.getElementById('result-desc').textContent     = 'Add some tasks to this zone first.';
    timerRow.style.display  = 'none';
    startBtn.style.display  = 'none';
    rerollBtn.style.display = 'block';
  }

  showView('result');
}


// ────────────────────────────────────────────────────────────
// TIMER
// ────────────────────────────────────────────────────────────

function startTimer() {
  const minutes = parseInt(document.getElementById('result-duration').value) || 25;
  state.timerDuration  = minutes * 60;
  state.timerRemaining = minutes * 60;
  state.timerRunning   = true;
  state.timerTaskTitle = state.currentTask ? state.currentTask.title : 'Task';

  document.getElementById('timer-task-name').textContent = state.timerTaskTitle;
  document.getElementById('timer-task-sub').textContent  = state.currentZone ? zoneLabel(state.currentZone) : '';
  document.getElementById('timer-progress').style.width  = '100%';
  document.getElementById('btn-pause').textContent       = '⏸ Pause';

  updateTimerDisplay();
  playGong();

  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(tickTimer, 1000);
  showView('timer');
}

function tickTimer() {
  if (!state.timerRunning) return;
  state.timerRemaining--;
  if (state.timerRemaining <= 0) {
    state.timerRemaining = 0;
    clearInterval(state.timerInterval);
    state.timerRunning = false;
    updateTimerDisplay();
    playGong();
    setTimeout(() => showCompletionScreen(), 800);
    return;
  }
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const mins    = Math.floor(state.timerRemaining / 60);
  const secs    = state.timerRemaining % 60;
  const display = document.getElementById('timer-display');
  display.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  const pct = state.timerRemaining / state.timerDuration;
  display.classList.remove('warning','urgent');
  if (pct < 0.1) display.classList.add('urgent');
  else if (pct < 0.25) display.classList.add('warning');
  document.getElementById('timer-progress').style.width = (pct * 100) + '%';
}

function togglePause() {
  state.timerRunning = !state.timerRunning;
  const btn = document.getElementById('btn-pause');
  if (state.timerRunning) {
    btn.textContent = '⏸ Pause';
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(tickTimer, 1000);
  } else {
    btn.textContent = '▶ Resume';
    clearInterval(state.timerInterval);
  }
}

function timerDoneEarly() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  playGong();
  showCompletionScreen();
}

function abandonTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  showView('board');
}

function skipTimer() {
  showCompletionScreen();
}


// ────────────────────────────────────────────────────────────
// GONG — Web Audio API, no file needed
// ────────────────────────────────────────────────────────────

function playGong() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const layers = [
      { type:'sine',     freq:200, freqEnd:160, vol:0.7, volEnd:0.001, dur:4.0 },
      { type:'sine',     freq:480, freqEnd:420, vol:0.3, volEnd:0.001, dur:2.5 },
      { type:'triangle', freq:1200,freqEnd:1200,vol:0.15,volEnd:0.001, dur:0.3 }
    ];
    layers.forEach(l => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = l.type;
      osc.frequency.setValueAtTime(l.freq, ctx.currentTime);
      if (l.freqEnd !== l.freq) osc.frequency.exponentialRampToValueAtTime(l.freqEnd, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(l.vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(l.volEnd, ctx.currentTime + l.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + l.dur);
    });
    setTimeout(() => ctx.close(), 5000);
  } catch(e) { /* silent fallback */ }
}


// ────────────────────────────────────────────────────────────
// COMPLETION FLOW
// ────────────────────────────────────────────────────────────

function showCompletionScreen() {
  document.getElementById('complete-heading').textContent  = state.timerRemaining === 0 ? "Time's Up!" : 'Done?';
  document.getElementById('complete-task-name').textContent = state.timerTaskTitle || 'That task';
  showView('complete');
}

function resolveTask(outcome) {
  const task = state.currentTask;
  if (!task) { showView('board'); return; }

  if (outcome === 'complete') {
    if (task.keep === 'remove') {
      removeTask(task.id);
      showToast('Task completed and removed.');
    } else if (task.keep === 'ask') {
      if (confirm(`Remove "${task.title}" from the board?`)) {
        removeTask(task.id);
        showToast('Task removed.');
      } else {
        showToast('Task kept on board.');
      }
    } else {
      showToast('✅ Complete! Task stays on the board.');
    }
    task.completedAt = new Date().toISOString();
    saveState();
  } else if (outcome === 'partial') {
    showToast('⏳ Partial — task stays on the board.');
  } else {
    showToast('Task stays on the board.');
  }
  showView('board');
}

function removeTask(id) {
  const ac  = activeCampaign();
  ac.tasks  = ac.tasks.filter(t => t.id !== id);
  saveState();
}


// ────────────────────────────────────────────────────────────
// REROLLS
// ────────────────────────────────────────────────────────────

function bankReroll() {
  state.settings.rerolls = (state.settings.rerolls || 0) + 1;
  saveState();
  showToast('🎲 Reroll banked!');
  updateRerollBadge();
}


// ────────────────────────────────────────────────────────────
// TASK MODAL
// ────────────────────────────────────────────────────────────

let modalVibe     = 3;
let modalDuration = 30;

function openTaskModal(taskId, presetZone) {
  const isNew = !taskId;
  document.getElementById('modal-task-title').textContent      = isNew ? 'Add Task' : 'Edit Task';
  document.getElementById('task-delete-row').style.display     = isNew ? 'none' : 'block';
  document.getElementById('task-id').value                     = taskId || '';

  if (isNew) {
    document.getElementById('task-name').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-keep').value = 'keep';
    modalVibe     = presetZone === 'challenge' ? 1 : presetZone === 'reward' ? 5 : 3;
    modalDuration = 30;
  } else {
    const task = activeCampaign().tasks.find(t => t.id === taskId);
    if (!task) return;
    document.getElementById('task-name').value = task.title;
    document.getElementById('task-desc').value = task.desc || '';
    document.getElementById('task-keep').value = task.keep;
    modalVibe     = task.vibe;
    modalDuration = task.minutes;
  }

  renderVibeButtons();
  renderDurationButtons();
  updateVibeHint();
  document.getElementById('modal-task').classList.add('open');
}

function selectVibe(n)      { modalVibe = n; renderVibeButtons(); updateVibeHint(); }
function selectDuration(m)  { modalDuration = m; renderDurationButtons(); document.getElementById('task-duration-custom').value = ''; }

function renderVibeButtons() {
  document.querySelectorAll('.vibe-btn').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.vibe) === modalVibe));
}
function renderDurationButtons() {
  document.querySelectorAll('.dur-btn').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.min) === modalDuration));
}
function updateVibeHint() {
  const labels = { challenge:'→ Challenge Zone (rolls 2–9)', neutral:'→ Neutral Zone (rolls 10–11)', reward:'→ Reward Zone (rolls 12–19)' };
  document.getElementById('vibe-hint').textContent = labels[vibeToZone(modalVibe)];
}

function saveTask() {
  const name = document.getElementById('task-name').value.trim();
  if (!name) { showToast('Task needs a name.'); return; }

  const customDur = parseInt(document.getElementById('task-duration-custom').value);
  const duration  = customDur > 0 ? customDur : modalDuration;
  const taskId    = document.getElementById('task-id').value;
  const isNew     = !taskId;
  const ac        = activeCampaign();

  const taskData = {
    id:          isNew ? makeId() : taskId,
    title:       name,
    desc:        document.getElementById('task-desc').value.trim(),
    vibe:        modalVibe,
    zone:        vibeToZone(modalVibe),
    minutes:     duration || 30,
    keep:        document.getElementById('task-keep').value,
    completedAt: null
  };

  if (isNew) {
    ac.tasks.push(taskData);
  } else {
    const idx = ac.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) ac.tasks[idx] = taskData;
  }

  saveState();
  closeModal('modal-task');
  renderBoard();
  showToast(isNew ? 'Task added!' : 'Task updated!');
}

function deleteTask() {
  const taskId = document.getElementById('task-id').value;
  if (!taskId || !confirm('Delete this task?')) return;
  const ac = activeCampaign();
  ac.tasks = ac.tasks.filter(t => t.id !== taskId);
  saveState();
  closeModal('modal-task');
  renderBoard();
  showToast('Task deleted.');
}


// ────────────────────────────────────────────────────────────
// CARD MODAL (curse / buff)
// ────────────────────────────────────────────────────────────

function openCardModal(cardId, type) {
  const isNew = !cardId;
  document.getElementById('card-type').value  = type;
  document.getElementById('card-id').value    = cardId || '';
  document.getElementById('modal-card-title').textContent =
    isNew ? `Add ${type === 'curse' ? 'Curse' : 'Buff'} Card`
           : `Edit ${type === 'curse' ? 'Curse' : 'Buff'} Card`;
  document.getElementById('card-delete-row').style.display = isNew ? 'none' : 'block';

  if (isNew) {
    document.getElementById('card-text').value    = '';
    document.getElementById('card-enabled').checked = true;
  } else {
    const ac   = activeCampaign();
    const deck = type === 'curse' ? ac.curses : ac.buffs;
    const card = deck.find(c => c.id === cardId);
    if (!card) return;
    document.getElementById('card-text').value       = card.text;
    document.getElementById('card-enabled').checked  = card.enabled;
  }
  document.getElementById('modal-card').classList.add('open');
}

function saveCard() {
  const text    = document.getElementById('card-text').value.trim();
  if (!text) { showToast('Card needs some text.'); return; }
  const type    = document.getElementById('card-type').value;
  const cardId  = document.getElementById('card-id').value;
  const enabled = document.getElementById('card-enabled').checked;
  const isNew   = !cardId;
  const ac      = activeCampaign();
  const deck    = type === 'curse' ? ac.curses : ac.buffs;

  const cardData = { id: isNew ? makeId() : cardId, text, enabled };
  if (isNew) {
    deck.push(cardData);
  } else {
    const idx = deck.findIndex(c => c.id === cardId);
    if (idx !== -1) deck[idx] = cardData;
  }
  saveState();
  closeModal('modal-card');
  renderBoard();
  showToast(isNew ? 'Card added!' : 'Card updated!');
}

function deleteCard() {
  const cardId = document.getElementById('card-id').value;
  const type   = document.getElementById('card-type').value;
  if (!cardId || !confirm('Delete this card?')) return;
  const ac = activeCampaign();
  if (type === 'curse') ac.curses = ac.curses.filter(c => c.id !== cardId);
  else                  ac.buffs  = ac.buffs.filter(b  => b.id !== cardId);
  saveState();
  closeModal('modal-card');
  renderBoard();
  showToast('Card deleted.');
}


// ────────────────────────────────────────────────────────────
// SETTINGS MODAL
// ────────────────────────────────────────────────────────────

document.getElementById('btn-settings').addEventListener('click', () => {
  const nb = state.settings.neutralBehavior || 'reroll';
  document.querySelectorAll('input[name="neutral"]').forEach(r => r.checked = (r.value === nb));
  document.getElementById('settings-rerolls').textContent = state.settings.rerolls || 0;
  document.getElementById('modal-settings').classList.add('open');
});

function saveSettings() {
  const sel = document.querySelector('input[name="neutral"]:checked');
  if (sel) state.settings.neutralBehavior = sel.value;
  saveState();
  closeModal('modal-settings');
  showToast('Settings saved.');
}

function confirmReset() {
  if (!confirm('Reset ALL data? Wipes every campaign. Cannot be undone.')) return;
  ['taskOracle_campaigns','taskOracle_activeCampaign','taskOracle_settings',
   'taskOracle_tasks','taskOracle_curses','taskOracle_buffs'].forEach(k => localStorage.removeItem(k));
  loadState();
  renderCampaignBar();
  renderBoard();
  closeModal('modal-settings');
  showToast('Data reset to defaults.');
}


// ────────────────────────────────────────────────────────────
// EXPORT / IMPORT
// ────────────────────────────────────────────────────────────

function exportData() {
  const data = {
    version:   2,
    campaigns: state.campaigns,
    settings:  state.settings,
    exported:  new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'task-oracle-backup.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported!');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.version === 2 && data.campaigns) {
        // v2 format
        state.campaigns        = data.campaigns;
        state.activeCampaignId = data.campaigns[0].id;
        if (data.settings) state.settings = data.settings;
      } else if (data.tasks) {
        // v1 format — wrap in a campaign
        const c = { id: makeId(), name:'Imported', emoji:'📦', tasks: data.tasks, curses: data.curses || [], buffs: data.buffs || [] };
        state.campaigns.push(c);
        state.activeCampaignId = c.id;
      } else {
        throw new Error('Unknown format');
      }
      saveState();
      renderCampaignBar();
      renderBoard();
      closeModal('modal-settings');
      showToast('Data imported!');
    } catch(err) {
      showToast('Import failed — check file format.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
// ────────────────────────────────────────────────────────────
// MODAL UTILITIES
// ────────────────────────────────────────────────────────────

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
function modalClickOutside(event, modalId) {
  if (event.target.id === modalId) closeModal(modalId);
}


// ────────────────────────────────────────────────────────────
// TOAST
// ────────────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}


// ────────────────────────────────────────────────────────────
// SERVICE WORKER
// ────────────────────────────────────────────────────────────

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(r  => console.log('Task Oracle SW:', r.scope))
      .catch(e => console.log('SW failed:', e));
  }
}


// ────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────

function init() {
  loadState();
  buildNumberGrid();
  renderBoard();         // board first — must not be blocked by campaign bar errors
  renderCampaignBar();   // campaign bar second — gracefully skipped if element missing
  registerServiceWorker();
  console.log('Task Oracle v2 ready. Campaigns:', state.campaigns.length, '| Tasks:', (activeCampaign() || {tasks:[]}).tasks.length);
}

document.addEventListener('DOMContentLoaded', init);
