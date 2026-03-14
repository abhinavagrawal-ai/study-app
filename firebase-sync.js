/**
 * 🔥 POMODORO TRACKER — firebase-sync.js
 * Firebase Firestore + Realtime Database sync module
 * Writes study data to live leaderboard on every pomodoro
 */

import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, serverTimestamp }
                            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getDatabase, ref, onDisconnect, set, onValue, serverTimestamp as rtServerTimestamp }
                            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ══ CONFIG ══
const firebaseConfig = {
  apiKey:            'AIzaSyAAKHjx9eUQJAqrzhOjBaLdzyQZ80Wpgk8',
  authDomain:        'pomodoro-tracker-48b92.firebaseapp.com',
  databaseURL:       'https://pomodoro-tracker-48b92-default-rtdb.firebaseio.com',
  projectId:         'pomodoro-tracker-48b92',
  storageBucket:     'pomodoro-tracker-48b92.firebasestorage.app',
  messagingSenderId: '209630101686',
  appId:             '1:209630101686:web:70255b5c1f52a01d8ea617',
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const rtdb = getDatabase(app);

const PROFILE_KEY = 'pomProfile_v2';
const STATE_KEY   = 'pomTracker_v2';
const UID_KEY     = 'pomUserId_v1';

// ── Helpers ──
function getLocalProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch(e) { return {}; }
}
function getLocalState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch(e) { return {}; }
}

// Persistent UUID — stable, safe, survives name/prep changes
function getUserId() {
  try {
    let uid = localStorage.getItem(UID_KEY);
    if (!uid) {
      uid = crypto.randomUUID
        ? crypto.randomUUID()
        : ('uid_' + Date.now() + '_' + Math.random().toString(36).slice(2));
      localStorage.setItem(UID_KEY, uid);
    }
    return uid;
  } catch(e) {
    const p = getLocalProfile();
    return ((p.name || 'anon') + '_' + (p.prep || 'user'))
      .toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
  }
}

// ── WRITE USER RECORD TO FIRESTORE ──
export async function syncUser() {
  const profile = getLocalProfile();
  const st      = getLocalState();
  if (!profile.name) return;

  const uid       = getUserId();
  const studyMins = Math.round((st.studySecs || 0) / 60);

  let status = 'idle';
  if (st.running && st.mode === 'focus')   status = 'studying';
  else if (st.running && st.mode !== 'focus') status = 'break';

  const record = {
    uid,
    name:        profile.name,
    course:      profile.prep      || 'Unknown',
    pomodoros:   st.pomCount       || 0,
    studyMins,
    studyHours:  parseFloat((studyMins / 60).toFixed(1)),
    checkins:    st.checkinCount   || 0,
    status,
    lastUpdated: serverTimestamp(),
    date:        new Date().toISOString().slice(0, 10),
  };

  try {
    await setDoc(doc(db, 'studyUsers', uid), record, { merge: true });
    console.log('🔥 Firebase synced:', record.name, '| Poms:', record.pomodoros);
  } catch(e) {
    console.warn('Firestore write failed:', e.message);
  }
}

// ── PRESENCE via Realtime Database ──
export function setupPresence() {
  const profile = getLocalProfile();
  if (!profile.name) return;
  const uid = getUserId();

  const presenceRef = ref(rtdb, `presence/${uid}`);
  const connRef     = ref(rtdb, '.info/connected');

  onValue(connRef, async snap => {
    if (!snap.val()) return;
    await onDisconnect(presenceRef).set({
      online: false, lastSeen: rtServerTimestamp(), name: profile.name, uid,
    });
    await set(presenceRef, {
      online: true, joinedAt: rtServerTimestamp(), name: profile.name, uid,
    });
  });
}

// ── Expose to main app (non-module scripts need window bridge) ──
window._syncStudyDB = syncUser;

// ── Auto-sync every 30s ──
setInterval(() => syncUser().catch(() => {}), 30000);

// ── Init on load ──
function firebaseInit() {
  setTimeout(() => {
    setupPresence();
    syncUser().catch(() => {});
  }, 1500);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', firebaseInit);
} else {
  firebaseInit();
}
