import { Inject, InjectionToken, Injector, VERSION as NG_VERSION, NgModule, NgZone, Optional, PLATFORM_ID, makeEnvironmentProviders, } from '@angular/core';
import { VERSION, ɵAngularFireSchedulers } from '@angular/fire';
import { getApp, registerVersion } from 'firebase/app';
import { FirebaseApp, FirebaseApps } from './app';
import * as i0 from "@angular/core";
export function defaultFirebaseAppFactory(provided) {
    // Use the provided app, if there is only one, otherwise fetch the default app
    if (provided && provided.length === 1) {
        return provided[0];
    }
    return new FirebaseApp(getApp());
}
// With FIREBASE_APPS I wanted to capture the default app instance, if it is initialized by
// the reserved URL; ɵPROVIDED_FIREBASE_APPS is not for public consumption and serves to ensure that all
// provideFirebaseApp(...) calls are satisfied before FirebaseApp$ or FirebaseApp is resolved
export const PROVIDED_FIREBASE_APPS = new InjectionToken('angularfire2._apps');
// Injecting FirebaseApp will now only inject the default Firebase App
// this allows allows beginners to import /__/firebase/init.js to auto initialize Firebase App
// from the reserved URL.
const DEFAULT_FIREBASE_APP_PROVIDER = {
    provide: FirebaseApp,
    useFactory: defaultFirebaseAppFactory,
    deps: [
        [new Optional(), PROVIDED_FIREBASE_APPS],
    ],
};
const FIREBASE_APPS_PROVIDER = {
    provide: FirebaseApps,
    deps: [
        [new Optional(), PROVIDED_FIREBASE_APPS],
    ],
};
export function firebaseAppFactory(fn) {
    return (zone, injector) => {
        const platformId = injector.get(PLATFORM_ID);
        registerVersion('angularfire', VERSION.full, 'core');
        registerVersion('angularfire', VERSION.full, 'app');
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        registerVersion('angular', NG_VERSION.full, platformId.toString());
        const app = zone.runOutsideAngular(() => fn(injector));
        return new FirebaseApp(app);
    };
}
export class FirebaseAppModule {
    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(platformId) {
        registerVersion('angularfire', VERSION.full, 'core');
        registerVersion('angularfire', VERSION.full, 'app');
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        registerVersion('angular', NG_VERSION.full, platformId.toString());
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: FirebaseAppModule, deps: [{ token: PLATFORM_ID }], target: i0.ɵɵFactoryTarget.NgModule });
    static ɵmod = i0.ɵɵngDeclareNgModule({ minVersion: "14.0.0", version: "17.0.6", ngImport: i0, type: FirebaseAppModule });
    static ɵinj = i0.ɵɵngDeclareInjector({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: FirebaseAppModule, providers: [
            DEFAULT_FIREBASE_APP_PROVIDER,
            FIREBASE_APPS_PROVIDER,
        ] });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: FirebaseAppModule, decorators: [{
            type: NgModule,
            args: [{
                    providers: [
                        DEFAULT_FIREBASE_APP_PROVIDER,
                        FIREBASE_APPS_PROVIDER,
                    ]
                }]
        }], ctorParameters: () => [{ type: Object, decorators: [{
                    type: Inject,
                    args: [PLATFORM_ID]
                }] }] });
// Calling initializeApp({ ... }, 'name') multiple times will add more FirebaseApps into the FIREBASE_APPS
// injection scope. This allows developers to more easily work with multiple Firebase Applications. Downside
// is that DI for app name and options doesn't really make sense anymore.
export function provideFirebaseApp(fn, ...deps) {
    return makeEnvironmentProviders([
        DEFAULT_FIREBASE_APP_PROVIDER,
        FIREBASE_APPS_PROVIDER,
        {
            provide: PROVIDED_FIREBASE_APPS,
            useFactory: firebaseAppFactory(fn),
            multi: true,
            deps: [
                NgZone,
                Injector,
                ɵAngularFireSchedulers,
                ...deps,
            ],
        }
    ]);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLm1vZHVsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9hcHAvYXBwLm1vZHVsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBRUwsTUFBTSxFQUNOLGNBQWMsRUFDZCxRQUFRLEVBQ1IsT0FBTyxJQUFJLFVBQVUsRUFDckIsUUFBUSxFQUNSLE1BQU0sRUFDTixRQUFRLEVBQ1IsV0FBVyxFQUNYLHdCQUF3QixHQUN6QixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ2hFLE9BQU8sRUFBK0IsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNwRixPQUFPLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLE9BQU8sQ0FBQzs7QUFFbEQsTUFBTSxVQUFVLHlCQUF5QixDQUFDLFFBQWlDO0lBQ3pFLDhFQUE4RTtJQUM5RSxJQUFJLFFBQVEsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtRQUFFLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQUU7SUFDOUQsT0FBTyxJQUFJLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQ25DLENBQUM7QUFFRCwyRkFBMkY7QUFDM0Ysd0dBQXdHO0FBQ3hHLDZGQUE2RjtBQUM3RixNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLGNBQWMsQ0FBZ0Isb0JBQW9CLENBQUMsQ0FBQztBQUU5RixzRUFBc0U7QUFDdEUsOEZBQThGO0FBQzlGLHlCQUF5QjtBQUN6QixNQUFNLDZCQUE2QixHQUFHO0lBQ3BDLE9BQU8sRUFBRSxXQUFXO0lBQ3BCLFVBQVUsRUFBRSx5QkFBeUI7SUFDckMsSUFBSSxFQUFFO1FBQ0osQ0FBQyxJQUFJLFFBQVEsRUFBRSxFQUFFLHNCQUFzQixDQUFFO0tBQzFDO0NBQ0YsQ0FBQztBQUVGLE1BQU0sc0JBQXNCLEdBQUc7SUFDN0IsT0FBTyxFQUFFLFlBQVk7SUFDckIsSUFBSSxFQUFFO1FBQ0osQ0FBQyxJQUFJLFFBQVEsRUFBRSxFQUFFLHNCQUFzQixDQUFFO0tBQzFDO0NBQ0YsQ0FBQztBQUVGLE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxFQUF3QztJQUN6RSxPQUFPLENBQUMsSUFBWSxFQUFFLFFBQWtCLEVBQUUsRUFBRTtRQUMxQyxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdDLGVBQWUsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNyRCxlQUFlLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEQsZ0VBQWdFO1FBQ2hFLGVBQWUsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUVuRSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDdkQsT0FBTyxJQUFJLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM5QixDQUFDLENBQUM7QUFDSixDQUFDO0FBUUQsTUFBTSxPQUFPLGlCQUFpQjtJQUM1Qix3REFBd0Q7SUFDeEQsWUFBaUMsVUFBa0I7UUFDakQsZUFBZSxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3JELGVBQWUsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwRCxnRUFBZ0U7UUFDaEUsZUFBZSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7dUdBUFUsaUJBQWlCLGtCQUVSLFdBQVc7d0dBRnBCLGlCQUFpQjt3R0FBakIsaUJBQWlCLGFBTGpCO1lBQ1QsNkJBQTZCO1lBQzdCLHNCQUFzQjtTQUN2Qjs7MkZBRVUsaUJBQWlCO2tCQU43QixRQUFRO21CQUFDO29CQUNSLFNBQVMsRUFBRTt3QkFDVCw2QkFBNkI7d0JBQzdCLHNCQUFzQjtxQkFDdkI7aUJBQ0Y7OzBCQUdjLE1BQU07MkJBQUMsV0FBVzs7QUFRakMsMEdBQTBHO0FBQzFHLDRHQUE0RztBQUM1Ryx5RUFBeUU7QUFDekUsTUFBTSxVQUFVLGtCQUFrQixDQUFDLEVBQXdDLEVBQUUsR0FBRyxJQUFXO0lBQ3pGLE9BQU8sd0JBQXdCLENBQUM7UUFDOUIsNkJBQTZCO1FBQzdCLHNCQUFzQjtRQUN0QjtZQUNFLE9BQU8sRUFBRSxzQkFBc0I7WUFDL0IsVUFBVSxFQUFFLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztZQUNsQyxLQUFLLEVBQUUsSUFBSTtZQUNYLElBQUksRUFBRTtnQkFDSixNQUFNO2dCQUNOLFFBQVE7Z0JBQ1Isc0JBQXNCO2dCQUN0QixHQUFHLElBQUk7YUFDUjtTQUNGO0tBQ0YsQ0FBQyxDQUFBO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEVudmlyb25tZW50UHJvdmlkZXJzLFxuICBJbmplY3QsXG4gIEluamVjdGlvblRva2VuLFxuICBJbmplY3RvcixcbiAgVkVSU0lPTiBhcyBOR19WRVJTSU9OLFxuICBOZ01vZHVsZSxcbiAgTmdab25lLFxuICBPcHRpb25hbCxcbiAgUExBVEZPUk1fSUQsXG4gIG1ha2VFbnZpcm9ubWVudFByb3ZpZGVycyxcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQgeyBWRVJTSU9OLCDJtUFuZ3VsYXJGaXJlU2NoZWR1bGVycyB9IGZyb20gJ0Bhbmd1bGFyL2ZpcmUnO1xuaW1wb3J0IHsgRmlyZWJhc2VBcHAgYXMgSUZpcmViYXNlQXBwLCBnZXRBcHAsIHJlZ2lzdGVyVmVyc2lvbiB9IGZyb20gJ2ZpcmViYXNlL2FwcCc7XG5pbXBvcnQgeyBGaXJlYmFzZUFwcCwgRmlyZWJhc2VBcHBzIH0gZnJvbSAnLi9hcHAnO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdEZpcmViYXNlQXBwRmFjdG9yeShwcm92aWRlZDogRmlyZWJhc2VBcHBbXXx1bmRlZmluZWQpIHtcbiAgLy8gVXNlIHRoZSBwcm92aWRlZCBhcHAsIGlmIHRoZXJlIGlzIG9ubHkgb25lLCBvdGhlcndpc2UgZmV0Y2ggdGhlIGRlZmF1bHQgYXBwXG4gIGlmIChwcm92aWRlZCAmJiBwcm92aWRlZC5sZW5ndGggPT09IDEpIHsgcmV0dXJuIHByb3ZpZGVkWzBdOyB9XG4gIHJldHVybiBuZXcgRmlyZWJhc2VBcHAoZ2V0QXBwKCkpO1xufVxuXG4vLyBXaXRoIEZJUkVCQVNFX0FQUFMgSSB3YW50ZWQgdG8gY2FwdHVyZSB0aGUgZGVmYXVsdCBhcHAgaW5zdGFuY2UsIGlmIGl0IGlzIGluaXRpYWxpemVkIGJ5XG4vLyB0aGUgcmVzZXJ2ZWQgVVJMOyDJtVBST1ZJREVEX0ZJUkVCQVNFX0FQUFMgaXMgbm90IGZvciBwdWJsaWMgY29uc3VtcHRpb24gYW5kIHNlcnZlcyB0byBlbnN1cmUgdGhhdCBhbGxcbi8vIHByb3ZpZGVGaXJlYmFzZUFwcCguLi4pIGNhbGxzIGFyZSBzYXRpc2ZpZWQgYmVmb3JlIEZpcmViYXNlQXBwJCBvciBGaXJlYmFzZUFwcCBpcyByZXNvbHZlZFxuZXhwb3J0IGNvbnN0IFBST1ZJREVEX0ZJUkVCQVNFX0FQUFMgPSBuZXcgSW5qZWN0aW9uVG9rZW48RmlyZWJhc2VBcHBbXT4oJ2FuZ3VsYXJmaXJlMi5fYXBwcycpO1xuXG4vLyBJbmplY3RpbmcgRmlyZWJhc2VBcHAgd2lsbCBub3cgb25seSBpbmplY3QgdGhlIGRlZmF1bHQgRmlyZWJhc2UgQXBwXG4vLyB0aGlzIGFsbG93cyBhbGxvd3MgYmVnaW5uZXJzIHRvIGltcG9ydCAvX18vZmlyZWJhc2UvaW5pdC5qcyB0byBhdXRvIGluaXRpYWxpemUgRmlyZWJhc2UgQXBwXG4vLyBmcm9tIHRoZSByZXNlcnZlZCBVUkwuXG5jb25zdCBERUZBVUxUX0ZJUkVCQVNFX0FQUF9QUk9WSURFUiA9IHtcbiAgcHJvdmlkZTogRmlyZWJhc2VBcHAsXG4gIHVzZUZhY3Rvcnk6IGRlZmF1bHRGaXJlYmFzZUFwcEZhY3RvcnksXG4gIGRlcHM6IFtcbiAgICBbbmV3IE9wdGlvbmFsKCksIFBST1ZJREVEX0ZJUkVCQVNFX0FQUFMgXSxcbiAgXSxcbn07XG5cbmNvbnN0IEZJUkVCQVNFX0FQUFNfUFJPVklERVIgPSB7XG4gIHByb3ZpZGU6IEZpcmViYXNlQXBwcyxcbiAgZGVwczogW1xuICAgIFtuZXcgT3B0aW9uYWwoKSwgUFJPVklERURfRklSRUJBU0VfQVBQUyBdLFxuICBdLFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGZpcmViYXNlQXBwRmFjdG9yeShmbjogKGluamVjdG9yOiBJbmplY3RvcikgPT4gSUZpcmViYXNlQXBwKSB7XG4gIHJldHVybiAoem9uZTogTmdab25lLCBpbmplY3RvcjogSW5qZWN0b3IpID0+IHtcbiAgICBjb25zdCBwbGF0Zm9ybUlkID0gaW5qZWN0b3IuZ2V0KFBMQVRGT1JNX0lEKTtcbiAgICByZWdpc3RlclZlcnNpb24oJ2FuZ3VsYXJmaXJlJywgVkVSU0lPTi5mdWxsLCAnY29yZScpO1xuICAgIHJlZ2lzdGVyVmVyc2lvbignYW5ndWxhcmZpcmUnLCBWRVJTSU9OLmZ1bGwsICdhcHAnKTtcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWJhc2UtdG8tc3RyaW5nXG4gICAgcmVnaXN0ZXJWZXJzaW9uKCdhbmd1bGFyJywgTkdfVkVSU0lPTi5mdWxsLCBwbGF0Zm9ybUlkLnRvU3RyaW5nKCkpO1xuXG4gICAgY29uc3QgYXBwID0gem9uZS5ydW5PdXRzaWRlQW5ndWxhcigoKSA9PiBmbihpbmplY3RvcikpO1xuICAgIHJldHVybiBuZXcgRmlyZWJhc2VBcHAoYXBwKTtcbiAgfTtcbn1cblxuQE5nTW9kdWxlKHtcbiAgcHJvdmlkZXJzOiBbXG4gICAgREVGQVVMVF9GSVJFQkFTRV9BUFBfUFJPVklERVIsXG4gICAgRklSRUJBU0VfQVBQU19QUk9WSURFUixcbiAgXVxufSlcbmV4cG9ydCBjbGFzcyBGaXJlYmFzZUFwcE1vZHVsZSB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvYmFuLXR5cGVzXG4gIGNvbnN0cnVjdG9yKEBJbmplY3QoUExBVEZPUk1fSUQpIHBsYXRmb3JtSWQ6IE9iamVjdCkge1xuICAgIHJlZ2lzdGVyVmVyc2lvbignYW5ndWxhcmZpcmUnLCBWRVJTSU9OLmZ1bGwsICdjb3JlJyk7XG4gICAgcmVnaXN0ZXJWZXJzaW9uKCdhbmd1bGFyZmlyZScsIFZFUlNJT04uZnVsbCwgJ2FwcCcpO1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tYmFzZS10by1zdHJpbmdcbiAgICByZWdpc3RlclZlcnNpb24oJ2FuZ3VsYXInLCBOR19WRVJTSU9OLmZ1bGwsIHBsYXRmb3JtSWQudG9TdHJpbmcoKSk7XG4gIH1cbn1cblxuLy8gQ2FsbGluZyBpbml0aWFsaXplQXBwKHsgLi4uIH0sICduYW1lJykgbXVsdGlwbGUgdGltZXMgd2lsbCBhZGQgbW9yZSBGaXJlYmFzZUFwcHMgaW50byB0aGUgRklSRUJBU0VfQVBQU1xuLy8gaW5qZWN0aW9uIHNjb3BlLiBUaGlzIGFsbG93cyBkZXZlbG9wZXJzIHRvIG1vcmUgZWFzaWx5IHdvcmsgd2l0aCBtdWx0aXBsZSBGaXJlYmFzZSBBcHBsaWNhdGlvbnMuIERvd25zaWRlXG4vLyBpcyB0aGF0IERJIGZvciBhcHAgbmFtZSBhbmQgb3B0aW9ucyBkb2Vzbid0IHJlYWxseSBtYWtlIHNlbnNlIGFueW1vcmUuXG5leHBvcnQgZnVuY3Rpb24gcHJvdmlkZUZpcmViYXNlQXBwKGZuOiAoaW5qZWN0b3I6IEluamVjdG9yKSA9PiBJRmlyZWJhc2VBcHAsIC4uLmRlcHM6IGFueVtdKTogRW52aXJvbm1lbnRQcm92aWRlcnMge1xuICByZXR1cm4gbWFrZUVudmlyb25tZW50UHJvdmlkZXJzKFtcbiAgICBERUZBVUxUX0ZJUkVCQVNFX0FQUF9QUk9WSURFUixcbiAgICBGSVJFQkFTRV9BUFBTX1BST1ZJREVSLFxuICAgIHtcbiAgICAgIHByb3ZpZGU6IFBST1ZJREVEX0ZJUkVCQVNFX0FQUFMsXG4gICAgICB1c2VGYWN0b3J5OiBmaXJlYmFzZUFwcEZhY3RvcnkoZm4pLFxuICAgICAgbXVsdGk6IHRydWUsXG4gICAgICBkZXBzOiBbXG4gICAgICAgIE5nWm9uZSxcbiAgICAgICAgSW5qZWN0b3IsXG4gICAgICAgIMm1QW5ndWxhckZpcmVTY2hlZHVsZXJzLFxuICAgICAgICAuLi5kZXBzLFxuICAgICAgXSxcbiAgICB9XG4gIF0pXG59XG4iXX0=