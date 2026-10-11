import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
let store;
export function getStore() {
  if (store) return store;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error('storage_unavailable');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = getFirestore();
  const collection = db.collection(process.env.FIRESTORE_COLLECTION || 'geuljari_articles');
  store = {
    async get(id) { const doc = await collection.doc(id).get(); return doc.exists ? doc.data() : null; },
    async change(id, fn) {
      return db.runTransaction(async tx => {
        const ref = collection.doc(id), snap = await tx.get(ref);
        const result = fn(snap.exists ? snap.data() : null);
        if (result.next === null) tx.delete(ref);
        else if (result.next) tx.set(ref, result.next);
        return result.value;
      });
    }
  };
  return store;
}
