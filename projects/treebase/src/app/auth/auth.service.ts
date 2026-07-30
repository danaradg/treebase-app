import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, of, map, catchError } from 'rxjs';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';
import { FIREBASE_CONFIG } from '../proposals/firebase-config.secret';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private app: FirebaseApp;
  private auth: Auth;
  public user$ = new BehaviorSubject<User | null>(null);

  constructor() {
    this.app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    this.auth = getAuth(this.app);

    onAuthStateChanged(this.auth, (user) => {
      console.debug('[AuthService] Auth state updated:', user ? { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL } : 'No User');
      this.user$.next(user);
    });
  }

  get currentUser(): User | null {
    return this.auth.currentUser || this.user$.value;
  }

  public ensureAuthenticated(): Observable<User> {
    if (this.auth.currentUser) {
      return from(this.auth.currentUser.getIdToken(true)).pipe(
        map(() => this.auth.currentUser!),
        catchError(err => {
          console.warn('[AuthService] Token refresh warning:', err);
          return of(this.auth.currentUser!);
        })
      );
    }
    return of({ uid: 'anonymous-guest', isAnonymous: true } as User);
  }

  loginWithGoogle(): Observable<User> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return from(signInWithPopup(this.auth, provider)).pipe(
      map(credential => credential.user)
    );
  }

  logout(): Observable<void> {
    return from(signOut(this.auth)).pipe(
      map(() => void 0)
    );
  }
}
