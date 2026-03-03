import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take, switchMap } from 'rxjs/operators';
import { Observable, from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    const allowedRoles = route.data['roles'] as Array<string>;
    
    return this.authService.currentUser$.pipe(
      take(1),
      switchMap(async (firebaseUser) => {
        if (!firebaseUser) {
          this.router.navigate(['/login']);
          return false;
        }

        const userData = await this.authService.getUserData(firebaseUser.uid);
        
        if (!userData) {
          this.router.navigate(['/login']);
          return false;
        }

        if (allowedRoles.includes(userData.role)) {
          return true;
        }

        switch(userData.role) {
          case 'company':
            this.router.navigate(['/cursos-grupos']);
            break;
          case 'instructor':
            this.router.navigate(['/cursos-grupos']);
            break;
          default:
            this.router.navigate(['/home']);
        }
        
        return false;
      })
    );
  }
}