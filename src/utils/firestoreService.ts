import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Scenario } from '../types';

/**
 * Saves or updates a comparative scenario in Firestore
 */
export async function saveUserScenario(
  id: string, 
  name: string, 
  newEstimate: Scenario['newEstimate'], 
  oldEstimate: Scenario['oldEstimate'], 
  comparisonResult: Scenario['comparisonResult']
) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("ユーザーがサインインしていません。");
  }

  const path = `scenarios/${id}`;
  try {
    const isNew = !id;
    // Generate an ID if creating a new one
    const docId = id || doc(collection(db, 'scenarios')).id;
    const docRef = doc(db, 'scenarios', docId);

    const payload: any = {
      id: docId,
      userId: user.uid,
      name,
      newEstimate,
      oldEstimate,
      comparisonResult: comparisonResult || null,
      updatedAt: serverTimestamp()
    };

    if (isNew || !id) {
      payload.createdAt = serverTimestamp();
    }

    // When writing (setDoc with merge), we use WRITE or CREATE operation type
    await setDoc(docRef, payload, { merge: true });
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a scenario document from Firestore
 */
export async function deleteUserScenario(scenarioId: string) {
  const path = `scenarios/${scenarioId}`;
  try {
    const docRef = doc(db, 'scenarios', scenarioId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Subscribes to the user's custom scenarios in Firestore
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

  return onSnapshot(q, (snapshot) => {
    const scenarios: Scenario[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      scenarios.push({
        id: data.id,
        userId: data.userId,
        name: data.name,
        newEstimate: data.newEstimate,
        oldEstimate: data.oldEstimate,
        comparisonResult: data.comparisonResult || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    });
    onUpdate(scenarios);
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.LIST, collectionPath);
    } catch (err: any) {
      onError(err);
    }
  });
}
