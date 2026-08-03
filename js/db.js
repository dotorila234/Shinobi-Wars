import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig, AUTH_FAKE_DOMAIN } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const dbase = getFirestore(app);

function emailForId(id) {
  return `id${id}@${AUTH_FAKE_DOMAIN}`;
}

export async function registerAccount(username, password) {
  const usernameLower = username.trim().toLowerCase();

  const existing = await getDocs(query(collection(dbase, "users"), where("usernameLower", "==", usernameLower)));
  if (!existing.empty) {
    throw new Error("username-taken");
  }

  const counterRef = doc(dbase, "meta", "counter");
  const nextId = await runTransaction(dbase, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? snap.data().nextId : 1;
    tx.set(counterRef, { nextId: current + 1 }, { merge: true });
    return current;
  });

  const email = emailForId(nextId);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const role = nextId === 1 ? "owner" : "player";

  await setDoc(doc(dbase, "users", credential.user.uid), {
    id: nextId,
    username: username.trim(),
    usernameLower,
    role,
    createdAt: serverTimestamp()
  });

  return { id: nextId, username: username.trim(), role };
}

export async function login(username, password) {
  const usernameLower = username.trim().toLowerCase();
  const found = await getDocs(query(collection(dbase, "users"), where("usernameLower", "==", usernameLower)));
  if (found.empty) throw new Error("not-found");
  const userDoc = found.docs[0].data();
  const email = emailForId(userDoc.id);
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  await signOut(auth);
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(dbase, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function createCharacter(ownerId, ownerUsername, data) {
  const ref = await addDoc(collection(dbase, "characters"), {
    ownerId,
    ownerUsername,
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateCharacter(charId, data) {
  await updateDoc(doc(dbase, "characters", charId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteCharacter(charId) {
  await deleteDoc(doc(dbase, "characters", charId));
}

export async function getCharacter(charId) {
  const snap = await getDoc(doc(dbase, "characters", charId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listAllCharacters() {
  const snap = await getDocs(collection(dbase, "characters"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listAllUsers() {
  const snap = await getDocs(collection(dbase, "users"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(dbase, "users", uid), { role });
}

export async function listNavPages() {
  const snap = await getDocs(collection(dbase, "navpages"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function createNavPage(data) {
  const ref = await addDoc(collection(dbase, "navpages"), data);
  return ref.id;
}

export async function updateNavPage(id, data) {
  await updateDoc(doc(dbase, "navpages", id), data);
}

export async function deleteNavPage(id) {
  await deleteDoc(doc(dbase, "navpages", id));
}

export async function listAnuncios() {
  const snap = await getDocs(collection(dbase, "anuncios"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}

export async function createAnuncio(data) {
  const ref = await addDoc(collection(dbase, "anuncios"), { ...data, createdAtMs: Date.now(), createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteAnuncio(id) {
  await deleteDoc(doc(dbase, "anuncios", id));
}

export async function getTheme() {
  const snap = await getDoc(doc(dbase, "settings", "theme"));
  return snap.exists() ? snap.data() : null;
}

export async function setTheme(data) {
  await setDoc(doc(dbase, "settings", "theme"), data, { merge: true });
}
