// ============================================================
// Task Oracle — app.js
// D20-powered productivity oracle. Roll the die. Do the thing.
// ============================================================
// Architecture:
//   - All data lives in localStorage (no server needed)
//   - One global `state` object drives everything
//   - Views are HTML divs toggled with showView()
//   - Modals are separate overlays
// ============================================================


// ────────────────────────────────────────────────────────────
// DEFAULT DATA — seeds the app on first launch
// ────────────────────────────────────────────────────────────

const DEFAULT_TASKS = [
  {
    id: 'task-default-1',
    title: 'Clear the sink',
    desc: 'Dishes and counters.',
    vibe: 1,            // 1-5 desirability rating
    zone: 'challenge',  // derived from vibe: 1-2=challenge, 3=neutral, 4-5=reward
    minutes: 15,
    keep: 'keep',       // 'keep' | 'remove' | 'ask'
    completedAt: null
  },
  {
    id: 'task-default-2',
    title: 'Tackle the inbox',
    desc: 'Process email or messages.',
    vibe: 2,
    zone: 'challenge',
    minutes: 20,
    keep: 'keep',
    completedAt: null
  },
  {
    id: 'task-default-3',
    title: 'Hobby time',
    desc: 'Whatever you\'ve been putting off.',
    vibe: 5,
    zone: 'reward',
    minutes: 30,
    keep: 'keep',
    completedAt: null
  },
  {
    id: 'task-default-4',
    title: 'Read something good',
    desc: 'Book, article — your call.',
    vibe: 4,
    zone: 'reward',
    minutes: 25,
    keep: 'keep',
    completedAt: null
  },
  {
    id: 'task-default-5',
    title: 'Take a walk',
    desc: 'Outside. Counts.',
    vibe: 4,
    zone: 'reward',
    minutes: 20,
    keep: 'keep',
    completedAt: null
  }
];

const DEFAULT_CURSES = [
  { id: 'curse-1', text: 'Double the time on your next challenge task.', enabled: true },
  { id: 'curse-2', text: 'Do the least desirable available task for 20 minutes before rolling again.', enabled: true },
  { id: 'curse-3', text: 'Add one task you have been ignoring back onto the board.', enabled: true },
  { id: 'curse-4', text: 'No rerolls allowed for your next roll.', enabled: true },
  { id: 'curse-5', text: 'Clean or organize one small area before rolling again.', enabled: true },
  { id: 'curse-6', text: 'If your next roll lands on a reward, cut its time in half.', enabled: true }
];

const DEFAULT_BUFFS = [
  { id: 'buff-1', text: 'Choose any task from the reward zone — your pick.', enabled: true },
  { id: 'buff-2', text: 'Extend your current reward activity by 15 minutes.', enabled: true },
  { id: 'buff-3', text: 'Skip one challenge task today.', enabled: true },
  { id: 'buff-4', text: 'Bank a free reroll — use it any time.', enabled: true },
  { id: 'buff-5', text: 'Convert one chore into a 10-minute mini-version.', enabled: true },
  { id: 'buff-6', text: 'Take a reward break before your next challenge roll.', enabled: true }
];

const DEFAULT_SETTINGS = {
  neutralBehavior: 'reroll', // 'reroll' | 'choice' | 'pool'
  rerolls: 0
};


// ────────────────────────────────────────────────────────────
// STATE — the single source of truth for the app
// ────────────────────────────────────────────────────────────

let state = {
  tasks: [],
  curses: [],
  buffs: [],
  settings: {},

  // Roll session (reset each roll)
  lastRoll: null,       // the number 1-20
  currentTask: null,    // task object or null
  currentCard: null,    // curse/buff card object or null
  currentZone: null,    // 'challenge' | 'neutral' | 'reward' | 'curse' | 'buff'

  // Timer session
  timerDuration: 0,     // total seconds
  timerRemaining: 0,    // seconds left
  timerInterval: null,  // setInterval handle
  timerRunning: false,
  timerTaskTitle: ''
};


// ────────────────────────────────────────────────────────────
// PERSISTENCE — save/load from localStorage
// ────────────────────────────────────────────────────────────

function saveState() {
  localStorage.setItem('taskOracle_tasks',    JSON.stringify(state.tasks));
  localStorage.setItem('taskOracle_curses',   JSON.stringify(state.curses));
  localStorage.setItem('taskOracle_buffs',    JSON.stringify(state.buffs));
  localStorage.setItem('taskOracle_settings', JSON.stringify(state.settings));
}

function loadState() {
  // Load each piece, falling back to defaults if nothing saved yet
  state.tasks    = JSON.parse(localStorage.getItem('taskOracle_tasks'))    || DEFAULT_TASKS.map(t => ({...t}));
  state.curses   = JSON.parse(localStorage.getItem('taskOracle_curses'))   || DEFAULT_CURSES.map(c => ({...c}));
  state.buffs    = JSON.parse(localStorage.getItem('taskOracle_buffs'))    || DEFAULT_BUFFS.map(b => ({...b}));
  state.settings = JSON.parse(localStorage.getItem('taskOracle_settings')) || {...DEFAULT_SETTINGS};
}


// ────────────────────────────────────────────────────────────
// UNIQUE ID generator
// ────────────────────────────────────────────────────────────

function makeId() {
  // Simple: timestamp + random string. No library needed.
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}


// ────────────────────────────────────────────────────────────
// VIEW NAVIGATION — toggle which view is visible
// ────────────────────────────────────────────────────────────

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + id);
  if (target) target.classList.add('active');

  // Refresh board data whenever we return to it
  if (id === 'board') renderBoard();

  // Scroll to top when switching views
  window.scrollTo(0, 0);
}


// ────────────────────────────────────────────────────────────
// BOARD RENDERING — draws all tasks and cards
// ────────────────────────────────────────────────────────────

function renderBoard() {
  renderTaskList('challenge-list', 'challenge');
  renderTaskList('neutral-list',   'neutral');
  renderTaskList('reward-list',    'reward');
  renderCardList('curse-list',     'curse');
  renderCardList('buff-list',      'buff');
  updateRerollBadge();
}

function renderTaskList(containerId, zone) {
  const container = document.getElementById(containerId);
  const tasks = state.tasks.filter(t => t.zone === zone);

  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks yet.</div>';
    return;
  }

  // Build HTML for each task card
  container.innerHTML = tasks.map(task => `
    <div class="task-card ${zone}" onclick="openTaskModal('${task.id}')">
      <div>
        <div class="task-card-title">${escapeHtml(task.title)}</div>
        ${task.desc ? `<div class="task-card-meta" style="font-style:italic;">${escapeHtml(task.desc)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="task-card-meta">${task.minutes}m</span>
        <span style="font-size:1rem;">${vibeEmoji(task.vibe)}</span>
      </div>
    </div>
  `).join('');
}

function renderCardList(containerId, type) {
  const container = document.getElementById(containerId);
  const cards = type === 'curse' ? state.curses : state.buffs;

  if (cards.length === 0) {
    container.innerHTML = '<div class="empty-state">No cards yet.</div>';
    return;
  }

  container.innerHTML = cards.map(card => `
    <div class="special-card ${type}" onclick="openCardModal('${card.id}', '${type}')">
      <div class="special-card-text ${!card.enabled ? 'strikethrough' : ''}">
        ${escapeHtml(card.text)}
      </div>
      <span style="font-size:0.75rem;color:var(--text-dim);margin-left:8px;white-space:nowrap;">
        ${card.enabled ? '✓' : '–'}
      </span>
    </div>
  `).join('');
}

function vibeEmoji(vibe) {
  return ['', '😩', '😕', '😐', '🙂', '🌟'][vibe] || '😐';
}

// vibe → zone mapping
function vibeToZone(vibe) {
  if (vibe <= 2) return 'challenge';
  if (vibe === 3) return 'neutral';
  return 'reward';
}

// zone → zone label
function zoneLabel(zone) {
  if (zone === 'challenge') return 'Challenge Zone';
  if (zone === 'neutral')   return 'Neutral Zone';
  if (zone === 'reward')    return 'Reward Zone';
  if (zone === 'curse')     return 'Curse Card';
  if (zone === 'buff')      return 'Buff Card';
  return zone;
}

// zone → roll range label
function zoneRollRange(zone) {
  if (zone === 'challenge') return 'Rolls 2–9';
  if (zone === 'neutral')   return 'Rolls 10–11';
  if (zone === 'reward')    return 'Rolls 12–19';
  if (zone === 'curse')     return 'Natural 1';
  if (zone === 'buff')      return 'Natural 20';
  return '';
}

// zone → emoji icon
function zoneIcon(zone) {
  if (zone === 'challenge') return '⚔️';
  if (zone === 'neutral')   return '😐';
  if (zone === 'reward')    return '🌟';
  if (zone === 'curse')     return '💀';
  if (zone === 'buff')      return '✨';
  return '🎲';
}

// HTML escape for user-entered strings (prevents XSS)
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Reroll badge in header
function updateRerollBadge() {
  const rerolls = state.settings.rerolls || 0;
  const badge = document.getElementById('reroll-badge');
  const count = document.getElementById('reroll-count');
  if (rerolls > 0) {
    badge.classList.add('visible');
    count.textContent = rerolls;
  } else {
    badge.classList.remove('visible');
  }
}


// ────────────────────────────────────────────────────────────
// BUILD THE MANUAL NUMBER GRID (1–20)
// Each button is color-coded by its zone
// ────────────────────────────────────────────────────────────

function buildNumberGrid() {
  const grid = document.getElementById('manual-grid');
  const numbers = Array.from({length: 20}, (_, i) => i + 1); // [1, 2, ... 20]

  grid.innerHTML = numbers.map(n => {
    // Assign a CSS class for the zone color
    let zoneClass = '';
    if (n === 1)              zoneClass = 'zone-curse';
    else if (n >= 2  && n <= 9)  zoneClass = 'zone-challenge';
    else if (n >= 10 && n <= 11) zoneClass = 'zone-neutral';
    else if (n >= 12 && n <= 19) zoneClass = 'zone-reward';
    else if (n === 20)           zoneClass = 'zone-buff';

    return `<button class="grid-btn ${zoneClass}" onclick="doManualRoll(${n})">${n}</button>`;
  }).join('');
}


// ────────────────────────────────────────────────────────────
// ROLLING LOGIC
// ────────────────────────────────────────────────────────────

function doDigitalRoll() {
  // Animate the die, then resolve after the animation plays
  const btn = document.getElementById('btn-digital-roll');
  const display = document.getElementById('roll-number-display');
  const label = document.getElementById('roll-label');

  // Prevent double-clicking during animation
  if (btn.classList.contains('rolling')) return;

  btn.classList.add('rolling');
  label.textContent = 'ROLLING...';

  // Rapid number flicker during spin
  let flickerCount = 0;
  const flickerInterval = setInterval(() => {
    display.textContent = Math.floor(Math.random() * 20) + 1;
    flickerCount++;
    if (flickerCount > 12) {
      clearInterval(flickerInterval);
    }
  }, 60);

  // Settle on the real result after animation (800ms)
  setTimeout(() => {
    const roll = Math.floor(Math.random() * 20) + 1;
    display.textContent = roll;
    label.textContent   = 'ROLLED';
    btn.classList.remove('rolling');

    // Short pause so the number is readable, then resolve
    setTimeout(() => resolveRoll(roll), 500);
  }, 800);
}

function doManualRoll(n) {
  // Highlight the tapped button briefly
  const btns = document.querySelectorAll('.grid-btn');
  btns.forEach(b => b.style.opacity = '0.4');
  event.target.style.opacity = '1';
  event.target.style.transform = 'scale(1.15)';

  setTimeout(() => {
    btns.forEach(b => { b.style.opacity = ''; b.style.transform = ''; });
    resolveRoll(n);
  }, 300);
}

function resolveRoll(roll) {
  state.lastRoll = roll;

  let zone, task = null, card = null;

  if (roll === 1) {
    // ── Natural 1: Curse Card ──
    zone = 'curse';
    const enabledCurses = state.curses.filter(c => c.enabled);
    if (enabledCurses.length > 0) {
      card = enabledCurses[Math.floor(Math.random() * enabledCurses.length)];
    } else {
      card = { text: 'No curse cards active. You got lucky this time.' };
    }

  } else if (roll === 20) {
    // ── Natural 20: Buff Card ──
    zone = 'buff';
    const enabledBuffs = state.buffs.filter(b => b.enabled);
    if (enabledBuffs.length > 0) {
      card = enabledBuffs[Math.floor(Math.random() * enabledBuffs.length)];
    } else {
      card = { text: 'No buff cards active. Bask in your natural 20.' };
    }

  } else if (roll >= 2 && roll <= 9) {
    // ── Challenge zone ──
    zone = 'challenge';
    const pool = state.tasks.filter(t => t.zone === 'challenge');
    task = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

  } else if (roll >= 10 && roll <= 11) {
    // ── Neutral zone — behavior depends on settings ──
    zone = 'neutral';
    const behavior = state.settings.neutralBehavior || 'reroll';

    if (behavior === 'reroll') {
      // Auto-reroll once (show a toast so user knows)
      showToast('Neutral roll — rerolling...');
      setTimeout(() => {
        const newRoll = Math.floor(Math.random() * 20) + 1;
        resolveRoll(newRoll);
      }, 800);
      return; // exit early — the re-resolve will handle the result

    } else if (behavior === 'choice') {
      // Let the user pick any task
      task = null; // result screen will handle this
      card = { text: 'Neutral roll! You get to choose any task from the board.' };

    } else if (behavior === 'pool') {
      const pool = state.tasks.filter(t => t.zone === 'neutral');
      task = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
      if (!task) {
        // Fallback: reroll if pool is empty
        showToast('Neutral pool empty — rerolling...');
        setTimeout(() => resolveRoll(Math.floor(Math.random() * 20) + 1), 800);
        return;
      }
    }

  } else if (roll >= 12 && roll <= 19) {
    // ── Reward zone ──
    zone = 'reward';
    const pool = state.tasks.filter(t => t.zone === 'reward');
    task = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  // Store in state for use by timer and completion screens
  state.currentTask = task;
  state.currentCard = card;
  state.currentZone = zone;

  // Build the result screen, then navigate to it
  showResultScreen(roll, zone, task, card);
}


// ────────────────────────────────────────────────────────────
// RESULT SCREEN
// ────────────────────────────────────────────────────────────

function showResultScreen(roll, zone, task, card) {
  // Badge: "Roll 7 — Challenge Zone"
  const badge = document.getElementById('result-badge');
  badge.textContent = `Roll ${roll} — ${zoneLabel(zone)}`;
  badge.className = 'result-roll-badge ' + zone;

  // Card container
  const cardEl = document.getElementById('result-card');
  cardEl.className = 'result-card ' + zone;

  document.getElementById('result-icon').textContent = zoneIcon(zone);

  const timerRow  = document.getElementById('result-timer-row');
  const startBtn  = document.getElementById('btn-start-timer');
  const rerollBtn = document.getElementById('btn-reroll-result');

  if (task) {
    // Normal task result
    document.getElementById('result-title').textContent = task.title;
    document.getElementById('result-desc').textContent  = task.desc || zoneLabel(zone);
    document.getElementById('result-duration').value    = task.minutes;

    timerRow.style.display  = 'flex';
    startBtn.style.display  = 'block';
    rerollBtn.style.display = 'none';

  } else if (card) {
    // Curse or buff card
    document.getElementById('result-title').textContent = zone === 'curse' ? '💀 Curse Card' : '✨ Buff Card';
    document.getElementById('result-desc').textContent  = card.text;

    timerRow.style.display  = 'none';
    startBtn.style.display  = 'none';
    rerollBtn.style.display = 'block';

    // If it's a buff that banks a reroll, handle it
    if (zone === 'buff' && card.text && card.text.toLowerCase().includes('reroll')) {
      bankReroll();
    }

  } else {
    // Empty pool — no tasks in this zone
    const zoneName = zoneLabel(zone);
    document.getElementById('result-title').textContent = `No ${zoneName} tasks`;
    document.getElementById('result-desc').textContent  = 'Add some tasks to this zone to get results here.';

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
  const seconds = minutes * 60;

  state.timerDuration  = seconds;
  state.timerRemaining = seconds;
  state.timerRunning   = true;
  state.timerTaskTitle = state.currentTask ? state.currentTask.title : 'Task';

  // Set task name on timer screen
  document.getElementById('timer-task-name').textContent = state.timerTaskTitle;
  document.getElementById('timer-task-sub').textContent  = state.currentZone ? zoneLabel(state.currentZone) : '';

  // Reset progress bar
  document.getElementById('timer-progress').style.width = '100%';
  document.getElementById('btn-pause').textContent = '⏸ Pause';

  updateTimerDisplay();
  playGong(); // gong on start

  // Start the countdown interval (fires every second)
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
    playGong(); // gong when done
    setTimeout(() => showCompletionScreen(), 800);
    return;
  }

  updateTimerDisplay();
}

function updateTimerDisplay() {
  const mins = Math.floor(state.timerRemaining / 60);
  const secs = state.timerRemaining % 60;
  const display = document.getElementById('timer-display');
  display.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

  // Color the timer based on how much time is left
  const pct = state.timerRemaining / state.timerDuration;
  display.classList.remove('warning','urgent');
  if (pct < 0.1) display.classList.add('urgent');
  else if (pct < 0.25) display.classList.add('warning');

  // Progress bar (shrinks as time passes)
  document.getElementById('timer-progress').style.width = (pct * 100) + '%';
}

function togglePause() {
  state.timerRunning = !state.timerRunning;
  const btn = document.getElementById('btn-pause');

  if (state.timerRunning) {
    btn.textContent = '⏸ Pause';
    // Restart the interval
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(tickTimer, 1000);
  } else {
    btn.textContent = '▶ Resume';
    clearInterval(state.timerInterval);
  }
}

function timerDoneEarly() {
  // User finished before the timer ran out
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  playGong();
  showCompletionScreen();
}

function abandonTimer() {
  // User bails on the task entirely
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  showView('board');
}

function skipTimer() {
  // On result screen: mark done without starting a timer
  showCompletionScreen();
}


// ────────────────────────────────────────────────────────────
// GONG SOUND via Web Audio API — no audio file needed
// ────────────────────────────────────────────────────────────

function playGong() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Fundamental tone — the main gong body
    const osc1  = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(200, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.15);
    gain1.gain.setValueAtTime(0.7, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.0);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 4.0);

    // Second harmonic — adds warmth
    const osc2  = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(480, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.08);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + 2.5);

    // High shimmer — the attack click
    const osc3  = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(1200, ctx.currentTime);
    gain3.gain.setValueAtTime(0.15, ctx.currentTime);
    gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(ctx.currentTime);
    osc3.stop(ctx.currentTime + 0.3);

    // Clean up the AudioContext after the sound finishes
    setTimeout(() => ctx.close(), 5000);

  } catch (e) {
    // Audio not available — silent fallback (no crash)
    console.log('Audio unavailable:', e.message);
  }
}


// ────────────────────────────────────────────────────────────
// COMPLETION FLOW
// ────────────────────────────────────────────────────────────

function showCompletionScreen() {
  const heading  = document.getElementById('complete-heading');
  const taskName = document.getElementById('complete-task-name');

  heading.textContent  = state.timerRemaining === 0 ? "Time's Up!" : 'Done?';
  taskName.textContent = state.timerTaskTitle || 'That task';

  showView('complete');
}

function resolveTask(outcome) {
  // outcome: 'complete' | 'partial' | 'incomplete'
  const task = state.currentTask;

  if (!task) {
    showView('board');
    return;
  }

  if (outcome === 'complete') {
    // Handle the task's keep setting
    if (task.keep === 'remove') {
      removeTask(task.id);
      showToast('Task completed and removed from board.');
    } else if (task.keep === 'ask') {
      // Ask via a simple confirm
      const shouldRemove = confirm(`Remove "${task.title}" from the board?`);
      if (shouldRemove) removeTask(task.id);
      showToast(shouldRemove ? 'Task removed.' : 'Task kept on board.');
    } else {
      // 'keep' — stays on board
      showToast('✅ Task complete! Still on the board.');
    }
    task.completedAt = new Date().toISOString();
    saveState();

  } else if (outcome === 'partial') {
    showToast('⏳ Partial — task stays on the board.');
    // No change to the task list

  } else {
    // incomplete
    showToast('Task stays on the board.');
  }

  showView('board');
}

function removeTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
}


// ────────────────────────────────────────────────────────────
// REROLLS — banked from Buff Cards
// ────────────────────────────────────────────────────────────

function bankReroll() {
  state.settings.rerolls = (state.settings.rerolls || 0) + 1;
  saveState();
  showToast('🎲 Reroll banked!');
  updateRerollBadge();
}

function spendReroll() {
  if ((state.settings.rerolls || 0) < 1) {
    showToast('No rerolls banked.');
    return;
  }
  state.settings.rerolls--;
  saveState();
  updateRerollBadge();
  showToast('Reroll spent!');
  showView('roll');
}


// ────────────────────────────────────────────────────────────
// TASK MODAL — add / edit tasks
// ────────────────────────────────────────────────────────────

// selectedVibe and selectedDuration are form-level state
// (not in main state — they only live during a modal open)
let modalVibe = 3;
let modalDuration = 30;

function openTaskModal(taskId, presetZone) {
  const modal = document.getElementById('modal-task');
  const isNew = !taskId;

  document.getElementById('modal-task-title').textContent = isNew ? 'Add Task' : 'Edit Task';
  document.getElementById('task-delete-row').style.display = isNew ? 'none' : 'block';
  document.getElementById('task-id').value = taskId || '';

  if (isNew) {
    // Reset form
    document.getElementById('task-name').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-keep').value = 'keep';

    // Default vibe based on presetZone
    if (presetZone === 'challenge') modalVibe = 1;
    else if (presetZone === 'reward') modalVibe = 5;
    else modalVibe = 3;

    modalDuration = 30;
  } else {
    // Fill in existing task data
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('task-name').value = task.title;
    document.getElementById('task-desc').value = task.desc || '';
    document.getElementById('task-keep').value = task.keep;
    modalVibe     = task.vibe;
    modalDuration = task.minutes;
  }

  // Update UI for vibe and duration
  renderVibeButtons();
  renderDurationButtons();
  updateVibeHint();

  modal.classList.add('open');
}

function selectVibe(n) {
  modalVibe = n;
  renderVibeButtons();
  updateVibeHint();
}

function renderVibeButtons() {
  document.querySelectorAll('.vibe-btn').forEach(btn => {
    const v = parseInt(btn.dataset.vibe);
    btn.classList.toggle('selected', v === modalVibe);
  });
}

function updateVibeHint() {
  const hint = document.getElementById('vibe-hint');
  const zone = vibeToZone(modalVibe);
  const labels = {
    challenge: '→ Goes into Challenge Zone (rolls 2–9)',
    neutral:   '→ Goes into Neutral Zone (rolls 10–11)',
    reward:    '→ Goes into Reward Zone (rolls 12–19)'
  };
  hint.textContent = labels[zone];
}

function selectDuration(mins) {
  modalDuration = mins;
  renderDurationButtons();
  // Clear the custom input since a preset was picked
  document.getElementById('task-duration-custom').value = '';
}

function renderDurationButtons() {
  document.querySelectorAll('.dur-btn').forEach(btn => {
    const m = parseInt(btn.dataset.min);
    btn.classList.toggle('selected', m === modalDuration);
  });
}

function saveTask() {
  const name = document.getElementById('task-name').value.trim();
  if (!name) { showToast('Task needs a name.'); return; }

  // Get duration from quick-pick or custom input
  const customDur = parseInt(document.getElementById('task-duration-custom').value);
  const duration  = customDur > 0 ? customDur : modalDuration;

  const taskId = document.getElementById('task-id').value;
  const isNew  = !taskId;

  const taskData = {
    id:       isNew ? makeId() : taskId,
    title:    name,
    desc:     document.getElementById('task-desc').value.trim(),
    vibe:     modalVibe,
    zone:     vibeToZone(modalVibe),
    minutes:  duration || 30,
    keep:     document.getElementById('task-keep').value,
    completedAt: null
  };

  if (isNew) {
    state.tasks.push(taskData);
  } else {
    const idx = state.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) state.tasks[idx] = taskData;
  }

  saveState();
  closeModal('modal-task');
  renderBoard();
  showToast(isNew ? 'Task added!' : 'Task updated!');
}

function deleteTask() {
  const taskId = document.getElementById('task-id').value;
  if (!taskId) return;
  if (!confirm('Delete this task?')) return;
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  saveState();
  closeModal('modal-task');
  renderBoard();
  showToast('Task deleted.');
}


// ────────────────────────────────────────────────────────────
// CARD MODAL — add / edit curse or buff cards
// ────────────────────────────────────────────────────────────

function openCardModal(cardId, type) {
  const modal = document.getElementById('modal-card');
  const isNew = !cardId;

  document.getElementById('card-type').value  = type;
  document.getElementById('card-id').value    = cardId || '';
  document.getElementById('modal-card-title').textContent =
    isNew ? `Add ${type === 'curse' ? 'Curse' : 'Buff'} Card` :
            `Edit ${type === 'curse' ? 'Curse' : 'Buff'} Card`;
  document.getElementById('card-delete-row').style.display = isNew ? 'none' : 'block';

  if (isNew) {
    document.getElementById('card-text').value    = '';
    document.getElementById('card-enabled').checked = true;
  } else {
    const deck = type === 'curse' ? state.curses : state.buffs;
    const card = deck.find(c => c.id === cardId);
    if (!card) return;
    document.getElementById('card-text').value      = card.text;
    document.getElementById('card-enabled').checked = card.enabled;
  }

  modal.classList.add('open');
}

function saveCard() {
  const text = document.getElementById('card-text').value.trim();
  if (!text) { showToast('Card needs some text.'); return; }

  const type    = document.getElementById('card-type').value;
  const cardId  = document.getElementById('card-id').value;
  const enabled = document.getElementById('card-enabled').checked;
  const isNew   = !cardId;
  const deck    = type === 'curse' ? state.curses : state.buffs;

  const cardData = {
    id:      isNew ? makeId() : cardId,
    text,
    enabled
  };

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
  if (!cardId) return;
  if (!confirm('Delete this card?')) return;

  if (type === 'curse') {
    state.curses = state.curses.filter(c => c.id !== cardId);
  } else {
    state.buffs = state.buffs.filter(b => b.id !== cardId);
  }

  saveState();
  closeModal('modal-card');
  renderBoard();
  showToast('Card deleted.');
}


// ────────────────────────────────────────────────────────────
// SETTINGS MODAL
// ────────────────────────────────────────────────────────────

document.getElementById('btn-settings').addEventListener('click', () => {
  // Populate settings modal with current values
  const neutralBehavior = state.settings.neutralBehavior || 'reroll';
  document.querySelectorAll('input[name="neutral"]').forEach(radio => {
    radio.checked = (radio.value === neutralBehavior);
  });
  document.getElementById('settings-rerolls').textContent = state.settings.rerolls || 0;
  document.getElementById('modal-settings').classList.add('open');
});

function saveSettings() {
  const selected = document.querySelector('input[name="neutral"]:checked');
  if (selected) state.settings.neutralBehavior = selected.value;
  saveState();
  closeModal('modal-settings');
  showToast('Settings saved.');
}

function confirmReset() {
  if (confirm('Reset ALL data? This wipes your tasks and cards. Cannot be undone.')) {
    localStorage.removeItem('taskOracle_tasks');
    localStorage.removeItem('taskOracle_curses');
    localStorage.removeItem('taskOracle_buffs');
    localStorage.removeItem('taskOracle_settings');
    loadState();
    renderBoard();
    closeModal('modal-settings');
    showToast('Data reset to defaults.');
  }
}


// ────────────────────────────────────────────────────────────
// EXPORT / IMPORT JSON backup
// ────────────────────────────────────────────────────────────

function exportData() {
  const data = {
    tasks:    state.tasks,
    curses:   state.curses,
    buffs:    state.buffs,
    settings: state.settings,
    exported: new Date().toISOString()
  };

  // Create a downloadable JSON file
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'task-oracle-backup.json';
  link.click();
  URL.revokeObjectURL(url);

  showToast('Backup exported!');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.tasks && !data.curses && !data.buffs) {
        throw new Error('Invalid format');
      }
      if (data.tasks)    state.tasks    = data.tasks;
      if (data.curses)   state.curses   = data.curses;
      if (data.buffs)    state.buffs    = data.buffs;
      if (data.settings) state.settings = data.settings;

      saveState();
      renderBoard();
      closeModal('modal-settings');
      showToast('Data imported!');
    } catch (err) {
      showToast('Import failed — check file format.');
    }
  };
  reader.readAsText(file);

  // Reset the file input so the same file can be re-imported if needed
  event.target.value = '';
}


// ────────────────────────────────────────────────────────────
// MODAL UTILITIES
// ────────────────────────────────────────────────────────────

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Click outside the modal panel to close it
function modalClickOutside(event, modalId) {
  if (event.target.id === modalId) closeModal(modalId);
}


// ────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS
// Small feedback messages that auto-dismiss after 2s
// ────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  // Clear any pending dismiss timer
  if (toastTimer) clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}


// ────────────────────────────────────────────────────────────
// SERVICE WORKER REGISTRATION
// ────────────────────────────────────────────────────────────

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Task Oracle SW registered:', reg.scope))
      .catch(err => console.log('SW registration failed:', err));
  }
}


// ────────────────────────────────────────────────────────────
// INIT — runs when the page loads
// ────────────────────────────────────────────────────────────

function init() {
  loadState();         // Pull data from localStorage (or use defaults)
  buildNumberGrid();   // Build the 1–20 manual roll grid
  renderBoard();       // Draw the task board
  registerServiceWorker();

  console.log('Task Oracle ready. Roll the die.');
}

// Kick everything off once the DOM is ready
document.addEventListener('DOMContentLoaded', init);
