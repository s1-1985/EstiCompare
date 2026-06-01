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
import { Scenario, ScenarioKind } from '../types';

export interface SaveScenarioInput {
  id: string;
  name: string;
  kind: ScenarioKind;
  newEstimate: Scenario['newEstimate'];   // 一覧表示・ルール検証用。multilot/batchでも有効なmapを渡す
  oldEstimate: Scenario['oldEstimate'];
  comparisonResult?: Scenario['comparisonResult'];
  notes?: string;
  multiPatternBase?: Scenario['multiPatternBase'];
  quantityPatterns?: Scenario['quantityPatterns'];
  batchParts?: Scenario['batchParts'];
}

/**
 * Saves or updates a scenario in Firestore. Stores the feature `kind` and the
 * feature-specific payload (multilot base+patterns / batch parts) alongside the
 * compare estimates. Creates a new document when id is empty, updates otherwise.
 */
export async function saveUserScenario(input: SaveScenarioInput) {
  const user = auth.currentUser;
  if (!user) throw new Error('ユーザーがサインインしていません。');

  const isNew = !input.id;
  const docId = isNew ? doc(collection(db, 'scenarios')).id : input.id;
  const docRef = doc(db, 'scenarios', docId);
  const path = `scenarios/${docId}`;

  const payload = {
    id: docId,
    userId: user.uid,
    name: input.name,
    kind: input.kind || 'compare',
    notes: input.notes || null,
    newEstimate: input.newEstimate,
    oldEstimate: input.oldEstimate,
    comparisonResult: input.comparisonResult || null,
    multiPatternBase: input.multiPatternBase || null,
    quantityPatterns: input.quantityPatterns && input.quantityPatterns.length > 0 ? input.quantityPatterns : null,
    batchParts: input.batchParts && input.batchParts.length > 0 ? input.batchParts : null,
  };

  try {
    if (isNew) {
      // CREATE: include createdAt so Firestore rules pass
      await setDoc(docRef, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      // UPDATE: use updateDoc so createdAt is not touched (rules verify it hasn't changed)
      await updateDoc(docRef, { ...payload, updatedAt: serverTimestamp() });
    }
    return docId;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

/**
 * Saves AI analysis text to an existing scenario document.
 */
export async function saveScenarioAnalysis(scenarioId: string, aiAnalysis: string) {
  const path = `scenarios/${scenarioId}`;
  try {
    await updateDoc(doc(db, 'scenarios', scenarioId), {
      aiAnalysis,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
          kind: data.kind || 'compare',
          newEstimate: data.newEstimate,
          oldEstimate: data.oldEstimate,
          comparisonResult: data.comparisonResult || null,
          aiAnalysis: data.aiAnalysis || null,
          multiPatternBase: data.multiPatternBase || undefined,
          quantityPatterns: data.quantityPatterns || undefined,
          batchParts: data.batchParts || undefined,
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
