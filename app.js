/**
 * 🍅 POMODORO TRACKER — app.js
 * ES Module — all state encapsulated, no globals, no inline onclick
 */

// ══════════════════════════════════════════
//  STORAGE KEYS
// ══════════════════════════════════════════
const SK          = 'pomTracker_v2';
const HISTORY_KEY = 'pomHistory_v2';
const PROFILE_KEY = 'pomProfile_v2';

// ══════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════
const CIRC = 2 * Math.PI * 90; // r=90, ≈565.49

// Custom mode counts as a focus/study session
const isFocusMode = () => state.mode === 'focus' || state.mode === 'custom';

const MODES = {
  focus:  { label: 'FOCUS',       mins: 25, color: '#f0b429' },
  short:  { label: 'SHORT BREAK', mins: 5,  color: '#00dfa2' },
  long:   { label: 'LONG BREAK',  mins: 15, color: '#3d8bff' },
  custom: { label: 'CUSTOM',      mins: 45, color: '#f0b429' },
};

const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const SYLLABUS = {
  'CA Final':     ['Financial Reporting','Advanced FM','Advanced Auditing','Corporate Laws','Strategic Cost Mgmt','Risk Mgmt','Elective Paper','Direct Tax','Indirect Tax'],
  'CA Inter':     ['Accounting','Corporate Laws','Cost & Mgmt Acctg','Taxation','Advanced Acctg','Auditing','Financial Mgmt','Economics'],
  'CS Final':     ['Governance Risk Compliance','Advanced Tax Laws','Drafting Appearances','Secretarial Audit','Corporate Restructuring','Resolution of Corporate Disputes','Financial Treasury','Ethics Sustainability'],
  'CS Executive': ['Jurisprudence','Company Law','Setting up of Business','Financial Acctg','Securities Laws','Economic Commercial Laws','Tax Laws','Company Accounts'],
  'CMA Final':    ['Corporate Laws','Strategic Financial Mgmt','Strategic Cost Mgmt','Cost Audit','Indirect Tax Laws','Direct Tax Laws','Financial Analysis','Business Valuation'],
  'CMA Inter':    ['Company Accounts Financial Analysis','Laws Ethics','Direct Taxation','Cost Accounting','Operations Mgmt','Financial Mgmt','Indirect Taxation'],
  'UPSC':         ['Polity','History','Geography','Economy','Environment','Science Tech','Current Affairs','Essay','GS Paper 1','GS Paper 2','GS Paper 3','GS Paper 4'],
  'NEET':         ['Physics','Chemistry','Botany','Zoology'],
  'JEE':          ['Physics','Chemistry','Mathematics'],
  'MBA/CAT':      ['Quantitative Aptitude','Verbal Ability','Data Interpretation','Logical Reasoning','General Knowledge'],
  'Law':          ['Constitutional Law','Contract Law','Criminal Law','Property Law','Family Law','International Law','Company Law','Evidence'],
};

// ══════════════════════════════════════════
//  ENCAPSULATED STATE
// ══════════════════════════════════════════
const state = {
  // Profile
  userName: '', userPrep: '', selectedPrep: '', dailyGoal: 8,
  // Timer
  mode: 'focus', totalSecs: 25*60, remainSecs: 25*60,
  running: false, ticker: null,
  pomCount: 0, breakCount: 0, checkinCount: 0, streak: 0,
  studySecs: 0, topicsDoneCount: 0, sessionNum: 1,
  topics: [], activeTopicIdx: -1, wakeupMins: 10,
  timerStartedAt: null, remainAtStart: 0, checkinStartedAt: null,
  _studySecsBase: 0,
  // Widget
  widgetVisible: false, widgetMinimized: false,
  widgetDragging: false, widgetDragOffX: 0, widgetDragOffY: 0,
  // Audio
  audioCtx: null, tickEnabled: true,
  // Chart
  chartMetric: 'pom', chartRange: 30,
  // Save throttle
  _lastSaveAt: 0,
};

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
const $ = id => document.getElementById(id);
const fmt = s => String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
const esc = str => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayKey = () => dateKey(new Date());

// ══════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (p && p.name) {
      state.userName = p.name;
      state.userPrep = p.prep;
      state.dailyGoal = p.dailyGoal || 8;
      return true;
    }
  } catch(e) {}
  return false;
}

function saveProfile(name, prep) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, prep, dailyGoal: state.dailyGoal })); } catch(e) {}
}

function getMsgs() {
  const n = state.userName || 'Champion', p = state.userPrep || 'your exam';
  return [
    {e:'💪', m:`${n}, keep going! Every minute counts!`},
    {e:'🔥', m:`One more pomodoro ${n}! You're getting stronger!`},
    {e:'📖', m:`Focus ${n}! This time won't come back.`},
    {e:'⚡', m:`Phone nahi — books! ${p} banna hai ${n}!`},
    {e:'🏆', m:`Don't look back ${n}. ${p} is waiting!`},
    {e:'🧠', m:`Consistency beats talent, ${n}. Keep studying!`},
    {e:'🎯', m:`This hard work will pay off ${n}. Don't stop!`},
    {e:'💡', m:`${n}, you're building your future RIGHT NOW!`},
    {e:'🚀', m:`Serious rehna ${n}! ${p} exam door nahi hai!`},
    {e:'⭐', m:`Tu kar sakta/sakti hai ${n}. Let's go!`},
  ];
}

function getQuotes() {
  const n = state.userName || 'Champion', p = state.userPrep || 'your goal';
  return [
    '"Success is the sum of small efforts, repeated day in and day out."',
    '"The secret of getting ahead is getting started." — Mark Twain',
    `"Padhai karo, doubt mat karo." — ${n} (future wisdom)`,
    '"Hard work beats talent when talent does not work hard."',
    '"Every expert was once a beginner. Keep studying."',
    `"${p} nahi banana, banana hi hai — bas padhai karo!"`,
    '"One day at a time. One chapter at a time. One goal at a time."',
    `"${n}, the pain of discipline is far less than the pain of regret."`,
  ];
}

function applyUserProfile() {
  const n = state.userName || 'Champion', p = state.userPrep || 'your exam';
  $('headerName').textContent     = n;
  $('profileName').textContent    = n;
  $('profilePrep').textContent    = '📚 ' + p;
  $('profileAvatar').textContent  = n.charAt(0).toUpperCase();
  $('checkPopupName').textContent = `Future ${p} — ${n}! 🌟`;
  $('breakPopupName').textContent = `${n} — You Earned This! 🏆`;
  $('quoteBox').textContent = getQuotes()[Math.floor(Math.random() * getQuotes().length)];
  populateSyllabus(p);
  $('dailyGoalSelect').value = String(state.dailyGoal);
  // Show auth username in account card
  const accEl = $('accountUsername');
  if (accEl && typeof window._getCurrentUser === 'function') {
    const u = window._getCurrentUser();
    accEl.textContent = u ? (u.displayName || u.email?.split('@')[0] || '—') : '—';
  }
}

function populateSyllabus(prep) {
  const sel = $('presetTopicSelect');
  sel.innerHTML = '<option value="">➕ Add from syllabus...</option>';
  (SYLLABUS[prep] || []).forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    sel.appendChild(o);
  });
  $('presetDropdownWrap').style.display = (SYLLABUS[prep] || []).length ? 'block' : 'none';
}

// ══════════════════════════════════════════
//  ONBOARDING
// ══════════════════════════════════════════
function selectPrep(el, val) {
  const btn = el.closest ? (el.closest('.ob-prep-btn') || el) : el;
  document.querySelectorAll('.ob-prep-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.selectedPrep = val;
  $('obOtherRow').classList.toggle('show', val === 'other');
}

function finishOnboard() {
  const name = $('obName').value.trim();
  if (!name) {
    $('obName').style.borderColor = 'var(--red)';
    setTimeout(() => $('obName').style.borderColor = '', 1500);
    return;
  }
  if (!state.selectedPrep) {
    document.querySelectorAll('.ob-prep-btn').forEach(b => {
      b.style.borderColor = 'var(--red)';
      setTimeout(() => b.style.borderColor = '', 1500);
    });
    return;
  }
  let prep = state.selectedPrep;
  if (prep === 'other') prep = $('obOtherText').value.trim() || 'your exam';
  state.userName = name; state.userPrep = prep;
  saveProfile(name, prep);
  $('onboardScreen').classList.add('hidden');
  applyUserProfile();
  showWelcomeToast();
  // Trigger Firebase sync for new profile
  if (typeof window._syncStudyDB === 'function') window._syncStudyDB();
}

function showWelcomeToast() {
  const n = state.userName, p = state.userPrep;
  const toasts = [
    {e:'🔥', m:`Welcome ${n}! Let's crush ${p} together!`},
    {e:'🚀', m:`${n}, your ${p} journey starts NOW! 💪`},
    {e:'⭐', m:`Hey ${n}! Time to become a ${p} topper! 🏆`},
  ];
  const t = toasts[Math.floor(Math.random() * toasts.length)];
  $('wtEmoji').textContent = t.e;
  $('wtMsg').innerHTML = `<span class="wt-name">${t.m}</span>`;
  const toast = $('welcomeToast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function editProfile() {
  if (confirm(`Change profile?\nName: ${state.userName}\nExam: ${state.userPrep}`)) {
    try { localStorage.removeItem(PROFILE_KEY); } catch(e) {}
    $('onboardScreen').classList.remove('hidden');
  }
}

// ══════════════════════════════════════════
//  TAB SWITCHING
// ══════════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $('tab-' + tab).classList.add('active');
  $('nav-' + tab).classList.add('active');
  if (tab === 'history') {
    renderWeekHistory();
    requestAnimationFrame(() => { drawChart(); drawHeatmap(); });
  }
  if (tab === 'compete') {
    // Start Firebase leaderboard listeners (safe to call multiple times)
    if (typeof window._startLeaderboard === 'function') {
      window._startLeaderboard();
    }
    // Push latest local state to leaderboard immediately
    if (typeof window._syncStudyDB === 'function') {
      window._syncStudyDB().catch(() => {});
    }
  }
}

// ══════════════════════════════════════════
//  SAVE / LOAD STATE
// ══════════════════════════════════════════
function saveState() {
  const snap = {
    mode: state.mode, totalSecs: state.totalSecs, remainSecs: state.remainSecs,
    running: state.running, pomCount: state.pomCount, breakCount: state.breakCount,
    checkinCount: state.checkinCount, streak: state.streak, studySecs: state.studySecs,
    topicsDoneCount: state.topicsDoneCount, sessionNum: state.sessionNum,
    topics: state.topics, activeTopicIdx: state.activeTopicIdx,
    wakeupMins: state.wakeupMins, dailyGoal: state.dailyGoal,
    timerStartedAt: state.timerStartedAt, remainAtStart: state.remainAtStart,
    checkinStartedAt: state.checkinStartedAt, _studySecsBase: state._studySecsBase,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SK, JSON.stringify(snap));
  } catch(e) {
    try {
      localStorage.removeItem(HISTORY_KEY);
      localStorage.setItem(SK, JSON.stringify(snap));
    } catch(e2) {}
  }
  saveHistory();
}

function loadState() {
  try {
    const raw = localStorage.getItem(SK);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (new Date(s.savedAt).toDateString() !== new Date().toDateString()) {
      state.topics = s.topics || [];
      return false;
    }
    state.mode = s.mode || 'focus';
    state.totalSecs = s.totalSecs || 25*60;
    state.remainSecs = s.remainSecs || 25*60;
    state.running = s.running || false;
    state.pomCount = s.pomCount || 0;
    state.breakCount = s.breakCount || 0;
    state.checkinCount = s.checkinCount || 0;
    state.streak = s.streak || 0;
    state.studySecs = s.studySecs || 0;
    state.topicsDoneCount = s.topicsDoneCount || 0;
    state.sessionNum = s.sessionNum || 1;
    state.topics = s.topics || [];
    state.activeTopicIdx = s.activeTopicIdx !== undefined ? s.activeTopicIdx : -1;
    state.wakeupMins = s.wakeupMins || 10;
    state.dailyGoal = s.dailyGoal || 8;
    state.timerStartedAt = s.timerStartedAt || null;
    state.remainAtStart = s.remainAtStart || 0;
    state.checkinStartedAt = s.checkinStartedAt || null;
    state._studySecsBase = s._studySecsBase || 0;
    if (state.running && state.timerStartedAt) {
      const elapsed = Math.floor((Date.now() - state.timerStartedAt) / 1000);
      state.remainSecs = Math.max(0, state.remainAtStart - elapsed);
      if (isFocusMode()) {
        state.studySecs = state._studySecsBase + Math.min(elapsed, state.remainAtStart);
      }
    }
    return true;
  } catch(e) { return false; }
}

// ══════════════════════════════════════════
//  CLOCK
// ══════════════════════════════════════════
function tickClock() {
  const n = new Date();
  $('topClock').textContent = n.toLocaleTimeString('en-IN', { hour12: false });
  $('topDate').textContent  = n.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });
}

// ══════════════════════════════════════════
//  MODE
// ══════════════════════════════════════════
function setMode(m) {
  if (state.running) return;
  state.mode = m;
  document.querySelectorAll('.pill').forEach((p, i) =>
    p.classList.toggle('active', ['focus','short','long','custom'][i] === m));
  $('customRow').classList.toggle('show', m === 'custom');
  if (m !== 'custom') {
    state.totalSecs = MODES[m].mins * 60;
    state.remainSecs = state.totalSecs;
    updateRing();
    $('timerModeTag').textContent = MODES[m].label;
    $('ringTrack').style.stroke   = MODES[m].color;
    $('timerDigits').style.color  = '#fff';
  }
  updateWidget();
  saveState();
}

function applyCustom() {
  const v = Math.max(1, parseInt($('customMins').value) || 45);
  MODES.custom.mins = v;
  state.totalSecs = v * 60;
  state.remainSecs = state.totalSecs;
  updateRing();
  $('timerModeTag').textContent = 'CUSTOM ' + v + 'M';
  updateWidget();
  saveState();
}

// ══════════════════════════════════════════
//  TIMER
// ══════════════════════════════════════════
function toggleTimer() { state.running ? pause() : start(); }

function _throttledSave() {
  const now = Date.now();
  if (now - state._lastSaveAt >= 5000) {
    try { saveState(); } catch(e) {}
    state._lastSaveAt = now;
  }
}

function _tick() {
  if (!state.running || !state.timerStartedAt) return;
  const now     = Date.now();
  const elapsed = Math.floor((now - state.timerStartedAt) / 1000);
  state.remainSecs = Math.max(0, state.remainAtStart - elapsed);
  if (isFocusMode()) {
    state.studySecs = state._studySecsBase + Math.min(elapsed, state.remainAtStart);
  }
  if (state.remainSecs <= 0) {
    _stopTicker();
    state.running = false;
    state.timerStartedAt = null;
    onEnd();
    return;
  }
  if (state.remainSecs % 60 === 0 && isFocusMode()) playTick();
  if (isFocusMode() && state.checkinStartedAt) {
    const since = (now - state.checkinStartedAt) / 1000 / 60;
    if (since >= state.wakeupMins) {
      state.checkinStartedAt = null;
      _stopTicker();
      showCheckPopup();
      return;
    }
  }
  updateRing(); updateStats();
  _throttledSave();
}

function _startTicker() {
  _stopTicker();
  state.ticker = setInterval(_tick, 500);
}

function _stopTicker() {
  if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
}

function start() {
  if (state.running) return;
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  state.running         = true;
  state.timerStartedAt  = Date.now();
  state.remainAtStart   = state.remainSecs;
  state.checkinStartedAt = Date.now();
  state._studySecsBase  = state.studySecs;
  $('playBtn').textContent = '⏸';
  $('timerWrap').classList.add('running-ring');
  addLog('▶ Started ' + MODES[state.mode].label +
    (state.activeTopicIdx >= 0 ? ' — ' + state.topics[state.activeTopicIdx].name : ''));
  _startTicker();
}

function pause() {
  _stopTicker();
  state.running          = false;
  state.timerStartedAt   = null;
  state.checkinStartedAt = null;
  $('playBtn').textContent = '▶';
  $('timerWrap').classList.remove('running-ring');
  $('ringTrack').style.stroke = MODES[state.mode].color;
  $('timerDigits').style.color = '#fff';
  addLog('⏸ Paused at ' + fmt(state.remainSecs));
  try { saveState(); } catch(e) {}
  updateWidget();
}

function resetTimer() {
  pause();
  state.remainSecs = state.totalSecs;
  updateRing();
  $('timerDigits').style.color = '#fff';
  $('ringTrack').style.stroke  = MODES[state.mode].color;
  try { saveState(); } catch(e) {}
}

function skipTimer() {
  if (state.running && state.timerStartedAt && isFocusMode()) {
    const elapsed = Math.floor((Date.now() - state.timerStartedAt) / 1000);
    state.studySecs = state._studySecsBase + Math.min(elapsed, state.remainAtStart);
  }
  pause();
  state.remainSecs = 0;
  updateRing();
  onEnd();
}

function onEnd() {
  _stopTicker();
  $('playBtn').textContent = '▶';
  $('timerWrap').classList.remove('running-ring');
  playGong();
  if (isFocusMode()) {
    addLog('✅ Pomodoro #' + state.pomCount + ' complete!');
    $('breakPomN').textContent = state.pomCount;
    showBreakPopup();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('🎉 Pomodoro #' + state.pomCount + ' Done!', {
        body: 'Take a break — stretch, water, breathe. 💧',
        icon: 'icon-192.png', tag: 'pomodoro-done', renotify: true,
      });
    }
  } else {
    state.breakCount++;
    addLog('☕ Break over. Back to focus!');
    setMode('focus');
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('💪 Break Over!', {
        body: 'Time to get back to studying!',
        icon: 'icon-192.png', tag: 'break-done', renotify: true,
      });
    }
  }
  updateStats(); updateWidget();
  try { saveState(); } catch(e) {}
  if (typeof window._syncStudyDB === 'function') {
    try { window._syncStudyDB(); } catch(e) {}
  }
}

// ══════════════════════════════════════════
//  VISIBILITY CHANGE
// ══════════════════════════════════════════
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state._lastSaveAt = 0;
    try { saveState(); } catch(e) {}
    return;
  }
  if (!state.running || !state.timerStartedAt) return;
  const now     = Date.now();
  const elapsed = Math.floor((now - state.timerStartedAt) / 1000);
  state.remainSecs = Math.max(0, state.remainAtStart - elapsed);
  if (isFocusMode()) {
    state.studySecs = state._studySecsBase + Math.min(elapsed, state.remainAtStart);
  }
  if (state.remainSecs <= 0) {
    _stopTicker();
    state.running = false;
    state.timerStartedAt = null;
    if (isFocusMode() && elapsed >= state.remainAtStart) addLog('⚡ Session completed while away!');
    onEnd();
    return;
  }
  if (isFocusMode() && state.checkinStartedAt) {
    const since = (now - state.checkinStartedAt) / 1000 / 60;
    if (since >= state.wakeupMins) {
      state.checkinStartedAt = null;
      _stopTicker();
      showCheckPopup();
      return;
    }
  }
  _startTicker();
  updateRing(); updateStats();
});

// ══════════════════════════════════════════
//  RING
// ══════════════════════════════════════════
function updateRing() {
  const pct = state.remainSecs / state.totalSecs;
  $('ringTrack').style.strokeDashoffset = CIRC * (1 - pct);
  $('timerDigits').textContent = fmt(state.remainSecs);
  $('timerSessionInfo').textContent = 'Session #' + state.sessionNum;
  if (state.remainSecs < 60 && isFocusMode() && state.running) {
    $('ringTrack').style.stroke = '#ff3b55';
    $('timerDigits').style.color = '#ff3b55';
  }
}

// ══════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════
function updateStats() {
  const h  = Math.floor(state.studySecs / 3600);
  const m  = Math.floor((state.studySecs % 3600) / 60);
  const gp = Math.min(100, Math.round((state.pomCount / state.dailyGoal) * 100));
  $('sPomodoros').textContent = state.pomCount;
  $('sTime').textContent      = h + 'h ' + m + 'm';
  $('sCheckins').textContent  = state.checkinCount;
  $('sGoal').textContent      = gp + '%';
  $('streakN').textContent    = state.streak;
  $('progFill').style.width   = gp + '%';
  $('progPct').textContent    = state.pomCount + ' / ' + state.dailyGoal;
  $('progGoalLabel').textContent = 'Daily Goal — ' + state.dailyGoal + ' Pomodoros';
}

function setDailyGoal(val) {
  state.dailyGoal = parseInt(val) || 8;
  updateStats(); saveState();
}

// ══════════════════════════════════════════
//  WAKEUP INTERVAL
// ══════════════════════════════════════════
function setWakeupInterval(mins) {
  if (mins === 'custom') {
    $('intervalCustomRow').classList.add('show');
    document.querySelectorAll('.int-pill').forEach((p, i) => p.classList.toggle('active', i === 4));
    return;
  }
  $('intervalCustomRow').classList.remove('show');
  state.wakeupMins = parseInt(mins) || 10;
  document.querySelectorAll('.int-pill').forEach((p, i) =>
    p.classList.toggle('active', ['5','10','15','20'][i] === mins));
  $('intStatus').innerHTML = `Popup every <b>${state.wakeupMins} mins</b> during focus`;
  addLog(`⏰ Wakeup set to ${state.wakeupMins} mins`);
  if (state.running && state.mode === 'focus') state.checkinStartedAt = Date.now();
  saveState();
}

function applyCustomInterval() {
  const v = Math.max(1, Math.min(60, parseInt($('customInterval').value) || 10));
  state.wakeupMins = v;
  $('intStatus').innerHTML = `Popup every <b>${v} mins</b> during focus`;
  $('intervalCustomRow').classList.remove('show');
  $('customInterval').value = '';
  addLog(`⏰ Wakeup set to ${v} mins`);
  if (state.running && state.mode === 'focus') state.checkinStartedAt = Date.now();
  saveState();
}

// ══════════════════════════════════════════
//  POPUPS
// ══════════════════════════════════════════
function showCheckPopup() {
  const msgs = getMsgs(), msg = msgs[Math.floor(Math.random() * msgs.length)];
  $('checkEmoji').textContent = msg.e;
  $('checkMsg').textContent   = msg.m;
  $('checkStreak').textContent = state.streak;
  $('checkOverlay').classList.add('show');
  beep(300);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification('🍅 Still Studying?', {
      body: msg.m, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'checkin', renotify: true,
    });
  }
}

function confirmCheckin() {
  state.streak++; state.checkinCount++;
  $('checkOverlay').classList.remove('show');
  addLog('✓ Check-in #' + state.checkinCount + ' confirmed! Streak: ' + state.streak + ' 🔥');
  updateStats();
  state.remainSecs       = Math.max(1, state.remainSecs);
  state.checkinStartedAt = Date.now();
  state.running          = true;
  state.timerStartedAt   = Date.now();
  state.remainAtStart    = state.remainSecs;
  state._studySecsBase   = state.studySecs;
  $('playBtn').textContent = '⏸';
  $('timerWrap').classList.add('running-ring');
  _startTicker();
  try { saveState(); } catch(e) {}
}

function showBreakPopup() { $('breakOverlay').classList.add('show'); }
function endBreak() {
  $('breakOverlay').classList.remove('show');
  setMode('focus');
  addLog('💪 Break done. Focus mode ready.');
}

// ══════════════════════════════════════════
//  TOPICS
// ══════════════════════════════════════════
function addPresetTopic() {
  const sel = $('presetTopicSelect');
  const val = sel.value;
  if (!val) return;
  if (state.topics.find(t => t.name === val)) { sel.value = ''; return; }
  state.topics.push({ name: val, done: false });
  renderTopics(); addLog('📋 Topic added: ' + val); saveState();
  sel.value = '';
}

function addTopic() {
  const v = $('tInput').value.trim();
  if (!v) return;
  state.topics.push({ name: v, done: false });
  $('tInput').value = '';
  renderTopics(); addLog('📋 Topic added: ' + v); saveState();
}

function renderTopics() {
  const ul = $('topicsList');
  if (state.topics.length === 0) {
    ul.innerHTML = '<div class="topics-empty">No topics yet — add one above!</div>';
    return;
  }
  ul.innerHTML = '';
  state.topics.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 't-item' + (i === state.activeTopicIdx ? ' active' : '') + (t.done ? ' done' : '');
    const dot = document.createElement('div');
    dot.className = 't-dot';
    const nameSpan = document.createElement('span');
    nameSpan.style.flex = '1';
    nameSpan.textContent = t.name;
    nameSpan.addEventListener('click', () => setActiveTopic(i));
    const acts = document.createElement('div');
    acts.className = 't-acts';
    const doneBtn = document.createElement('button');
    doneBtn.className = 't-btn'; doneBtn.title = 'Mark done'; doneBtn.textContent = '✓';
    doneBtn.addEventListener('click', () => toggleDone(i));
    const delBtn = document.createElement('button');
    delBtn.className = 't-btn'; delBtn.title = 'Delete'; delBtn.textContent = '✕';
    delBtn.style.color = 'var(--red)';
    delBtn.addEventListener('click', () => delTopic(i));
    acts.append(doneBtn, delBtn);
    d.append(dot, nameSpan, acts);
    ul.appendChild(d);
  });
}

function setActiveTopic(i) {
  state.activeTopicIdx = i;
  $('topicChipText').textContent = state.topics[i].name;
  renderTopics(); addLog('📖 Studying: ' + state.topics[i].name); saveState();
  switchTab('timer');
}

function toggleDone(i) {
  state.topics[i].done = !state.topics[i].done;
  if (state.topics[i].done) { state.topicsDoneCount++; addLog('✅ Done: ' + state.topics[i].name); }
  renderTopics(); updateStats(); saveState();
}

function delTopic(i) {
  state.topics.splice(i, 1);
  if (state.activeTopicIdx === i) {
    state.activeTopicIdx = -1;
    $('topicChipText').textContent = '— pick a topic from Topics tab —';
  } else if (state.activeTopicIdx > i) {
    state.activeTopicIdx--;
  }
  renderTopics(); saveState();
}

// ══════════════════════════════════════════
//  LOG
// ══════════════════════════════════════════
function addLog(msg) {
  const ul = $('logUl'), n = new Date();
  const t = n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
  const row = document.createElement('div');
  row.className = 'log-row';
  row.innerHTML = `<span class="log-t">${t}</span><span>${msg}</span>`;
  ul.insertBefore(row, ul.firstChild);
  while (ul.children.length > 50) ul.removeChild(ul.lastChild);
}

// ══════════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════════
function getAudioCtx() {
  if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return state.audioCtx;
}

function beep(freq = 440) {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.start(); o.stop(ctx.currentTime + 0.8);
  } catch(e) {}
}

function playGong() {
  try {
    const ctx = getAudioCtx(), now = ctx.currentTime;
    [[180,'sine',0.5,3.5],[520,'sine',0.25,2.0],[860,'triangle',0.12,1.2]].forEach(([freq,type,gain,dur]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + dur);
    });
  } catch(e) {}
}

function playTick() {
  if (!state.tickEnabled) return;
  try {
    const ctx = getAudioCtx();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * Math.exp(-i/(ctx.sampleRate*0.005));
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = 0.06;
    src.connect(g); g.connect(ctx.destination);
    src.start();
  } catch(e) {}
}

// ══════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch(e) { return {}; }
}

function saveHistory() {
  try {
    const history = loadHistory();
    const topicSnap = state.topics.map(t => ({ name: t.name.slice(0,40), done: t.done }));
    history[todayKey()] = { date: todayKey(), pomodoros: state.pomCount, studySecs: state.studySecs, checkins: state.checkinCount, topics: topicSnap };
    const keys = Object.keys(history).sort().slice(-30);
    const trimmed = {};
    keys.forEach(k => trimmed[k] = history[k]);
    const json = JSON.stringify(trimmed);
    const final = json.length > 100000
      ? (() => { const sk = keys.slice(-14), st = {}; sk.forEach(k => st[k]=trimmed[k]); return JSON.stringify(st); })()
      : json;
    localStorage.setItem(HISTORY_KEY, final);
  } catch(e) {}
}

function renderWeekHistory() {
  const history = loadHistory(), today = todayKey();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ key: dateKey(d), date: d, data: history[dateKey(d)] || null });
  }
  let totalPoms = 0, totalS = 0, activeDays = 0;
  days.forEach(d => {
    if (d.data && d.data.pomodoros > 0) { totalPoms += d.data.pomodoros; totalS += d.data.studySecs || 0; activeDays++; }
  });
  const th = Math.floor(totalS/3600), tm = Math.floor((totalS%3600)/60);
  $('wkPomodoros').textContent = totalPoms;
  $('wkHours').textContent     = th > 0 ? `${th}h${tm}m` : `${tm}m`;
  $('wkDays').textContent      = activeDays;
  const maxPoms = Math.max(state.dailyGoal, ...days.map(d => d.data ? d.data.pomodoros : 0), state.pomCount);
  const container = $('weekDaysList');
  container.innerHTML = '';
  days.forEach(d => {
    const isToday  = d.key === today;
    const data     = isToday ? { pomodoros: state.pomCount, studySecs: state.studySecs, checkins: state.checkinCount, topics: state.topics } : d.data;
    const poms     = data ? data.pomodoros : 0;
    const secs     = data ? (data.studySecs || 0) : 0;
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
    const timeStr  = secs > 0 ? (h > 0 ? `${h}h${m}m` : `${m}m`) : '—';
    const barPct   = maxPoms > 0 ? Math.round((poms/maxPoms)*100) : 0;
    const topicsArr = data ? (data.topics || []) : [];
    const doneCount = topicsArr.filter(t => t.done).length;
    const card = document.createElement('div');
    card.className = 'wdc' + (isToday ? ' today' : '');
    card.innerHTML = `
      <div class="wdc-header">
        <div class="wdc-day${isToday?' today':''}">${isToday ? '⚡ TODAY' : DAY_NAMES[d.date.getDay()]}</div>
        <div class="wdc-date">${d.date.getDate()} ${MONTH_NAMES[d.date.getMonth()]}</div>
      </div>
      <div class="wdc-stats">
        <div class="wdc-stat"><div class="wdc-stat-n">${poms}</div><div class="wdc-stat-l">🍅 Poms</div></div>
        <div class="wdc-stat"><div class="wdc-stat-n">${timeStr}</div><div class="wdc-stat-l">⏱ Time</div></div>
        <div class="wdc-stat"><div class="wdc-stat-n">${doneCount}/${topicsArr.length}</div><div class="wdc-stat-l">✅ Topics</div></div>
      </div>
      <div class="wdc-bar-wrap"><div class="wdc-bar-fill" style="width:${barPct}%"></div></div>
      <div class="wdc-topics">${topicsArr.length === 0
        ? '<div class="wdc-empty">No topics added</div>'
        : topicsArr.map(t => `<div class="wdc-tag${t.done?' done':''}">${t.done?'✓ ':''}${esc(t.name)}</div>`).join('')
      }</div>`;
    container.appendChild(card);
  });
}

// ══════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════
function resetAll() {
  if (!confirm("Reset today's stats? Topics will be kept.")) return;
  pause();
  state.pomCount = state.breakCount = state.checkinCount = state.streak =
    state.studySecs = state.topicsDoneCount = 0;
  state.sessionNum = 1; state.remainSecs = state.totalSecs;
  state.timerStartedAt = null; state.checkinStartedAt = null; state._studySecsBase = 0;
  $('ringTrack').style.stroke = MODES[state.mode].color;
  $('timerDigits').style.color = '#fff';
  updateRing(); updateStats(); updateWidget();
  $('logUl').innerHTML = '<div class="log-row"><span class="log-t">--:--</span><span>Reset. Fresh start! 💪</span></div>';
  saveState();
}

function clearHistory() {
  if (!confirm("Clear ALL history? This cannot be undone.")) return;
  try { localStorage.removeItem(HISTORY_KEY); localStorage.removeItem(SK); } catch(e) {}
  pause();
  state.pomCount = state.breakCount = state.checkinCount = state.streak =
    state.studySecs = state.topicsDoneCount = 0;
  state.sessionNum = 1; state.remainSecs = state.totalSecs;
  state.timerStartedAt = null; state.checkinStartedAt = null; state._studySecsBase = 0;
  $('ringTrack').style.stroke = MODES[state.mode].color;
  $('timerDigits').style.color = '#fff';
  updateRing(); updateStats(); updateWidget();
  $('logUl').innerHTML = '<div class="log-row"><span class="log-t">--:--</span><span>All history cleared! 🗑</span></div>';
  saveState();
  alert('All history cleared!');
}

// ══════════════════════════════════════════
//  CHART
// ══════════════════════════════════════════
function switchChart(metric) {
  state.chartMetric = metric;
  $('chartTogglePom').classList.toggle('active', metric === 'pom');
  $('chartToggleHrs').classList.toggle('active', metric === 'hrs');
  drawChart();
}

function switchChartRange(days) {
  state.chartRange = parseInt(days) || 30;
  $('chartToggle7').classList.toggle('active',  days === '7');
  $('chartToggle30').classList.toggle('active', days === '30');
  drawChart();
}

function drawChart() {
  const canvas = $('statsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const history = loadHistory();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = 160;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const days = [], today = todayKey();
  for (let i = state.chartRange - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dateKey(d), isToday = key === today;
    const data = isToday ? { pomodoros: state.pomCount, studySecs: state.studySecs } : (history[key] || { pomodoros: 0, studySecs: 0 });
    const val  = state.chartMetric === 'pom' ? (data.pomodoros||0) : Math.round((data.studySecs||0)/3600*10)/10;
    days.push({ key, val, d, isToday });
  }
  const maxVal = Math.max(1, ...days.map(d=>d.val), state.chartMetric==='pom' ? state.dailyGoal : 8);
  const PAD_L=28, PAD_R=10, PAD_T=10, PAD_B=24;
  const chartW = W-PAD_L-PAD_R, chartH = H-PAD_T-PAD_B;
  const barW = Math.max(2, (chartW / days.length) - 2);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#252640'; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PAD_T + chartH - (chartH/4)*i;
    ctx.beginPath(); ctx.moveTo(PAD_L,y); ctx.lineTo(W-PAD_R,y); ctx.stroke();
    ctx.fillStyle = '#7b7ea8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(state.chartMetric==='pom' ? Math.round(maxVal/4*i) : (maxVal/4*i).toFixed(1), PAD_L-4, y+3);
  }
  const goalVal = state.chartMetric==='pom' ? state.dailyGoal : 8;
  const goalY = PAD_T + chartH - (goalVal/maxVal)*chartH;
  ctx.strokeStyle='rgba(240,180,41,0.35)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(PAD_L,goalY); ctx.lineTo(W-PAD_R,goalY); ctx.stroke();
  ctx.setLineDash([]);
  days.forEach((day, i) => {
    const x    = PAD_L + i*(chartW/days.length) + (chartW/days.length-barW)/2;
    const barH = Math.max(2, (day.val/maxVal)*chartH);
    const y    = PAD_T + chartH - barH;
    ctx.fillStyle = day.val===0?'#1a1b2e': day.isToday?'#f0b429': day.val>=goalVal?'#c98c1e':'#4a3510';
    const r = Math.min(3, barW/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+barW-r,y);
    ctx.quadraticCurveTo(x+barW,y,x+barW,y+r);
    ctx.lineTo(x+barW,y+barH); ctx.lineTo(x,y+barH); ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y); ctx.fill();
    const showEvery = state.chartRange<=7?1:state.chartRange<=14?2:5;
    if (i%showEvery===0 || day.isToday) {
      ctx.fillStyle=day.isToday?'#f0b429':'#7b7ea8'; ctx.font='8px sans-serif'; ctx.textAlign='center';
      ctx.fillText(day.isToday?'Today':String(day.d.getDate()), x+barW/2, H-PAD_B+12);
    }
  });
  const todayDay = days.find(d=>d.isToday);
  if (todayDay && todayDay.val > 0) {
    const i = days.indexOf(todayDay);
    const x = PAD_L + i*(chartW/days.length) + (chartW/days.length)/2;
    const y = PAD_T + chartH - (todayDay.val/maxVal)*chartH - 5;
    ctx.fillStyle='#f0b429'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(state.chartMetric==='pom'?todayDay.val:todayDay.val+'h', x, y);
  }
  const allVals = days.filter(d=>d.val>0);
  if (allVals.length > 0) {
    const best = allVals.reduce((a,b)=>a.val>b.val?a:b);
    const bd = new Date(best.key);
    $('mBestDay').textContent = DAY_NAMES[bd.getDay()];
    $('mAvgPom').textContent  = (allVals.reduce((s,d)=>s+d.val,0)/allVals.length).toFixed(1);
  } else {
    $('mBestDay').textContent = '—'; $('mAvgPom').textContent = '0';
  }
  let bestStreak=0, cur=0;
  days.forEach(d => { d.val>0?(cur++,bestStreak=Math.max(bestStreak,cur)):cur=0; });
  $('mStreak').textContent = bestStreak;
}

function drawHeatmap() {
  const history = loadHistory(), today = todayKey();
  $('heatmapDayLabels').innerHTML = ['S','M','T','W','T','F','S'].map(d=>`<div class="heatmap-day-label">${d}</div>`).join('');
  const grid = $('heatmapGrid');
  grid.innerHTML = '';
  const cells = [];
  for (let i=27; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = dateKey(d), isToday = key===today;
    const data = isToday ? { pomodoros: state.pomCount } : (history[key]||{pomodoros:0});
    cells.push({ key, poms: data.pomodoros||0, isToday, d });
  }
  const maxPoms = Math.max(1, ...cells.map(c=>c.poms));
  cells.forEach(c => {
    const el = document.createElement('div');
    const level = c.poms===0?'': c.poms<maxPoms*0.25?'l1': c.poms<maxPoms*0.5?'l2': c.poms<maxPoms*0.75?'l3':'l4';
    el.className = `heatmap-cell ${level} ${c.isToday?'today-cell':''}`;
    el.title = `${c.d.toDateString()}: ${c.poms} pomodoros`;
    grid.appendChild(el);
  });
}

// ══════════════════════════════════════════
//  EXPORT CSV
// ══════════════════════════════════════════
function exportCSV() {
  const history = loadHistory();
  const keys = Object.keys(history).sort();
  if (keys.length === 0) { alert('No history to export yet!'); return; }
  const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const rows = [['Date','Day','Pomodoros','Study Time (mins)','Check-ins','Topics Done','Topics Total','Topics List']];
  keys.forEach(k => {
    const d = history[k], dt = new Date(k);
    const topicsArr = d.topics || [];
    const done = topicsArr.filter(t=>t.done).length;
    rows.push([k, DAY[dt.getDay()], d.pomodoros||0, Math.round((d.studySecs||0)/60),
      d.checkins||0, done, topicsArr.length, `"${topicsArr.map(t=>(t.done?'✓ ':'')+t.name).join(' | ')}"`]);
  });
  const totalPoms = keys.reduce((s,k)=>s+(history[k].pomodoros||0),0);
  const totalMins = keys.reduce((s,k)=>s+Math.round((history[k].studySecs||0)/60),0);
  rows.push([], ['TOTAL','',totalPoms,totalMins,'','','','']);
  const csv  = rows.map(r=>r.join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `StudyHistory_${state.userName||'User'}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  addLog('📥 History exported as CSV!');
}

// ══════════════════════════════════════════
//  FLOATING WIDGET
// ══════════════════════════════════════════
function updateWidget() {
  const t = $('fwTime'), m = $('fwMode'), b = $('fwBar');
  let displaySecs = state.remainSecs;
  if (state.running && state.timerStartedAt) {
    const elapsed = Math.floor((Date.now() - state.timerStartedAt) / 1000);
    displaySecs = Math.max(0, state.remainAtStart - elapsed);
  }
  const pct = state.totalSecs > 0 ? ((displaySecs / state.totalSecs) * 100).toFixed(1) : 0;
  if (t) t.textContent = fmt(displaySecs);
  if (m) { m.textContent = MODES[state.mode].label; m.style.color = state.running ? 'var(--gold)' : 'var(--muted)'; }
  if (b) b.style.width = pct + '%';
}

function showWidget() {
  state.widgetVisible = true;
  $('floatWidget').classList.add('visible');
  $('widgetToggleBtn').classList.add('hidden');
  updateWidget();
}

function hideWidget() {
  state.widgetVisible = false;
  $('floatWidget').classList.remove('visible');
  $('widgetToggleBtn').classList.remove('hidden');
}

function toggleWidgetMin() {
  state.widgetMinimized = !state.widgetMinimized;
  $('floatWidget').classList.toggle('minimized', state.widgetMinimized);
  $('fwMinBtn').textContent = state.widgetMinimized ? '+' : '–';
  updateWidget();
}

// ══════════════════════════════════════════
//  EVENT DELEGATION — replaces all inline onclick
// ══════════════════════════════════════════
function bindEvents() {
  // Onboarding prep grid
  document.querySelector('.ob-prep-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.ob-prep-btn');
    if (btn) selectPrep(btn, btn.dataset.prep);
  });

  // Onboard submit
  $('obStartBtn')?.addEventListener('click', finishOnboard);
  $('obName')?.addEventListener('keydown', e => { if (e.key === 'Enter') finishOnboard(); });

  // Mode pills
  document.querySelector('.mode-pills')?.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (pill) setMode(pill.dataset.mode);
  });

  // Custom mode apply
  $('applyCustomBtn')?.addEventListener('click', applyCustom);
  $('customMins')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyCustom(); });

  // Timer controls
  $('resetTimerBtn')?.addEventListener('click', resetTimer);
  $('playBtn')?.addEventListener('click', toggleTimer);
  $('skipTimerBtn')?.addEventListener('click', skipTimer);

  // Topic add
  $('addTopicBtn')?.addEventListener('click', addTopic);
  $('tInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') addTopic(); });
  $('presetTopicSelect')?.addEventListener('change', addPresetTopic);

  // Chart toggles
  $('chartTogglePom')?.addEventListener('click', () => switchChart('pom'));
  $('chartToggleHrs')?.addEventListener('click', () => switchChart('hrs'));
  $('chartToggle7')?.addEventListener('click',   () => switchChartRange('7'));
  $('chartToggle30')?.addEventListener('click',  () => switchChartRange('30'));

  // Settings
  $('profileEditBtn')?.addEventListener('click', editProfile);
  $('dailyGoalSelect')?.addEventListener('change', e => setDailyGoal(e.target.value));
  $('tickToggle')?.addEventListener('change', e => { state.tickEnabled = e.target.checked; });
  $('applyIntervalBtn')?.addEventListener('click', applyCustomInterval);
  $('customInterval')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyCustomInterval(); });

  // Interval pills
  document.querySelector('.interval-pills')?.addEventListener('click', e => {
    const pill = e.target.closest('.int-pill');
    if (pill) setWakeupInterval(pill.dataset.mins);
  });

  // Reset / export
  $('exportCsvBtn')?.addEventListener('click', exportCSV);
  $('resetAllBtn')?.addEventListener('click', resetAll);
  $('clearHistoryBtn')?.addEventListener('click', clearHistory);

  // Leaderboard sync button
  $('lbSyncBtn')?.addEventListener('click', () => {
    if (typeof window._syncStudyDB === 'function') window._syncStudyDB().catch(()=>{});
  });

  // Logout
  $('logoutBtn')?.addEventListener('click', async () => {
    if (!confirm('Sign out? Your data is saved in the cloud.')) return;
    try { pause(); } catch(e) {}
    try {
      // Clear local data so next user starts fresh
      localStorage.removeItem(SK);
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } catch(e) {}
    try {
      if (typeof window._authLogout === 'function') await window._authLogout();
    } catch(e) {
      // Force auth screen even if signOut failed
      window._appAuthReady(null);
    }
  });

  // Nav tabs
  document.querySelector('.bottom-nav')?.addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  // Popups
  $('checkCtaBtn')?.addEventListener('click', confirmCheckin);
  $('endBreakBtn')?.addEventListener('click', endBreak);

  // Floating widget buttons
  $('widgetToggleBtn')?.addEventListener('click', showWidget);
  $('fwMinBtn')?.addEventListener('click', toggleWidgetMin);
  $('fwCloseBtn')?.addEventListener('click', hideWidget);

  // Floating widget drag (mouse)
  const fw = $('floatWidget');
  if (fw) {
    fw.addEventListener('mousedown', e => {
      if (e.target.closest('.fw-btn')) return;
      state.widgetDragging = true;
      state.widgetDragOffX = e.clientX - fw.getBoundingClientRect().left;
      state.widgetDragOffY = e.clientY - fw.getBoundingClientRect().top;
      fw.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!state.widgetDragging) return;
      const x = Math.min(Math.max(0, e.clientX - state.widgetDragOffX), window.innerWidth  - fw.offsetWidth);
      const y = Math.min(Math.max(0, e.clientY - state.widgetDragOffY), window.innerHeight - fw.offsetHeight);
      fw.style.right = 'auto'; fw.style.bottom = 'auto';
      fw.style.left = x + 'px'; fw.style.top = y + 'px';
    });
    document.addEventListener('mouseup', () => { state.widgetDragging = false; fw.style.cursor = 'grab'; });
    fw.addEventListener('touchstart', e => {
      if (e.target.closest('.fw-btn')) return;
      const t = e.touches[0];
      state.widgetDragging = true;
      state.widgetDragOffX = t.clientX - fw.getBoundingClientRect().left;
      state.widgetDragOffY = t.clientY - fw.getBoundingClientRect().top;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', e => {
      if (!state.widgetDragging) return;
      const t = e.touches[0];
      const x = Math.min(Math.max(0, t.clientX - state.widgetDragOffX), window.innerWidth  - fw.offsetWidth);
      const y = Math.min(Math.max(0, t.clientY - state.widgetDragOffY), window.innerHeight - fw.offsetHeight);
      fw.style.right = 'auto'; fw.style.bottom = 'auto';
      fw.style.left = x + 'px'; fw.style.top = y + 'px';
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', () => { state.widgetDragging = false; });
  }
}

// ══════════════════════════════════════════
//  RESIZE HANDLER
// ══════════════════════════════════════════
function initResizeHandler() {
  const histTab = $('tab-history'), canvas = $('statsChart');
  if (!histTab || !canvas) return;
  let timer = null;
  const onResize = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (histTab.classList.contains('active')) requestAnimationFrame(() => { drawChart(); drawHeatmap(); });
    }, 150);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(canvas);
  else window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 300));
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
function init() {
  // Set ring dasharray from JS constant
  $('ringTrack').style.strokeDasharray  = CIRC;
  $('ringTrack').style.strokeDashoffset = 0;

  const restored   = loadState();
  const hasProfile = loadProfile();

  if (!hasProfile) {
    $('onboardScreen').classList.remove('hidden');
  } else {
    $('onboardScreen').classList.add('hidden');
    applyUserProfile();
  }

  // Restore mode UI
  document.querySelectorAll('.pill').forEach((p, i) =>
    p.classList.toggle('active', ['focus','short','long','custom'][i] === state.mode));
  $('timerModeTag').textContent   = MODES[state.mode].label;
  $('ringTrack').style.stroke     = MODES[state.mode].color;

  // Restore wakeup UI
  $('intStatus').innerHTML = `Popup every <b>${state.wakeupMins} mins</b> during focus`;
  const STD = ['5','10','15','20'];
  const isStd = STD.includes(String(state.wakeupMins));
  document.querySelectorAll('.int-pill').forEach((p, i) => {
    p.classList.toggle('active', i < 4 ? STD[i] === String(state.wakeupMins) : !isStd);
  });

  // Restore goal UI
  $('dailyGoalSelect').value = String(state.dailyGoal);

  // Restore topics
  renderTopics();
  if (state.activeTopicIdx >= 0 && state.topics[state.activeTopicIdx]) {
    $('topicChipText').textContent = state.topics[state.activeTopicIdx].name;
  }

  // Resume timer
  if (state.running) {
    $('playBtn').textContent = '⏸';
    $('timerWrap').classList.add('running-ring');
    if (!state.checkinStartedAt) state.checkinStartedAt = Date.now();
    _startTicker();
    if (restored) addLog('🔄 Resumed — timer was running!');
  }

  updateRing(); updateStats(); updateWidget();

  // Start clock
  setInterval(tickClock, 1000); tickClock();

  // Widget refresh loop
  setInterval(() => { try { updateWidget(); } catch(e) {} }, 500);

  // Bind all events
  bindEvents();
  initResizeHandler();
}

// ══════════════════════════════════════════
//  AUTH SCREEN
// ══════════════════════════════════════════
let _authMode = 'login';

function bindAuthEvents() {
  const loginTab   = $('authTabLogin');
  const signupTab  = $('authTabSignup');
  const submitBtn  = $('authSubmitBtn');
  const switchLink = $('authSwitchLink');

  function setAuthMode(m) {
    _authMode = m;
    loginTab?.classList.toggle('active',  m === 'login');
    signupTab?.classList.toggle('active', m === 'signup');
    if (submitBtn) submitBtn.textContent  = m === 'login' ? 'Sign In ▶' : 'Create Account ▶';
    if (switchLink) switchLink.textContent = m === 'login' ? 'Create account' : 'Sign in instead';
    const hint = $('authUsernameHint');
    if (hint) hint.style.display = m === 'signup' ? 'block' : 'none';
    if ($('authError')) $('authError').textContent = '';
  }

  loginTab?.addEventListener('click',  () => setAuthMode('login'));
  signupTab?.addEventListener('click', () => setAuthMode('signup'));
  switchLink?.addEventListener('click', () => setAuthMode(_authMode === 'login' ? 'signup' : 'login'));

  async function submitAuth() {
    const username = ($('authUsername').value || '').trim();
    const password = ($('authPassword').value || '');
    const errEl    = $('authError');
    errEl.textContent = '';

    if (!username) { errEl.textContent = '⚠ Enter a username'; return; }
    if (_authMode === 'signup' && username.length < 3) { errEl.textContent = '⚠ Username must be 3+ characters'; return; }
    if (password.length < 6)   { errEl.textContent = '⚠ Password must be 6+ characters'; return; }

    submitBtn.disabled = true;
    submitBtn.textContent = _authMode === 'login' ? 'Signing in…' : 'Creating account…';

    // Wait for firebase-sync to be ready
    let waited = 0;
    while (typeof window._authSignIn !== 'function' && waited < 8000) {
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }
    if (typeof window._authSignIn !== 'function') {
      errEl.textContent = '⚠ Connection error — reload and try again';
      submitBtn.disabled = false;
      setAuthMode(_authMode);
      return;
    }

    try {
      if (_authMode === 'login') {
        await window._authSignIn(username, password);
      } else {
        await window._authSignUp(username, password);
        // Pre-fill name in onboarding
        const obName = $('obName');
        if (obName && !obName.value) obName.value = username;
      }
      // _appAuthReady will be triggered by onAuthStateChanged in firebase-sync
    } catch(e) {
      let msg = e.message || 'Authentication failed';
      if (msg.includes('email-already-in-use'))      msg = '⚠ Username already taken — try another';
      else if (msg.includes('user-not-found'))        msg = '⚠ Username not found — sign up first';
      else if (msg.includes('wrong-password'))        msg = '⚠ Wrong password';
      else if (msg.includes('invalid-credential'))    msg = '⚠ Wrong username or password';
      else if (msg.includes('too-many-requests'))     msg = '⚠ Too many attempts — try again later';
      else if (msg.includes('network-request-failed'))msg = '⚠ No internet connection';
      errEl.textContent = msg;
      submitBtn.disabled = false;
      setAuthMode(_authMode);
    }
  }

  submitBtn?.addEventListener('click', submitAuth);
  $('authPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  $('authUsername')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('authPassword')?.focus(); });
}

// ══════════════════════════════════════════
//  BOOT — auth-gated
// ══════════════════════════════════════════
let _appInited = false;

// Called by firebase-sync.js via onAuthStateChanged
window._appAuthReady = function(user) {
  const authScreen = $('authScreen');
  const appShell   = document.querySelector('.app-shell');
  const onboard    = $('onboardScreen');
  if (!authScreen) return;

  if (user) {
    // Logged in — hide auth screen, show app
    authScreen.classList.add('hidden');
    if (appShell) appShell.style.display = '';
    if (!_appInited) { _appInited = true; init(); }
  } else {
    // Signed out — show auth screen, hide everything else
    authScreen.classList.remove('hidden');
    if (appShell) appShell.style.display = 'none';
    if (onboard)  onboard.classList.add('hidden');
    // Reset auth form
    const un = $('authUsername'), pw = $('authPassword'), err = $('authError');
    if (un)  un.value = '';
    if (pw)  pw.value = '';
    if (err) err.textContent = '';
    const btn = $('authSubmitBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In ▶'; }
  }
};

function boot() {
  // Hide app shell until auth confirmed
  const appShell = document.querySelector('.app-shell');
  if (appShell) appShell.style.display = 'none';
  bindAuthEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

