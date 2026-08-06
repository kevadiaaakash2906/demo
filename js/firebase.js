// ============================================================
// firebase.js — Firebase Auth + Firestore backend
// Replaces api.js and the entire Google Apps Script backend
//
// SECURITY NOTE: The Firebase config below is hardcoded for this
// deployment. If you make this repo public, move these values to
// environment variables or a separate config file that is git-ignored.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, serverTimestamp, writeBatch, setDoc, where
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

// Map your existing passwords to Firebase Auth emails
const PASS_MAP = {
  'Arp&diam4265': { email: 'staff@vinere.local', role: 'staff' },
  'Het&ke4265':   { email: 'seller@vinere.local', role: 'seller' },
  'qwertyuiop':   { email: 'customer@vinere.local', role: 'customer' }
};

// Reverse lookup for display
const EMAIL_TO_ROLE = {
  'staff@vinere.local': 'staff',
  'seller@vinere.local': 'seller',
  'customer@vinere.local': 'customer'
};

// ---------- AUTH ----------
async function login(pass) {
  const cred = PASS_MAP[pass];
  if (!cred) throw new Error('Wrong password');
  const userCred = await signInWithEmailAndPassword(auth, cred.email, pass);
  return { ok: true, role: cred.role };
}

function logout() { return signOut(auth); }

function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }

// ---------- ORDERS ----------
const ordersCol = collection(db, 'orders');

async function fetchOrders() {
  // NOTE: We do NOT use Firestore orderBy here because field names like
  // 'Sr. No.' contain dots/spaces which Firestore interprets as path
  // separators. Instead we fetch all docs and sort in JS.
  const snap = await getDocs(ordersCol);
  const rows = [];
  snap.forEach(d => {
    const data = d.data();
    const row = { _id: d.id, _row: d.id, ...data };
    // Convert Firestore Timestamps to strings for your existing UI
    if (row['Date'] && row['Date'].toDate) row['Date'] = row['Date'].toDate().toISOString().split('T')[0];
    if (row['Date Sold'] && row['Date Sold'].toDate) row['Date Sold'] = row['Date Sold'].toDate().toISOString().split('T')[0];
    if (row.createdAt && row.createdAt.toDate) row.createdAt = row.createdAt.toDate().toISOString();
    rows.push(row);
  });
  // Sort by Sr. No. in JavaScript (avoids Firestore FieldPath issues)
  rows.sort((a, b) => (parseInt(a['Sr. No.']) || 0) - (parseInt(b['Sr. No.']) || 0));
  return { ok: true, rows };
}

async function addOrder(fields) {
  // Compute next Sr. No. locally
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
  return { ok: true, id: docRef.id, srNo: nextSr };
}

async function updateOrder(id, fields) {
  await updateDoc(doc(db, 'orders', id), {
    ...fields,
    updatedAt: serverTimestamp()
  });
  return { ok: true };
}

async function deleteOrder(id) {
  await deleteDoc(doc(db, 'orders', id));
  return { ok: true };
}

// ---------- MEMO SYNC ----------
async function syncMemoPayments(memoNo, paymentLog, amountPaid, balanceDue, paymentStatus) {
  if (!memoNo) return;
  const q = query(ordersCol, where('Memo No.', '==', memoNo));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach(d => {
    batch.update(doc(db, 'orders', d.id), {
      'Payment Log': paymentLog,
      'Amount Paid': amountPaid,
      'Balance Due': balanceDue,
      'Payment Status': paymentStatus,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
}

async function restoreOrder(id, data) {
  await setDoc(doc(db, 'orders', id), data);
  return { ok: true };
}

// ---------- MIGRATION (one-time use) ----------
async function migrateOrders(ordersArray) {
  const batch = writeBatch(db);
  ordersArray.forEach((o, i) => {
    const ref = doc(ordersCol, `order_${i + 1}`);
    batch.set(ref, { ...o, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await batch.commit();
  console.log('Migrated', ordersArray.length, 'orders');
}

// Expose to window for deferred regular scripts
Object.assign(window, {
  login, logout, onAuthChange,
  fetchOrders, addOrder, updateOrder, deleteOrder,
  syncMemoPayments, restoreOrder, migrateOrders
});
