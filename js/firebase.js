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
var SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzvZLV5g4s2Zr9B5fHwAnTjc8iZv6gxlGV5GGEYy-96J7dpYPXSEkKIwMdsP5hDtVjIdg/exec';

var authReadyPromise = new Promise(function(resolve) {
  var unsub = window.firebase.auth().onAuthStateChanged(function(user) {
    unsub();
    resolve(user);
  });
});

async function ensureAuth() {
  var user = window.firebase.auth().currentUser;
  if (user) return user;
  return await authReadyPromise;
}

/* ============ ORDERS ============ */
async function fetchOrders() {
  await ensureAuth();
  var snap = await db.collection('orders').get();
  var rows = snap.docs.map(function(d) { return { _id: d.id, ...d.data() }; });
  rows.sort(function(a, b) { return (parseInt(a['Sr. No.']) || 0) - (parseInt(b['Sr. No.']) || 0); });
  return { rows: rows };
}

async function addOrder(data, customId) {
  await ensureAuth();
  var sr = data['Sr. No.'] || '0';
  var id = customId || ('order_' + sr);
  await db.collection('orders').doc(id).set({
    ...data,
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  });
  syncToSheet({ ...data, _collection: 'orders', _id: id });
  return id;
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
  rows.sort(function(a, b) { return (parseInt(a['Sr. No.']) || 0) - (parseInt(b['Sr. No.']) || 0); });
  return { rows: rows };
}

async function addTrading(data, customId) {
  await ensureAuth();
  var sr = data['Sr. No.'] || '0';
  var id = customId || ('trade_' + sr);
  await db.collection('trading').doc(id).set({
    ...data,
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  });
  syncToSheet({ ...data, _collection: 'trading', _id: id });
  return id;
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

/* ============ EXPENSES ============ */
async function fetchExpenses() {
  await ensureAuth();
  var snap = await db.collection('expenses').get();
  var rows = snap.docs.map(function(d) { return { _id: d.id, ...d.data() }; });
  rows.sort(function(a, b) { return (parseInt(a['Sr. No.']) || 0) - (parseInt(b['Sr. No.']) || 0); });
  return { rows: rows };
}

async function addExpense(data, customId) {
  await ensureAuth();
  var sr = data['Sr. No.'] || '0';
  var id = customId || ('expense_' + sr);
  await db.collection('expenses').doc(id).set({
    ...data,
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  });
  syncToSheet({ ...data, _collection: 'expenses', _id: id });
  return id;
}

async function updateExpense(id, data) {
  await ensureAuth();
  await db.collection('expenses').doc(id).set({
    ...data,
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  syncToSheet({ ...data, _collection: 'expenses' });
}

async function deleteExpense(id, srNo) {
  await ensureAuth();
  await db.collection('expenses').doc(id).delete();
  syncToSheet({ 'Sr. No.': srNo, _action: 'delete', _collection: 'expenses' });
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

/* ============ SETTINGS ============ */
async function fetchSettings() {
  await ensureAuth();
  var doc = await db.collection('settings').doc('goldRate').get();
  if (doc.exists) return doc.data();
  return { rate: 16000, updatedAt: null };
}

async function saveSettings(rate) {
  await ensureAuth();
  await db.collection('settings').doc('goldRate').set({
    rate: rate,
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
  });
  syncToSheet({ _collection: 'settings', rate: rate });
}

/* ============ EXPOSE GLOBALLY ============ */
window.db = db;
window.fetchOrders = fetchOrders;
window.fetchTrading = fetchTrading;
window.fetchExpenses = fetchExpenses;
window.addOrder = addOrder;
window.updateOrder = updateOrder;
window.deleteOrder = deleteOrder;
window.addTrading = addTrading;
window.updateTrading = updateTrading;
window.deleteTrading = deleteTrading;
window.addExpense = addExpense;
window.updateExpense = updateExpense;
window.deleteExpense = deleteExpense;
window.fetchSettings = fetchSettings;
window.saveSettings = saveSettings;
