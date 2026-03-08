import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const allowedRoles = route.data?.['roles'] as string[] | undefined;

  return authService.currentUserData$.pipe(
    take(1),
    map((user) => {
      if (!user) {
        return router.createUrlTree(['/login']);
      }

      if (!allowedRoles || allowedRoles.includes(user.role)) {
        return true;
      }

      return router.createUrlTree(['/']);
    })
  );
};
