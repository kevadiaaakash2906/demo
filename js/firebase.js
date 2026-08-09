/* ============================================
   VINÉRE — Firebase + Sheet Sync
   ============================================ */

var firebaseConfig = {
  apiKey: "AIzaSyC3GlUHfz6Zfd1o5eymGcY_jkyz4MuVfls",
  authDomain: "vinereledger-b29be.firebaseapp.com",
  databaseURL: "https://vinereledger-b29be-default-rtdb.firebaseio.com",
  projectId: "vinereledger-b29be",
  storageBucket: "vinereledger-b29be.firebasestorage.app",
  messagingSenderId: "701394930039",
  appId: "1:701394930039:web:456e7ae9c61fc92402b972",
  measurementId: "G-HQN3J4LGXE"
};

// Initialize Firebase (safe if already initialized)
try {
  window.firebase.initializeApp(firebaseConfig);
} catch (e) {
  if (e.message && e.message.indexOf('already exists') > -1) {
    console.log('Firebase already initialized');
  } else {
    console.error('Firebase init error:', e);
  }
}

var db = window.firebase.firestore();

var SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx9yEy0j0EHMegp_tzHX5-Q1xSuLHsp6Em98fLIg8wp9hbzIVbkTHeWhkWzZHgLE9RAYw/exec';

/* Wait for Firebase Auth to be ready (session restored from disk) */
var authReadyPromise = new Promise(function(resolve) {
  var unsub = window.firebase.auth().onAuthStateChanged(function(user) {
    unsub();
    resolve(user);
  });
});

async function ensureAuth() {
  var user = window.firebase.auth().currentUser;
  if (user) return user;
  // If not immediately available, wait for the initial state to resolve
  return await authReadyPromise;
}

/* ============ ORDERS ============ */
async function fetchOrders() {
  await ensureAuth();
  var snap = await db.collection('orders').get();
  var rows = snap.docs.map(function(d) { return { _id: d.id, ...d.data() }; });
  rows.sort(function(a, b) {
    return (parseInt(a['Sr. No.']) || 0) - (parseInt(b['Sr. No.']) || 0);
  });
  return { rows: rows };
}

async function addOrder(data) {
  await ensureAuth();
  var ref = db.collection('orders').doc();
  await ref.set({
    ...data,
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  });
  syncToSheet({ ...data, _collection: 'orders' });
  return ref.id;
}

async function updateOrder(id, data) {
  await ensureAuth();
  await db.collection('orders').doc(id).set({
    ...data,
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  syncToSheet({ ...data, _collection: 'orders' });
}

async function deleteOrder(id, srNo) {
  await ensureAuth();
  await db.collection('orders').doc(id).delete();
  syncToSheet({ 'Sr. No.': srNo, _action: 'delete', _collection: 'orders' });
}

/* ============ TRADING ============ */
async function fetchTrading() {
  await ensureAuth();
  var snap = await db.collection('trading').get();
  var rows = snap.docs.map(function(d) { return { _id: d.id, ...d.data() }; });
  rows.sort(function(a, b) {
    return (parseInt(a['Sr. No.']) || 0) - (parseInt(b['Sr. No.']) || 0);
  });
  return { rows: rows };
}

async function addTrading(data) {
  await ensureAuth();
  var ref = db.collection('trading').doc();
  await ref.set({
    ...data,
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  });
  syncToSheet({ ...data, _collection: 'trading' });
  return ref.id;
}

async function updateTrading(id, data) {
  await ensureAuth();
  await db.collection('trading').doc(id).set({
    ...data,
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  syncToSheet({ ...data, _collection: 'trading' });
}

async function deleteTrading(id, srNo) {
  await ensureAuth();
  await db.collection('trading').doc(id).delete();
  syncToSheet({ 'Sr. No.': srNo, _action: 'delete', _collection: 'trading' });
}

/* ============ SHEET SYNC ============ */
function syncToSheet(payload) {
  var url = SHEET_WEBHOOK_URL + '?secret=vinere-sync-2026';
  fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  })
  .then(function() {
    if (window.showToast) showToast('Synced to Google Sheet', 'success', 2500);
  })
  .catch(function(err) {
    if (window.showToast) showToast('Sheet sync failed', 'error', 4000);
    console.error('Sync failed', err);
  });
}

/* ============ EXPOSE GLOBALLY ============ */
window.db = db;
window.fetchOrders = fetchOrders;
window.fetchTrading = fetchTrading;
window.addOrder = addOrder;
window.updateOrder = updateOrder;
window.deleteOrder = deleteOrder;
window.addTrading = addTrading;
window.updateTrading = updateTrading;
window.deleteTrading = deleteTrading;
