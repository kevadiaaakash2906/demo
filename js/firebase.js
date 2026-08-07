// ============================================================
// firebase.js — Firebase Auth + Firestore + Google Sheets sync
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc,
  query, serverTimestamp, writeBatch, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC3GlUHfz6Zfd1o5eymGcY_jkyz4MuVfls",
  authDomain: "vinereledger-b29be.firebaseapp.com",
  projectId: "vinereledger-b29be",
  storageBucket: "vinereledger-b29be.firebasestorage.app",
  messagingSenderId: "701394930039",
  appId: "1:701394930039:web:456e7ae9c61fc92402b972",
  measurementId: "G-HQN3J4LGXE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ============ GOOGLE SHEETS SYNC ============
const SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzPem4TyigRtYCQUkFbceO7AswIjl3FX2C9D6K8GN1vqbcFSG_ZAu6xBrfIwqHCjAOL-Q/exec';
const SHEET_SECRET = 'vinere-sync-2026';

async function syncToSheet(data) {
  if (!SHEET_WEBHOOK_URL || SHEET_WEBHOOK_URL === 'PASTE_NEW_URL_HERE') {
    console.warn('[SheetSync] Webhook URL not set');
    return;
  }
  try {
    const url = SHEET_WEBHOOK_URL + '?secret=' + encodeURIComponent(SHEET_SECRET);
    console.log('[SheetSync] Sending to Sheet...');
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    });
    console.log('[SheetSync] Sent (check your Sheet in 2 seconds)');
  } catch (err) {
    console.error('[SheetSync] Error:', err.message);
  }
}

// ============ AUTH ============
const PASS_MAP = {
  'Arp&diam4265': { email: 'staff@vinere.local', role: 'staff' },
  'Het&ke4265':   { email: 'seller@vinere.local', role: 'seller' },
  'qwertyuiop':   { email: 'customer@vinere.local', role: 'customer' }
};

const EMAIL_TO_ROLE = {
  'staff@vinere.local': 'staff',
  'seller@vinere.local': 'seller',
  'customer@vinere.local': 'customer'
};

async function login(pass) {
  const cred = PASS_MAP[pass];
  if (!cred) throw new Error('Wrong password');
  const userCred = await signInWithEmailAndPassword(auth, cred.email, pass);
  return { ok: true, role: cred.role };
}

function logout() { return signOut(auth); }
function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }

// ============ ORDERS ============
const ordersCol = collection(db, 'orders');

async function fetchOrders() {
  const snap = await getDocs(ordersCol);
  const rows = [];
  snap.forEach(d => {
    const data = d.data();
    const row = { _id: d.id, _row: d.id, ...data };
    if (row['Date'] && row['Date'].toDate) row['Date'] = row['Date'].toDate().toISOString().split('T')[0];
    if (row['Date Sold'] && row['Date Sold'].toDate) row['Date Sold'] = row['Date Sold'].toDate().toISOString().split('T')[0];
    if (row.createdAt && row.createdAt.toDate) row.createdAt = row.createdAt.toDate().toISOString();
    rows.push(row);
  });
  rows.sort((a, b) => (parseInt(a['Sr. No.']) || 0) - (parseInt(b['Sr. No.']) || 0));
  return { ok: true, rows };
}

async function addOrder(fields) {
  const snap = await getDocs(ordersCol);
  let nextSr = 1;
  snap.forEach(d => {
    const sr = parseInt(d.data()['Sr. No.']);
    if (!isNaN(sr) && sr >= nextSr) nextSr = sr + 1;
  });
  const docRef = await addDoc(ordersCol, {
    ...fields,
    'Sr. No.': nextSr,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  syncToSheet({ ...fields, 'Sr. No.': nextSr, _collection: 'orders' });
  return { ok: true, id: docRef.id, srNo: nextSr };
}

async function updateOrder(id, fields) {
  await setDoc(doc(db, 'orders', id), {
    ...fields,
    updatedAt: serverTimestamp()
  }, { merge: true });
  syncToSheet({ ...fields, _collection: 'orders' });
  return { ok: true };
}

async function deleteOrder(id, srNo) {
  await deleteDoc(doc(db, 'orders', id));
  if (srNo) {
    syncToSheet({ 'Sr. No.': srNo, _collection: 'orders', _action: 'delete' });
  }
  return { ok: true };
}

// ============ TRADING ============
const tradingCol = collection(db, 'trading');

async function fetchTrading() {
  const snap = await getDocs(tradingCol);
  const rows = [];
  snap.forEach(d => {
    const data = d.data();
    const row = { _id: d.id, _row: d.id, ...data };
    if (row['Date'] && row['Date'].toDate) row['Date'] = row['Date'].toDate().toISOString().split('T')[0];
    if (row['Date Sold'] && row['Date Sold'].toDate) row['Date Sold'] = row['Date Sold'].toDate().toISOString().split('T')[0];
    rows.push(row);
  });
  rows.sort((a, b) => (parseInt(a['Sr. No.']) || 0) - (parseInt(b['Sr. No.']) || 0));
  return { ok: true, rows };
}

async function addTrading(fields) {
  const snap = await getDocs(tradingCol);
  let nextSr = 1;
  snap.forEach(d => {
    const sr = parseInt(d.data()['Sr. No.']);
    if (!isNaN(sr) && sr >= nextSr) nextSr = sr + 1;
  });
  const docRef = await addDoc(tradingCol, {
    ...fields,
    'Sr. No.': nextSr,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  syncToSheet({ ...fields, 'Sr. No.': nextSr, _collection: 'trading' });
  return { ok: true, id: docRef.id, srNo: nextSr };
}

async function updateTrading(id, fields) {
  await setDoc(doc(db, 'trading', id), {
    ...fields,
    updatedAt: serverTimestamp()
  }, { merge: true });
  syncToSheet({ ...fields, _collection: 'trading' });
  return { ok: true };
}

async function deleteTrading(id, srNo) {
  await deleteDoc(doc(db, 'trading', id));
  if (srNo) {
    syncToSheet({ 'Sr. No.': srNo, _collection: 'trading', _action: 'delete' });
  }
  return { ok: true };
}

// ============ MEMO SYNC & RESTORE ============
async function syncMemoPayments(memoNo, paymentLog, amountPaid, balanceDue, paymentStatus) {
  if (!memoNo) return;
  const q = query(ordersCol, where('Memo No.', '==', memoNo));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach(d => {
    batch.set(doc(db, 'orders', d.id), {
      'Payment Log': paymentLog,
      'Amount Paid': amountPaid,
      'Balance Due': balanceDue,
      'Payment Status': paymentStatus,
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
}

async function restoreOrder(id, data) {
  await setDoc(doc(db, 'orders', id), data);
  return { ok: true };
}

async function migrateOrders(ordersArray) {
  const batch = writeBatch(db);
  ordersArray.forEach((o, i) => {
    const ref = doc(ordersCol, `order_${i + 1}`);
    batch.set(ref, { ...o, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await batch.commit();
  console.log('Migrated', ordersArray.length, 'orders');
}

// Expose to window
Object.assign(window, {
  login, logout, onAuthChange,
  fetchOrders, addOrder, updateOrder, deleteOrder,
  fetchTrading, addTrading, updateTrading, deleteTrading,
  syncMemoPayments, restoreOrder, migrateOrders
});
// TEMPORARY: expose for one-time migration
Object.assign(window, { db, writeBatch, doc, collection, serverTimestamp });
