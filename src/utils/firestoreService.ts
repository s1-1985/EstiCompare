import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Scenario } from '../types';

/**
 * Saves or updates a comparative scenario in Firestore.
 * Creates a new document when id is empty, updates the existing one otherwise.
 */
export async function saveUserScenario(
  id: string,
  name: string,
  newEstimate: Scenario['newEstimate'],
  oldEstimate: Scenario['oldEstimate'],
  comparisonResult: Scenario['comparisonResult']
) {
  const user = auth.currentUser;
  if (!user) throw new Error('ユーザーがサインインしていません。');

  const isNew = !id;
  const docId = isNew ? doc(collection(db, 'scenarios')).id : id;
  const docRef = doc(db, 'scenarios', docId);
  const path = `scenarios/${docId}`;

  try {
    if (isNew) {
      // CREATE: include createdAt so Firestore rules pass
      await setDoc(docRef, {
        id: docId,
        userId: user.uid,
        name,
        newEstimate,
        oldEstimate,
        comparisonResult: comparisonResult || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      // UPDATE: use updateDoc so createdAt is not touched (rules verify it hasn't changed)
      await updateDoc(docRef, {
        id: docId,
        userId: user.uid,
        name,
        newEstimate,
        oldEstimate,
        comparisonResult: comparisonResult || null,
        updatedAt: serverTimestamp(),
      });
    }
    return docId;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

/**
 * Deletes a scenario document from Firestore.
 */
export async function deleteUserScenario(scenarioId: string) {
  const path = `scenarios/${scenarioId}`;
  try {
    await deleteDoc(doc(db, 'scenarios', scenarioId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Subscribes to the current user's scenarios in Firestore (real-time).
 */
export function subscribeScenarios(
  userId: string,
  onUpdate: (scenarios: Scenario[]) => void,
  onError: (error: Error) => void
) {
  const collectionPath = 'scenarios';
  const q = query(
    collection(db, collectionPath),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const scenarios: Scenario[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        scenarios.push({
          id: data.id,
          userId: data.userId,
          name: data.name,
          newEstimate: data.newEstimate,
          oldEstimate: data.oldEstimate,
          comparisonResult: data.comparisonResult || null,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      });
      onUpdate(scenarios);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      } catch (err: any) {
        onError(err);
      }
    }
  );
}
