/**
 * 🔥 POMODORO TRACKER — firebase-sync.js
 * Powers:
 *   1. User sync to Firestore (called by app.js after each pomodoro)
 *   2. In-app leaderboard tab (live Firestore + Realtime DB listeners)
 *   3. Presence (online/offline) via Realtime Database
 */

import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, onSnapshot, collection, serverTimestamp }
                            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getDatabase, ref, onDisconnect, set, onValue, serverTimestamp as rtServerTimestamp }
                            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

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

// ══ STORAGE KEYS ══
const PROFILE_KEY = 'pomProfile_v2';
const STATE_KEY   = 'pomTracker_v2';
const UID_KEY     = 'pomUserId_v1';

// ── Helpers ──
const getLocal = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch(e) { return {}; } };
const esc = str => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const $  = id => document.getElementById(id);

function getUserId() {
  try {
    let uid = localStorage.getItem(UID_KEY);
    if (!uid) {
      uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'uid_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      localStorage.setItem(UID_KEY, uid);
    }
    return uid;
  } catch(e) {
    const p = getLocal(PROFILE_KEY);
    return ((p.name||'anon')+'_'+(p.prep||'user')).toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,40);
  }
}

// ══════════════════════════════════════════
//  SYNC USER TO FIRESTORE
// ══════════════════════════════════════════
export async function syncUser() {
  const profile = getLocal(PROFILE_KEY);
  const st      = getLocal(STATE_KEY);
  if (!profile.name) return;

  const uid      = getUserId();
  const studyMins= Math.round((st.studySecs||0)/60);
  const running  = st.running||false;
  const mode     = st.mode||'focus';
  const status   = running && (mode==='focus'||mode==='custom') ? 'studying' : running ? 'break' : 'idle';

  try {
    await setDoc(doc(db,'studyUsers',uid), {
      uid, name:profile.name, course:profile.prep||'Unknown',
      pomodoros:st.pomCount||0, studyMins,
      studyHours:parseFloat((studyMins/60).toFixed(1)),
      checkins:st.checkinCount||0, status,
      lastUpdated:serverTimestamp(),
      date:new Date().toISOString().slice(0,10),
    }, { merge:true });
  } catch(e) {
    console.warn('Firestore sync failed:', e.message);
    const w = $('lbConfigWarning');
    if (w) w.style.display = 'block';
  }
}

// ══════════════════════════════════════════
//  PRESENCE
// ══════════════════════════════════════════
export function setupPresence() {
  const profile = getLocal(PROFILE_KEY);
  if (!profile.name) return;
  const uid = getUserId();
  const presRef = ref(rtdb, `presence/${uid}`);
  const connRef = ref(rtdb, '.info/connected');
  onValue(connRef, async snap => {
    if (!snap.val()) return;
    await onDisconnect(presRef).set({ online:false, lastSeen:rtServerTimestamp(), name:profile.name, uid });
    await set(presRef, { online:true, joinedAt:rtServerTimestamp(), name:profile.name, uid });
  });
}

// ══════════════════════════════════════════
//  IN-APP LEADERBOARD
// ══════════════════════════════════════════
let _allUsers  = {};
let _onlineMap = {};
let _listening = false;

function renderLeaderboard() {
  const profile = getLocal(PROFILE_KEY);
  const myUid   = getUserId();
  const users   = Object.values(_allUsers);

  // Merge presence
  users.forEach(u => { u.online = _onlineMap[u.uid]?.online ?? false; });

  // Sort: pomodoros desc, then hours desc
  users.sort((a,b) => b.pomodoros - a.pomodoros || b.studyHours - a.studyHours);

  // Aggregate stats
  const onlineCount   = users.filter(u => u.online).length;
  const studyingCount = users.filter(u => u.status === 'studying').length;
  const totalPoms     = users.reduce((s,u) => s+(u.pomodoros||0), 0);
  const totalHours    = users.reduce((s,u) => s+(u.studyHours||0), 0);

  // Update header counts
  if ($('lbOnlineCount'))    $('lbOnlineCount').textContent    = onlineCount;
  if ($('lbTotalUsers'))     $('lbTotalUsers').textContent     = users.length;
  if ($('lbTotalPoms'))      $('lbTotalPoms').textContent      = totalPoms;
  if ($('lbTotalHours'))     $('lbTotalHours').textContent     = totalHours.toFixed(1)+'h';
  if ($('lbStudyingNow'))    $('lbStudyingNow').textContent    = studyingCount;
  if ($('lbLastUpdated'))    $('lbLastUpdated').textContent    =
    'Updated: ' + new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  // Update my card
  const myUser = users.find(u => u.uid === myUid);
  if (myUser || profile.name) {
    const u = myUser || {};
    if ($('lbMyName'))   $('lbMyName').textContent   = profile.name || '—';
    if ($('lbMyCourse')) $('lbMyCourse').textContent = profile.prep  || '—';
    if ($('lbMyPoms'))   $('lbMyPoms').textContent   = u.pomodoros || 0;
    if ($('lbMyHours'))  $('lbMyHours').textContent  = (u.studyHours||0)+'h';
    const statusEl = $('lbMyStatus');
    if (statusEl) {
      const s = u.status||'idle';
      statusEl.textContent = s==='studying'?'🟢 Studying': s==='break'?'🟡 On Break':'⚫ Idle';
      statusEl.className   = 'lb-status-badge' + (s==='studying'?' studying': s==='break'?' on-break':'');
    }
  }

  // Render table
  const tbody = $('lbTableBody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="lb-empty">No one here yet — complete a Pomodoro to appear! 🍅</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  users.forEach((u, i) => {
    const rank  = i + 1;
    const medal = rank===1?'🥇': rank===2?'🥈': rank===3?'🥉': `#${rank}`;
    const isMe  = u.uid === myUid;
    const s     = u.status || 'idle';
    const badgeCls = s==='studying'?'lb-badge-studying': s==='break'?'lb-badge-break':'lb-badge-idle';
    const badgeTxt = s==='studying'?'🟢 Studying': s==='break'?'🟡 Break':'⚫ Idle';

    const tr = document.createElement('tr');
    tr.className = (u.online?'lb-online':'lb-offline') + (isMe?' lb-me':'');

    tr.innerHTML = `
      <td><div class="lb-rank">${medal}</div></td>
      <td class="lb-name-cell">
        <span class="lb-dot ${u.online?'lb-dot-on':'lb-dot-off'}"></span>
        <span class="lb-name-text">${esc(u.name)}${isMe?' <span style="color:var(--gold);font-size:9px;">(you)</span>':''}</span>
      </td>
      <td><span class="lb-course-tag">${esc(u.course)}</span></td>
      <td><span class="lb-pom-val">${u.pomodoros}</span> 🍅</td>
      <td><span class="lb-hours-val">${u.studyHours}h</span></td>
      <td><span class="lb-badge ${badgeCls}">${badgeTxt}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Start Firestore + RTDB listeners (called when user opens Compete tab)
export function startLeaderboardListeners() {
  if (_listening) { renderLeaderboard(); return; } // already listening
  _listening = true;

  // Firestore live listener
  onSnapshot(collection(db,'studyUsers'), snap => {
    snap.forEach(d => { _allUsers[d.id] = d.data(); });
    renderLeaderboard();
  }, err => {
    console.warn('Firestore listener error:', err.message);
    const w = $('lbConfigWarning');
    if (w) w.style.display = 'block';
  });

  // Realtime DB presence listener
  onValue(ref(rtdb,'presence'), snap => {
    _onlineMap = snap.val() || {};
    renderLeaderboard();
  });
}

// ══ BRIDGE — app.js uses these via window ══
window._syncStudyDB          = syncUser;
window._startLeaderboard     = startLeaderboardListeners;

// ══ AUTO-SYNC every 30s ══
setInterval(() => syncUser().catch(()=>{}), 30000);

// ══ INIT ══
function firebaseInit() {
  setTimeout(() => {
    setupPresence();
    syncUser().catch(()=>{});
  }, 1500);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', firebaseInit);
} else {
  firebaseInit();
}
