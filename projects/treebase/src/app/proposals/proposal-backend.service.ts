import { Injectable } from '@angular/core';
import { Observable, from, of, map, switchMap, catchError, forkJoin, defaultIfEmpty } from 'rxjs';
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
  where,
  orderBy,
  serverTimestamp,
  Firestore
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
  FirebaseStorage
} from 'firebase/storage';
import { FIREBASE_CONFIG } from '../config/firebase-config';
import { AuthService } from '../auth/auth.service';
import { Proposal, ProposalAttribute } from './proposal.model';

const DATABASE_ID = 'treebase-proposals';
const DEFAULT_COLLECTION = 'proposals';

@Injectable({
  providedIn: 'root'
})
export class ProposalBackendService {

  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;
  private storage: FirebaseStorage | null = null;

  constructor(private authService: AuthService) {
    const config = (window as any).FIREBASE_CONFIG || FIREBASE_CONFIG;
    try {
      this.app = getApps().length === 0 ? initializeApp(config) : getApp();
      this.db = getFirestore(this.app, DATABASE_ID);
      this.storage = getStorage(this.app);
    } catch (e) {
      console.warn('[ProposalBackendService] Failed to initialize Firebase Services:', e);
    }
  }

  /**
   * 1. GetAllProposals: Fetches all proposals ordered by creation date
   */
  GetAllProposals(): Observable<Proposal[]> {
    if (!this.db) {
      return of([]);
    }
    const colRef = collection(this.db, DEFAULT_COLLECTION);
    const q = query(colRef, orderBy('createdAt', 'desc'));

    return from(getDocs(q)).pipe(
      map(snapshot => snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Proposal))),
      catchError(err => {
        console.warn('[ProposalBackendService] Failed to get all proposals:', err);
        return of([]);
      })
    );
  }

  /**
   * 2. GetProposalsPerTree: Fetches all proposals for a specific tree ID
   */
  GetProposalsPerTree(treeId: string): Observable<Proposal[]> {
    if (!this.db || !treeId) {
      return of([]);
    }
    const colRef = collection(this.db, DEFAULT_COLLECTION);
    const q = query(colRef, where('treeId', '==', treeId));

    return from(getDocs(q)).pipe(
      map(snapshot => snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Proposal))),
      catchError(err => {
        console.warn(`[ProposalBackendService] Failed to get proposals for tree ${treeId}:`, err);
        return of([]);
      })
    );
  }

  /**
   * 3. CreateProposal: Processes all fields of type "image", stores them in Firebase Storage,
   * updates the fields with the returned storage URLs, and saves the proposal in Firestore.
   */
  CreateProposal(proposal: Proposal): Observable<string> {
    if (!this.db) {
      return of('');
    }

    return this.authService.ensureAuthenticated().pipe(
      switchMap(user => {
        return this.uploadProposalImages(proposal).pipe(
          switchMap(processedProposal => {
            const colRef = collection(this.db!, DEFAULT_COLLECTION);
            const recordData = {
              ...processedProposal,
              submittedBy: user.uid,
              submittedByEmail: user.email || null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };
            return from(addDoc(colRef, recordData));
          })
        );
      }),
      map(docRef => docRef.id),
      catchError(err => {
        console.error('[ProposalBackendService] Failed to create proposal:', err);
        return of('');
      })
    );
  }

  /**
   * Internal helper to process all "image" fields, upload to Firebase Storage,
   * and update field values with returned Storage URLs.
   */
  private uploadProposalImages(proposal: Proposal): Observable<Proposal> {
    if (!this.storage) {
      return of(proposal);
    }

    const storageInstance = this.storage;
    const uploadTasks: Observable<{ apply: (p: Proposal) => void }>[] = [];
    const timestamp = Date.now();

    // 1. Process top-level photoUrl if it contains an image file/Blob/base64
    if (proposal.photoUrl && this.isRawImageData(proposal.photoUrl)) {
      const storageRef = ref(storageInstance, `proposals/images/${timestamp}_main_photo`);
      const upload$ = this.uploadSingleImage(storageRef, proposal.photoUrl).pipe(
        map(url => ({
          apply: (p: Proposal) => { p.photoUrl = url; }
        }))
      );
      uploadTasks.push(upload$);
    }

    // 2. Process attributes array for fields of type "image"
    if (proposal.attributes && Array.isArray(proposal.attributes)) {
      proposal.attributes.forEach((attr, index) => {
        if (this.isImageField(attr)) {
          const storageRef = ref(storageInstance, `proposals/images/${timestamp}_attr_${attr.key || index}`);
          const upload$ = this.uploadSingleImage(storageRef, attr.value).pipe(
            map(url => ({
              apply: (p: Proposal) => {
                if (p.attributes && p.attributes[index]) {
                  p.attributes[index].value = url;
                }
              }
            }))
          );
          uploadTasks.push(upload$);
        }
      });
    }

    // 3. Process proposedChanges array for fields of type "image"
    if (proposal.proposedChanges && Array.isArray(proposal.proposedChanges)) {
      proposal.proposedChanges.forEach((change, index) => {
        if (this.isImageField(change)) {
          const storageRef = ref(storageInstance, `proposals/images/${timestamp}_change_${change.key || index}`);
          const upload$ = this.uploadSingleImage(storageRef, change.value).pipe(
            map(url => ({
              apply: (p: Proposal) => {
                if (p.proposedChanges && p.proposedChanges[index]) {
                  p.proposedChanges[index].value = url;
                }
              }
            }))
          );
          uploadTasks.push(upload$);
        }
      });
    }

    if (uploadTasks.length === 0) {
      return of(proposal);
    }

    return forkJoin(uploadTasks).pipe(
      defaultIfEmpty([]),
      map(results => {
        const updatedProposal = JSON.parse(JSON.stringify(proposal)) as Proposal;
        results.forEach(task => task.apply(updatedProposal));
        return updatedProposal;
      }),
      catchError(err => {
        console.warn('[ProposalBackendService] Error uploading images to Storage:', err);
        return of(proposal);
      })
    );
  }

  /**
   * Uploads a single image (File, Blob, or base64 data URL) to Firebase Storage and returns its Download URL.
   */
  private uploadSingleImage(storageRef: any, rawData: any): Observable<string> {
    if (!rawData) {
      return of('');
    }

    if (typeof rawData === 'string' && rawData.startsWith('data:image/')) {
      return from(uploadString(storageRef, rawData, 'data_url')).pipe(
        switchMap(() => from(getDownloadURL(storageRef))),
        catchError(err => {
          console.error('[ProposalBackendService] Error uploading base64 image:', err);
          return of(rawData);
        })
      );
    }

    if (rawData instanceof File || rawData instanceof Blob) {
      return from(uploadBytes(storageRef, rawData)).pipe(
        switchMap(() => from(getDownloadURL(storageRef))),
        catchError(err => {
          console.error('[ProposalBackendService] Error uploading Blob/File image:', err);
          return of('');
        })
      );
    }

    // Fallback if already a URL or string
    return of(String(rawData));
  }

  /**
   * Checks if an attribute/change field is of type "image".
   */
  private isImageField(field: ProposalAttribute): boolean {
    if (!field) return false;
    const typeIsImage = field.type && field.type.toLowerCase() === 'image';
    const hasRawImage = this.isRawImageData(field.value);
    return typeIsImage || hasRawImage;
  }

  /**
   * Helper to check if a value represents raw image data (base64 data URL or File/Blob).
   */
  private isRawImageData(val: any): boolean {
    if (!val) return false;
    if (typeof val === 'string' && val.startsWith('data:image/')) return true;
    if (val instanceof File || val instanceof Blob) return true;
    return false;
  }

  // --- Convenience & Backward Compatibility Helper Aliases ---

  listProposals(): Observable<Proposal[]> {
    return this.GetAllProposals();
  }

  getProposal(id: string): Observable<Proposal | null> {
    return this.read<Proposal>(DEFAULT_COLLECTION, id);
  }

  getProposalsPerTree(treeId: string): Observable<Proposal[]> {
    return this.GetProposalsPerTree(treeId);
  }

  submitProposal(proposal: Proposal): Observable<string> {
    return this.CreateProposal(proposal);
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
}
