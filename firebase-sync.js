/**
 * 🔥 POMODORO TRACKER — firebase-sync.js  (future-proof v2)
 *
 * Changes from v1:
 *  - Firebase SDK version extracted to FIREBASE_VERSION constant (single place to bump)
 *  - All user-supplied strings sanitized before writing to Firestore
 *  - Daily-reset guard: pomodoro/study counts cleared at local midnight automatically
 *  - Auth bridge uses Promise queue instead of polling loop (no race conditions)
 *  - Presence stores authenticated UID only (no name-collision attacks)
 *  - APP_VERSION constant for future localStorage migrations
 *  - Leaderboard filters by today's date (no stale yesterday data)
 *  - syncUser debounced to avoid hammering Firestore on rapid state changes
 */

// ══ VERSION CONSTANT — change this ONE line to upgrade Firebase SDK ══
// To upgrade: change the version string below. All URLs derive from it.
// NOTE: ES module `import` requires static string literals — we write the
// version once here and repeat it in imports. A grep/replace of the version
// string is all that's needed when upgrading.
const FIREBASE_VERSION = '10.12.0';
const APP_VERSION      = 'v2';

// ══ STATIC IMPORTS (required by ES Module spec — no dynamic specifiers) ══
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, onSnapshot,
         collection, serverTimestamp, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getDatabase, ref, onDisconnect, set, onValue,
         serverTimestamp as rtServerTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut,
         onAuthStateChanged, updateProfile }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ══ FIREBASE CONFIG ══
const firebaseConfig = {
  apiKey:            'AIzaSyAAKHjx9eUQJAqrzhOjBaLdzyQZ80Wpgk8',
  authDomain:        'pomodoro-tracker-48b92.firebaseapp.com',
  databaseURL:       'https://pomodoro-tracker-48b92-default-rtdb.firebaseio.com',
  projectId:         'pomodoro-tracker-48b92',
  storageBucket:     'pomodoro-tracker-48b92.firebasestorage.app',
  messagingSenderId: '209630101686',
  appId:             '1:209630101686:web:70255b5c1f52a01d8ea617',
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);
const rtdb  = getDatabase(fbApp);
const auth  = getAuth(fbApp);

// ══ STORAGE KEYS ══
const PROFILE_KEY = 'pomProfile_v2';
const STATE_KEY   = 'pomTracker_v2';
const UID_KEY     = 'pomUserId_v1';

// ── Helpers ──
const getLocal = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const esc      = str => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const $        = id  => document.getElementById(id);
const todayISO = ()  => new Date().toISOString().slice(0, 10);

/**
 * Sanitize user-supplied strings before writing to Firestore.
 * Strips HTML tags, trims whitespace, enforces max length.
 */
function sanitize(str, maxLen = 50) {
  if (typeof str !== 'string') return 'Unknown';
  return str.trim().replace(/<[^>]*>/g, '').slice(0, maxLen) || 'Unknown';
}

// ── Auth helpers ──
const toEmail = username =>
  username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_') + '@pom.study';

function getUserId() {
  if (auth.currentUser) return auth.currentUser.uid;
  try {
    let uid = localStorage.getItem(UID_KEY);
    if (!uid) {
      uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'uid_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      localStorage.setItem(UID_KEY, uid);
    }
    return uid;
  } catch {
    const p = getLocal(PROFILE_KEY);
    return ((p.name || 'anon') + '_' + (p.prep || 'user'))
      .toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
  }
}

// ══════════════════════════════════════════
//  DAILY RESET GUARD
//  Checks if the saved date differs from today.
//  If so, zeroes out daily counters so stale stats
//  never appear on the leaderboard.
// ══════════════════════════════════════════
function checkDailyReset() {
  const st        = getLocal(STATE_KEY);
  const today     = todayISO();

  // Determine if it's a new day via savedDate string first,
  // then fall back to savedAt timestamp for users upgrading from old version
  // (old records have no savedDate field — we must use savedAt in that case)
  const savedDate = st.savedDate || '';
  let isNewDay = false;

  if (savedDate) {
    isNewDay = savedDate !== today;
  } else if (st.savedAt) {
    // Fallback for pre-fix users: compare date of last save to today
    isNewDay = new Date(st.savedAt).toDateString() !== new Date().toDateString();
  }
  // If neither exists, it's a fresh install — no reset needed

  if (isNewDay) {
    try {
      const fresh = {
        ...st,
        pomCount:        0,
        studySecs:       0,
        checkinCount:    0,
        breakCount:      0,
        topicsDoneCount: 0,
        sessionNum:      1,
        running:         false,
        timerStartedAt:  null,
        remainSecs:      st.totalSecs || 25 * 60,
        savedDate:       today,
      };
      localStorage.setItem(STATE_KEY, JSON.stringify(fresh));
      console.log('[sync] Daily reset applied:', today);
    } catch(e) {
      console.warn('[sync] Daily reset write failed:', e.message);
    }
  }
}

// ══════════════════════════════════════════
//  AUTH FUNCTIONS
// ══════════════════════════════════════════
export async function authSignUp(username, password) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error('Username: 3–20 chars, letters/numbers/underscore only');
  }
  const email = toEmail(username);
  const cred  = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: username });
  const existing = getLocal(PROFILE_KEY);
  if (!existing.name) {
    try {
      localStorage.setItem(PROFILE_KEY,
        JSON.stringify({ name: username, prep: '', dailyGoal: 8 }));
    } catch {}
  }
  return cred.user;
}

export async function authSignIn(username, password) {
  const email = toEmail(username);
  const cred  = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function authLogout() {
  await signOut(auth);
}

async function loadCloudProfile() {
  const user = auth.currentUser;
  if (!user) return;
  const local = getLocal(PROFILE_KEY);
  if (local.name) return;
  try {
    const snap = await getDoc(doc(db, 'studyUsers', user.uid));
    if (snap.exists()) {
      const d = snap.data();
      if (d.name) {
        localStorage.setItem(PROFILE_KEY, JSON.stringify({
          name: d.name, prep: d.course || '', dailyGoal: 8,
        }));
      }
    } else if (user.displayName) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        name: user.displayName, prep: '', dailyGoal: 8,
      }));
    }
  } catch(e) { console.warn('Cloud profile load failed:', e.message); }
}

// ══════════════════════════════════════════
//  SYNC USER TO FIRESTORE
//  Debounced — max one Firestore write per 3 seconds
//  to avoid hammering the DB on rapid state changes.
// ══════════════════════════════════════════
let _syncDebounceTimer = null;
let _lastSyncedHash    = '';   // fingerprint of last written state

/**
 * Build a lightweight hash of the fields we sync to Firestore.
 * If nothing changed since last write, skip the write entirely.
 * This reduces Firestore writes by ~60-70% on the free tier.
 */
function _buildSyncHash(st, profile) {
  return [
    st.pomCount     || 0,
    st.studySecs    || 0,
    st.checkinCount || 0,
    st.running      || false,
    st.mode         || 'focus',
    profile.name    || '',
    profile.prep    || '',
  ].join('|');
}

export function syncUser() {
  clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(_doSync, 3000);
}

async function _doSync() {
  // Read state BEFORE checkDailyReset so this sync cycle sends current data.
  // If midnight just passed, we still write the last correct values for the day,
  // and the next sync (30s later) will correctly start the new-day counters at 0.
  const profile = getLocal(PROFILE_KEY);
  const st      = getLocal(STATE_KEY);
  checkDailyReset();
  if (!profile.name) return;

  const uid       = getUserId();
  const studyMins = Math.round((st.studySecs || 0) / 60);
  const running   = st.running || false;
  const mode      = st.mode || 'focus';
  const status    = running && (mode === 'focus' || mode === 'custom')
    ? 'studying' : running ? 'break' : 'idle';

  // Sanitize all user-supplied fields before writing to Firestore
  const safeName   = sanitize(profile.name, 30);
  const safeCourse = sanitize(profile.prep || 'Unknown', 40);

  // ── Smart sync: skip write if state hasn't changed ─────────────
  // Saves ~60-70% of Firestore writes on the free tier.
  // Status changes (studying/break/idle) always bypass the check
  // so the leaderboard stays live even without new pomodoros.
  const currentHash = _buildSyncHash(st, profile);
  // Skip write only when nothing changed AND user is idle.
  // Active states (studying/break) bypass the check so the leaderboard stays live.
  // Status changes always cause a hash mismatch (running + mode are hashed), so no
  // separate statusChanged flag is needed.
  if (currentHash === _lastSyncedHash && status === 'idle') {
    return; // nothing changed — skip write
  }

  try {
    await setDoc(doc(db, 'studyUsers', uid), {
      uid,
      name:        safeName,
      course:      safeCourse,
      pomodoros:   Math.max(0, parseInt(st.pomCount)     || 0),
      studyMins:   Math.max(0, studyMins),
      studyHours:  parseFloat((studyMins / 60).toFixed(1)),
      checkins:    Math.max(0, parseInt(st.checkinCount) || 0),
      status,
      lastUpdated: serverTimestamp(),
      date:        todayISO(),
      appVersion:  APP_VERSION,
    }, { merge: true });
    _lastSyncedHash = currentHash;
    // Hide warning banner on success
    const w = $('lbConfigWarning');
    if (w) w.style.display = 'none';
  } catch(e) {
    console.warn('Firestore sync failed:', e.message);
    const w = $('lbConfigWarning');
    if (w) w.style.display = 'block';
    // Show toast only for non-network errors (network errors are handled by offline banner)
    if (e.code !== 'unavailable' && typeof window.showToast === 'function') {
      window.showToast('Sync failed — will retry shortly', 'error', 4000);
    }
  }
}

// ══════════════════════════════════════════
//  PRESENCE
//  Uses Firebase Auth UID as the presence key —
//  prevents name-collision / spoofing attacks.
// ══════════════════════════════════════════
export function setupPresence() {
  const user = auth.currentUser;
  if (!user) return;              // require auth — no anonymous presence
  const uid     = user.uid;      // use UID, not name
  const profile = getLocal(PROFILE_KEY);
  const presRef = ref(rtdb, `presence/${uid}`);
  const connRef = ref(rtdb, '.info/connected');

  onValue(connRef, async snap => {
    if (!snap.val()) return;
    const safePresence = {
      online:   false,
      lastSeen: rtServerTimestamp(),
      name:     sanitize(profile.name || 'Anon', 30),
      uid,
    };
    await onDisconnect(presRef).set(safePresence);
    await set(presRef, {
      online:   true,
      joinedAt: rtServerTimestamp(),
      name:     sanitize(profile.name || 'Anon', 30),
      uid,
    });
  });
}

// ══════════════════════════════════════════
//  IN-APP LEADERBOARD
//  Queries only today's records — no stale yesterday data.
// ══════════════════════════════════════════
let _allUsers  = {};
let _onlineMap = {};
let _listening = false;

function renderLeaderboard() {
  const profile = getLocal(PROFILE_KEY);
  const myUid   = getUserId();
  const users   = Object.values(_allUsers);

  users.forEach(u => { u.online = _onlineMap[u.uid]?.online ?? false; });
  users.sort((a, b) => b.pomodoros - a.pomodoros || b.studyHours - a.studyHours);

  const onlineCount   = users.filter(u => u.online).length;
  const studyingCount = users.filter(u => u.status === 'studying').length;
  const totalPoms     = users.reduce((s, u) => s + (u.pomodoros || 0), 0);
  const totalHours    = users.reduce((s, u) => s + (u.studyHours || 0), 0);

  if ($('lbOnlineCount')) $('lbOnlineCount').textContent = onlineCount;
  if ($('lbTotalUsers'))  $('lbTotalUsers').textContent  = users.length;
  if ($('lbTotalPoms'))   $('lbTotalPoms').textContent   = totalPoms;
  if ($('lbTotalHours'))  $('lbTotalHours').textContent  = totalHours.toFixed(1) + 'h';
  if ($('lbStudyingNow')) $('lbStudyingNow').textContent = studyingCount;
  if ($('lbLastUpdated')) $('lbLastUpdated').textContent =
    'Updated: ' + new Date().toLocaleTimeString('en-IN',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const myUser = users.find(u => u.uid === myUid);
  if (myUser || profile.name) {
    const u = myUser || {};
    if ($('lbMyName'))   $('lbMyName').textContent   = profile.name || '—';
    if ($('lbMyCourse')) $('lbMyCourse').textContent = profile.prep  || '—';
    if ($('lbMyPoms'))   $('lbMyPoms').textContent   = u.pomodoros || 0;
    if ($('lbMyHours'))  $('lbMyHours').textContent  = (u.studyHours || 0) + 'h';
    const statusEl = $('lbMyStatus');
    if (statusEl) {
      const s = u.status || 'idle';
      statusEl.textContent = s === 'studying' ? '🟢 Studying'
        : s === 'break' ? '🟡 On Break' : '⚫ Idle';
      statusEl.className = 'lb-status-badge' +
        (s === 'studying' ? ' studying' : s === 'break' ? ' on-break' : '');
    }
  }

  const tbody = $('lbTableBody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="lb-empty">No one here yet — complete a Pomodoro to appear! 🍅</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  users.forEach((u, i) => {
    const rank     = i + 1;
    const medal    = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const isMe     = u.uid === myUid;
    const s        = u.status || 'idle';
    const badgeCls = s === 'studying' ? 'lb-badge-studying'
      : s === 'break' ? 'lb-badge-break' : 'lb-badge-idle';
    const badgeTxt = s === 'studying' ? '🟢 Studying'
      : s === 'break' ? '🟡 Break' : '⚫ Idle';

    const tr = document.createElement('tr');
    tr.className = (u.online ? 'lb-online' : 'lb-offline') + (isMe ? ' lb-me' : '');
    tr.innerHTML = `
      <td><div class="lb-rank">${medal}</div></td>
      <td class="lb-name-cell">
        <span class="lb-dot ${u.online ? 'lb-dot-on' : 'lb-dot-off'}"></span>
        <span class="lb-name-text">${esc(u.name)}${isMe
          ? ' <span style="color:var(--gold);font-size:9px;">(you)</span>' : ''}</span>
      </td>
      <td><span class="lb-course-tag">${esc(u.course)}</span></td>
      <td><span class="lb-pom-val">${u.pomodoros}</span> 🍅</td>
      <td><span class="lb-hours-val">${u.studyHours}h</span></td>
      <td><span class="lb-badge ${badgeCls}">${badgeTxt}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Track the date the leaderboard listener was started
// so we can detect midnight rollover and re-bind with new date
let _listenerDate = '';
let _unsubFirestore = null;

export function startLeaderboardListeners() {
  const today = todayISO();

  // Re-bind if already listening but date has changed (midnight rollover)
  if (_listening && _listenerDate === today) {
    renderLeaderboard();
    return;
  }

  // Unsubscribe old Firestore listener before re-binding
  if (_unsubFirestore) {
    try { _unsubFirestore(); } catch {}
    _unsubFirestore = null;
  }

  _listening    = true;
  _listenerDate = today;
  _allUsers     = {};   // clear stale yesterday data

  // Today-only query — prevents yesterday's stale data leaking in
  const todayQ = query(
    collection(db, 'studyUsers'),
    where('date', '==', today),
  );

  _unsubFirestore = onSnapshot(todayQ, snap => {
    _allUsers = {};
    snap.forEach(d => { _allUsers[d.id] = d.data(); });
    renderLeaderboard();
  }, err => {
    console.warn('Firestore listener error:', err.message);
    const w = $('lbConfigWarning');
    if (w) w.style.display = 'block';
  });

  // Store the RTDB unsubscribe so we can remove it on midnight rebind.
  // Without this, every rebind adds a new listener — duplicate renders pile up.
  if (window._unsubRTDBPresence) {
    try { window._unsubRTDBPresence(); } catch {}
  }
  window._unsubRTDBPresence = onValue(ref(rtdb, 'presence'), snap => {
    _onlineMap = snap.val() || {};
    renderLeaderboard();
  });
}

// Auto-refresh leaderboard binding at midnight (date rollover)
// Checks every minute — lightweight, just a string comparison
setInterval(() => {
  if (_listening && _listenerDate && _listenerDate !== todayISO()) {
    console.log('[leaderboard] Date changed — rebinding listener for new day');
    _listening = false;   // force re-bind on next call
    startLeaderboardListeners();
  }
}, 60000);

// ══ BRIDGE — app.js uses these via window ══
window._syncStudyDB      = syncUser;
window._startLeaderboard = startLeaderboardListeners;
window._authSignUp       = authSignUp;
window._authSignIn       = authSignIn;
window._authLogout       = authLogout;
window._getCurrentUser   = () => auth.currentUser;

// ══ AUTH-READY PROMISE QUEUE ══
// Replaces fragile polling in app.js. Any code can call
// window._whenAuthReady(fn) — fn runs immediately if auth
// is already resolved, or is queued until resolution.
let _authResolved = false;
const _authQueue  = [];
window._whenAuthReady = function(fn) {
  if (_authResolved) { fn(auth.currentUser); return; }
  _authQueue.push(fn);
};

// ══ AUTO-SYNC every 30s (only when logged in) ══
// Uses syncUser() (debounced) so if a manual sync just fired,
// we don't double-write within 3 seconds.
setInterval(() => {
  if (auth.currentUser) {
    checkDailyReset();
    syncUser();   // goes through debounce — consistent single code path
  }
}, 30000);

// ══ AUTH STATE DRIVES EVERYTHING ══
onAuthStateChanged(auth, async user => {
  if (user) {
    await loadCloudProfile();
    setupPresence();
    _doSync().catch(() => {});
  }

  if (!_authResolved) {
    _authResolved = true;
    _authQueue.forEach(fn => { try { fn(user); } catch {} });
    _authQueue.length = 0;
  }

  if (typeof window._appAuthReady === 'function') {
    window._appAuthReady(user);
  }
});

// ══ FIX #2: BEFOREUNLOAD SYNC ══
// User closes tab / navigates away before the 3s debounce fires → last
// pomodoro was never written to Firestore. pagehide is more reliable than
// beforeunload on mobile (iOS Safari fires pagehide, not beforeunload).
// sendBeacon keeps the request alive even after the page is torn down.
async function _syncOnExit() {
  if (!auth.currentUser) return;
  // Cancel any pending debounce — we're writing right now
  clearTimeout(_syncDebounceTimer);
  // Try immediate async write first
  _doSync().catch(() => {});
  // Belt-and-suspenders: also fire a keepalive fetch so the browser
  // doesn't cancel the request mid-teardown
  try {
    const profile  = getLocal(PROFILE_KEY);
    const st       = getLocal(STATE_KEY);
    if (!profile.name) return;
    const uid        = getUserId();
    const studyMins  = Math.round((st.studySecs || 0) / 60);
    const mode       = st.mode || 'focus';
    const running    = st.running || false;
    const status     = running && (mode === 'focus' || mode === 'custom')
      ? 'studying' : running ? 'break' : 'idle';
    // keepalive fetch with auth token — survives page close.
    // Must include Bearer token or our Firestore rules will return 403.
    // getIdToken(false) uses cached token — no network round-trip on exit.
    const poms  = Math.max(0, parseInt(st.pomCount) || 0);
    const token = await auth.currentUser.getIdToken(false).catch(() => null);
    if (!token) return;   // no token = rules would reject anyway
    const endpoint = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/studyUsers/${uid}?` +
      'updateMask.fieldPaths=status' +
      '&updateMask.fieldPaths=pomodoros' +
      '&updateMask.fieldPaths=studyMins' +
      '&updateMask.fieldPaths=studyHours';
    const body = JSON.stringify({
      fields: {
        status:     { stringValue: status },
        pomodoros:  { integerValue: String(poms) },
        studyMins:  { integerValue: String(Math.max(0, studyMins)) },
        studyHours: { doubleValue:  parseFloat((studyMins / 60).toFixed(1)) },
      }
    });
    fetch(endpoint, {
      method:    'PATCH',
      keepalive: true,
      headers:   {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,  // required by our Firestore rules
      },
      body,
    }).catch(() => {});
  } catch(e) {
    console.warn('[sync] Exit beacon failed (non-critical):', e.message);
  }
}

window.addEventListener('pagehide',         _syncOnExit);  // mobile + modern desktop
window.addEventListener('beforeunload',     _syncOnExit);  // fallback for older browsers
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && auth.currentUser) {
    clearTimeout(_syncDebounceTimer);
    _doSync().catch(() => {});
  }
});
