// ============================================================
// firebase.js — Firebase Auth + Firestore backend
// Replaces api.js and the entire Google Apps Script backend
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, writeBatch, setDoc, where
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
export async function login(pass) {
  const cred = PASS_MAP[pass];
  if (!cred) throw new Error('Wrong password');
  const userCred = await signInWithEmailAndPassword(auth, cred.email, pass);
  return { ok: true, role: cred.role };
}

export function logout() { return signOut(auth); }

export function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }

// ---------- ORDERS ----------
const ordersCol = collection(db, 'orders');

export async function fetchOrders() {
  const snap = await getDocs(query(ordersCol, orderBy('srNo', 'asc')));
  const rows = [];
  snap.forEach(d => {
    const data = d.data();
    // Convert Firestore Timestamps to strings for your existing UI
    const row = { _id: d.id, ...data };
    if (row.date && row.date.toDate) row.date = row.date.toDate().toISOString().split('T')[0];
    if (row.dateSold && row.dateSold.toDate) row.dateSold = row.dateSold.toDate().toISOString().split('T')[0];
    if (row.createdAt && row.createdAt.toDate) row.createdAt = row.createdAt.toDate().toISOString();
    rows.push(row);
  });
  return { ok: true, rows };
}

export async function addOrder(fields) {
  // Compute next Sr. No. locally to match your old behavior
  const snap = await getDocs(query(ordersCol, orderBy('srNo', 'desc')));
  let nextSr = 1;
  if (!snap.empty) {
    nextSr = (snap.docs[0].data().srNo || 0) + 1;
  }
  const docRef = await addDoc(ordersCol, {
    ...fields,
    srNo: nextSr,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { ok: true, id: docRef.id, srNo: nextSr };
}

export async function updateOrder(id, fields) {
  await updateDoc(doc(db, 'orders', id), {
    ...fields,
    updatedAt: serverTimestamp()
  });
  return { ok: true };
}

export async function deleteOrder(id) {
  await deleteDoc(doc(db, 'orders', id));
  return { ok: true };
}

// ---------- MEMO SYNC ----------
// Firestore doesn't need manual memo sync like Sheets did.
// Instead, we query by memoNo and update all matching docs.
export async function syncMemoPayments(memoNo, paymentLog, amountPaid, balanceDue, paymentStatus) {
  if (!memoNo) return;
  const q = query(ordersCol, where('memoNo', '==', memoNo));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach(d => {
    batch.update(doc(db, 'orders', d.id), {
      paymentLog, amountPaid, balanceDue, paymentStatus,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
}
export async function restoreOrder(id, data) {
  await setDoc(doc(db, 'orders', id), data);
  return { ok: true };
}
// ---------- MIGRATION (one-time use) ----------
export async function migrateOrders(ordersArray) {
  const batch = writeBatch(db);
  ordersArray.forEach((o, i) => {
    const ref = doc(ordersCol, `order_${i + 1}`);
    batch.set(ref, { ...o, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await batch.commit();
  console.log('Migrated', ordersArray.length, 'orders');
}
