import { Injectable } from '@angular/core';
import { Observable, from, of, map, switchMap, catchError } from 'rxjs';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  Firestore
} from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../config/firebase-config';
import { AuthService } from '../auth/auth.service';
import { Proposal } from './proposal.model';

const DATABASE_ID = 'treebase-proposals';
const DEFAULT_COLLECTION = 'proposals';

@Injectable({
  providedIn: 'root'
})
export class ProposalBackendService {

  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;

  constructor(private authService: AuthService) {
    const config = (window as any).FIREBASE_CONFIG || FIREBASE_CONFIG;
    try {
      this.app = getApps().length === 0 ? initializeApp(config) : getApp();
      this.db = getFirestore(this.app, DATABASE_ID);
    } catch (e) {
      console.warn('[ProposalBackendService] Failed to initialize Firestore database:', e);
    }
  }

  /**
   * Generic List operation to fetch all documents from a Firestore collection
   */
  list<T = any>(collectionName: string = DEFAULT_COLLECTION): Observable<T[]> {
    if (!this.db) {
      return of([]);
    }
    const colRef = collection(this.db, collectionName);
    const q = query(colRef, orderBy('createdAt', 'desc'));

    return from(getDocs(q)).pipe(
      map(snapshot => snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as unknown as T))),
      catchError(err => {
        console.warn(`[ProposalBackendService] Failed to list collection ${collectionName}:`, err);
        return of([]);
      })
    );
  }

  /**
   * Generic Read operation to fetch a single document by ID
   */
  read<T = any>(collectionName: string = DEFAULT_COLLECTION, id: string): Observable<T | null> {
    if (!this.db || !id) {
      return of(null);
    }
    const docRef = doc(this.db, collectionName, id);
    return from(getDoc(docRef)).pipe(
      map(docSnap => docSnap.exists() ? ({
        id: docSnap.id,
        ...docSnap.data()
      } as unknown as T) : null),
      catchError(err => {
        console.warn(`[ProposalBackendService] Failed to read doc ${id} from ${collectionName}:`, err);
        return of(null);
      })
    );
  }

  /**
   * Generic Write / Create operation to add a new document into a collection
   */
  create<T = any>(collectionName: string = DEFAULT_COLLECTION, data: T): Observable<string> {
    if (!this.db) {
      return of('');
    }
    return this.authService.ensureAuthenticated().pipe(
      switchMap(user => {
        const colRef = collection(this.db!, collectionName);
        const recordData = {
          ...data,
          submittedBy: user.uid,
          submittedByEmail: user.email || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        return from(addDoc(colRef, recordData));
      }),
      map(docRef => docRef.id),
      catchError(err => {
        console.error(`[ProposalBackendService] Failed to create doc in ${collectionName}:`, err);
        return of('');
      })
    );
  }

  /**
   * Generic Update operation to modify an existing document by ID
   */
  update<T = any>(collectionName: string = DEFAULT_COLLECTION, id: string, data: Partial<T>): Observable<void> {
    if (!this.db || !id) {
      return of(void 0);
    }
    const docRef = doc(this.db, collectionName, id);
    const updateData = {
      ...data,
      updatedAt: serverTimestamp()
    };
    return from(updateDoc(docRef, updateData)).pipe(
      map(() => void 0),
      catchError(err => {
        console.error(`[ProposalBackendService] Failed to update doc ${id} in ${collectionName}:`, err);
        return of(void 0);
      })
    );
  }

  // --- Proposal Convenience Helper Methods ---

  listProposals(): Observable<Proposal[]> {
    return this.list<Proposal>(DEFAULT_COLLECTION);
  }

  getProposal(id: string): Observable<Proposal | null> {
    return this.read<Proposal>(DEFAULT_COLLECTION, id);
  }

  submitProposal(proposal: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt' | 'submittedBy'>): Observable<string> {
    return this.create<Proposal>(DEFAULT_COLLECTION, proposal as any);
  }
}
