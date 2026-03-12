import { APP_INITIALIZER, InjectionToken, Injector, NgModule, NgZone, Optional, makeEnvironmentProviders, } from '@angular/core';
import { VERSION, ɵAngularFireSchedulers, ɵgetDefaultInstanceOf } from '@angular/fire';
import { FirebaseApp, FirebaseApps } from '@angular/fire/app';
import { registerVersion } from 'firebase/app';
import { ANALYTICS_PROVIDER_NAME, Analytics, AnalyticsInstances } from './analytics';
import { isAnalyticsSupportedFactory } from './is-analytics-supported-factory';
import { ScreenTrackingService } from './screen-tracking.service';
import { UserTrackingService } from './user-tracking.service';
import * as i0 from "@angular/core";
import * as i1 from "./screen-tracking.service";
import * as i2 from "./user-tracking.service";
export const PROVIDED_ANALYTICS_INSTANCES = new InjectionToken('angularfire2.analytics-instances');
export function defaultAnalyticsInstanceFactory(provided, defaultApp) {
    if (!isAnalyticsSupportedFactory.sync()) {
        return null;
    }
    const defaultAnalytics = ɵgetDefaultInstanceOf(ANALYTICS_PROVIDER_NAME, provided, defaultApp);
    return defaultAnalytics && new Analytics(defaultAnalytics);
}
export function analyticsInstanceFactory(fn) {
    return (zone, injector) => {
        if (!isAnalyticsSupportedFactory.sync()) {
            return null;
        }
        const analytics = zone.runOutsideAngular(() => fn(injector));
        return new Analytics(analytics);
    };
}
const ANALYTICS_INSTANCES_PROVIDER = {
    provide: AnalyticsInstances,
    deps: [
        [new Optional(), PROVIDED_ANALYTICS_INSTANCES],
    ]
};
const DEFAULT_ANALYTICS_INSTANCE_PROVIDER = {
    provide: Analytics,
    useFactory: defaultAnalyticsInstanceFactory,
    deps: [
        [new Optional(), PROVIDED_ANALYTICS_INSTANCES],
        FirebaseApp,
    ]
};
export class AnalyticsModule {
    constructor(_screenTrackingService, _userTrackingService) {
        registerVersion('angularfire', VERSION.full, 'analytics');
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: AnalyticsModule, deps: [{ token: i1.ScreenTrackingService, optional: true }, { token: i2.UserTrackingService, optional: true }], target: i0.ɵɵFactoryTarget.NgModule });
    static ɵmod = i0.ɵɵngDeclareNgModule({ minVersion: "14.0.0", version: "17.0.6", ngImport: i0, type: AnalyticsModule });
    static ɵinj = i0.ɵɵngDeclareInjector({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: AnalyticsModule, providers: [
            DEFAULT_ANALYTICS_INSTANCE_PROVIDER,
            ANALYTICS_INSTANCES_PROVIDER,
            {
                provide: APP_INITIALIZER,
                useValue: isAnalyticsSupportedFactory.async,
                multi: true,
            }
        ] });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: AnalyticsModule, decorators: [{
            type: NgModule,
            args: [{
                    providers: [
                        DEFAULT_ANALYTICS_INSTANCE_PROVIDER,
                        ANALYTICS_INSTANCES_PROVIDER,
                        {
                            provide: APP_INITIALIZER,
                            useValue: isAnalyticsSupportedFactory.async,
                            multi: true,
                        }
                    ]
                }]
        }], ctorParameters: () => [{ type: i1.ScreenTrackingService, decorators: [{
                    type: Optional
                }] }, { type: i2.UserTrackingService, decorators: [{
                    type: Optional
                }] }] });
export function provideAnalytics(fn, ...deps) {
    registerVersion('angularfire', VERSION.full, 'analytics');
    return makeEnvironmentProviders([
        DEFAULT_ANALYTICS_INSTANCE_PROVIDER,
        ANALYTICS_INSTANCES_PROVIDER,
        {
            provide: APP_INITIALIZER,
            useValue: isAnalyticsSupportedFactory.async,
            multi: true,
        },
        {
            provide: PROVIDED_ANALYTICS_INSTANCES,
            useFactory: analyticsInstanceFactory(fn),
            multi: true,
            deps: [
                NgZone,
                Injector,
                ɵAngularFireSchedulers,
                FirebaseApps,
                ...deps,
            ],
        },
    ]);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5hbHl0aWNzLm1vZHVsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9hbmFseXRpY3MvYW5hbHl0aWNzLm1vZHVsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsZUFBZSxFQUVmLGNBQWMsRUFDZCxRQUFRLEVBQ1IsUUFBUSxFQUNSLE1BQU0sRUFDTixRQUFRLEVBQ1Isd0JBQXdCLEdBQ3pCLE1BQU0sZUFBZSxDQUFDO0FBQ3ZCLE9BQU8sRUFBRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDdkYsT0FBTyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUU5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQy9DLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDckYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDL0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUJBQXlCLENBQUM7Ozs7QUFFOUQsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQUcsSUFBSSxjQUFjLENBQWMsa0NBQWtDLENBQUMsQ0FBQztBQUVoSCxNQUFNLFVBQVUsK0JBQStCLENBQUMsUUFBdUMsRUFBRSxVQUF1QjtJQUM5RyxJQUFJLENBQUMsMkJBQTJCLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFBRSxPQUFPLElBQUksQ0FBQztLQUFFO0lBQ3pELE1BQU0sZ0JBQWdCLEdBQUcscUJBQXFCLENBQW9CLHVCQUF1QixFQUFFLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUNqSCxPQUFPLGdCQUFnQixJQUFJLElBQUksU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFDN0QsQ0FBQztBQUVELE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxFQUE2QztJQUNwRixPQUFPLENBQUMsSUFBWSxFQUFFLFFBQWtCLEVBQUUsRUFBRTtRQUMxQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsSUFBSSxFQUFFLEVBQUU7WUFBRSxPQUFPLElBQUksQ0FBQztTQUFFO1FBQ3pELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUM3RCxPQUFPLElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2xDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLDRCQUE0QixHQUFHO0lBQ25DLE9BQU8sRUFBRSxrQkFBa0I7SUFDM0IsSUFBSSxFQUFFO1FBQ0osQ0FBQyxJQUFJLFFBQVEsRUFBRSxFQUFFLDRCQUE0QixDQUFFO0tBQ2hEO0NBQ0YsQ0FBQztBQUVGLE1BQU0sbUNBQW1DLEdBQUc7SUFDMUMsT0FBTyxFQUFFLFNBQVM7SUFDbEIsVUFBVSxFQUFFLCtCQUErQjtJQUMzQyxJQUFJLEVBQUU7UUFDSixDQUFDLElBQUksUUFBUSxFQUFFLEVBQUUsNEJBQTRCLENBQUU7UUFDL0MsV0FBVztLQUNaO0NBQ0YsQ0FBQztBQWFGLE1BQU0sT0FBTyxlQUFlO0lBQzFCLFlBQ2Msc0JBQTZDLEVBQzdDLG9CQUF5QztRQUVyRCxlQUFlLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDNUQsQ0FBQzt1R0FOVSxlQUFlO3dHQUFmLGVBQWU7d0dBQWYsZUFBZSxhQVZmO1lBQ1QsbUNBQW1DO1lBQ25DLDRCQUE0QjtZQUM1QjtnQkFDRSxPQUFPLEVBQUUsZUFBZTtnQkFDeEIsUUFBUSxFQUFFLDJCQUEyQixDQUFDLEtBQUs7Z0JBQzNDLEtBQUssRUFBRSxJQUFJO2FBQ1o7U0FDRjs7MkZBRVUsZUFBZTtrQkFYM0IsUUFBUTttQkFBQztvQkFDUixTQUFTLEVBQUU7d0JBQ1QsbUNBQW1DO3dCQUNuQyw0QkFBNEI7d0JBQzVCOzRCQUNFLE9BQU8sRUFBRSxlQUFlOzRCQUN4QixRQUFRLEVBQUUsMkJBQTJCLENBQUMsS0FBSzs0QkFDM0MsS0FBSyxFQUFFLElBQUk7eUJBQ1o7cUJBQ0Y7aUJBQ0Y7OzBCQUdJLFFBQVE7OzBCQUNSLFFBQVE7O0FBTWIsTUFBTSxVQUFVLGdCQUFnQixDQUFDLEVBQTZDLEVBQUUsR0FBRyxJQUFXO0lBQzVGLGVBQWUsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztJQUUxRCxPQUFPLHdCQUF3QixDQUFDO1FBQzlCLG1DQUFtQztRQUNuQyw0QkFBNEI7UUFDNUI7WUFDRSxPQUFPLEVBQUUsZUFBZTtZQUN4QixRQUFRLEVBQUUsMkJBQTJCLENBQUMsS0FBSztZQUMzQyxLQUFLLEVBQUUsSUFBSTtTQUNaO1FBQ0Q7WUFDRSxPQUFPLEVBQUUsNEJBQTRCO1lBQ3JDLFVBQVUsRUFBRSx3QkFBd0IsQ0FBQyxFQUFFLENBQUM7WUFDeEMsS0FBSyxFQUFFLElBQUk7WUFDWCxJQUFJLEVBQUU7Z0JBQ0osTUFBTTtnQkFDTixRQUFRO2dCQUNSLHNCQUFzQjtnQkFDdEIsWUFBWTtnQkFDWixHQUFHLElBQUk7YUFDUjtTQUNGO0tBQ0YsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEFQUF9JTklUSUFMSVpFUixcbiAgRW52aXJvbm1lbnRQcm92aWRlcnMsXG4gIEluamVjdGlvblRva2VuLFxuICBJbmplY3RvcixcbiAgTmdNb2R1bGUsXG4gIE5nWm9uZSxcbiAgT3B0aW9uYWwsXG4gIG1ha2VFbnZpcm9ubWVudFByb3ZpZGVycyxcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQgeyBWRVJTSU9OLCDJtUFuZ3VsYXJGaXJlU2NoZWR1bGVycywgybVnZXREZWZhdWx0SW5zdGFuY2VPZiB9IGZyb20gJ0Bhbmd1bGFyL2ZpcmUnO1xuaW1wb3J0IHsgRmlyZWJhc2VBcHAsIEZpcmViYXNlQXBwcyB9IGZyb20gJ0Bhbmd1bGFyL2ZpcmUvYXBwJztcbmltcG9ydCB7IEFuYWx5dGljcyBhcyBGaXJlYmFzZUFuYWx5dGljcyB9IGZyb20gJ2ZpcmViYXNlL2FuYWx5dGljcyc7XG5pbXBvcnQgeyByZWdpc3RlclZlcnNpb24gfSBmcm9tICdmaXJlYmFzZS9hcHAnO1xuaW1wb3J0IHsgQU5BTFlUSUNTX1BST1ZJREVSX05BTUUsIEFuYWx5dGljcywgQW5hbHl0aWNzSW5zdGFuY2VzIH0gZnJvbSAnLi9hbmFseXRpY3MnO1xuaW1wb3J0IHsgaXNBbmFseXRpY3NTdXBwb3J0ZWRGYWN0b3J5IH0gZnJvbSAnLi9pcy1hbmFseXRpY3Mtc3VwcG9ydGVkLWZhY3RvcnknO1xuaW1wb3J0IHsgU2NyZWVuVHJhY2tpbmdTZXJ2aWNlIH0gZnJvbSAnLi9zY3JlZW4tdHJhY2tpbmcuc2VydmljZSc7XG5pbXBvcnQgeyBVc2VyVHJhY2tpbmdTZXJ2aWNlIH0gZnJvbSAnLi91c2VyLXRyYWNraW5nLnNlcnZpY2UnO1xuXG5leHBvcnQgY29uc3QgUFJPVklERURfQU5BTFlUSUNTX0lOU1RBTkNFUyA9IG5ldyBJbmplY3Rpb25Ub2tlbjxBbmFseXRpY3NbXT4oJ2FuZ3VsYXJmaXJlMi5hbmFseXRpY3MtaW5zdGFuY2VzJyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZhdWx0QW5hbHl0aWNzSW5zdGFuY2VGYWN0b3J5KHByb3ZpZGVkOiBGaXJlYmFzZUFuYWx5dGljc1tdfHVuZGVmaW5lZCwgZGVmYXVsdEFwcDogRmlyZWJhc2VBcHApIHtcbiAgaWYgKCFpc0FuYWx5dGljc1N1cHBvcnRlZEZhY3Rvcnkuc3luYygpKSB7IHJldHVybiBudWxsOyB9XG4gIGNvbnN0IGRlZmF1bHRBbmFseXRpY3MgPSDJtWdldERlZmF1bHRJbnN0YW5jZU9mPEZpcmViYXNlQW5hbHl0aWNzPihBTkFMWVRJQ1NfUFJPVklERVJfTkFNRSwgcHJvdmlkZWQsIGRlZmF1bHRBcHApO1xuICByZXR1cm4gZGVmYXVsdEFuYWx5dGljcyAmJiBuZXcgQW5hbHl0aWNzKGRlZmF1bHRBbmFseXRpY3MpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYW5hbHl0aWNzSW5zdGFuY2VGYWN0b3J5KGZuOiAoaW5qZWN0b3I6IEluamVjdG9yKSA9PiBGaXJlYmFzZUFuYWx5dGljcykge1xuICByZXR1cm4gKHpvbmU6IE5nWm9uZSwgaW5qZWN0b3I6IEluamVjdG9yKSA9PiB7XG4gICAgaWYgKCFpc0FuYWx5dGljc1N1cHBvcnRlZEZhY3Rvcnkuc3luYygpKSB7IHJldHVybiBudWxsOyB9XG4gICAgY29uc3QgYW5hbHl0aWNzID0gem9uZS5ydW5PdXRzaWRlQW5ndWxhcigoKSA9PiBmbihpbmplY3RvcikpO1xuICAgIHJldHVybiBuZXcgQW5hbHl0aWNzKGFuYWx5dGljcyk7XG4gIH07XG59XG5cbmNvbnN0IEFOQUxZVElDU19JTlNUQU5DRVNfUFJPVklERVIgPSB7XG4gIHByb3ZpZGU6IEFuYWx5dGljc0luc3RhbmNlcyxcbiAgZGVwczogW1xuICAgIFtuZXcgT3B0aW9uYWwoKSwgUFJPVklERURfQU5BTFlUSUNTX0lOU1RBTkNFUyBdLFxuICBdXG59O1xuXG5jb25zdCBERUZBVUxUX0FOQUxZVElDU19JTlNUQU5DRV9QUk9WSURFUiA9IHtcbiAgcHJvdmlkZTogQW5hbHl0aWNzLFxuICB1c2VGYWN0b3J5OiBkZWZhdWx0QW5hbHl0aWNzSW5zdGFuY2VGYWN0b3J5LFxuICBkZXBzOiBbXG4gICAgW25ldyBPcHRpb25hbCgpLCBQUk9WSURFRF9BTkFMWVRJQ1NfSU5TVEFOQ0VTIF0sXG4gICAgRmlyZWJhc2VBcHAsXG4gIF1cbn07XG5cbkBOZ01vZHVsZSh7XG4gIHByb3ZpZGVyczogW1xuICAgIERFRkFVTFRfQU5BTFlUSUNTX0lOU1RBTkNFX1BST1ZJREVSLFxuICAgIEFOQUxZVElDU19JTlNUQU5DRVNfUFJPVklERVIsXG4gICAge1xuICAgICAgcHJvdmlkZTogQVBQX0lOSVRJQUxJWkVSLFxuICAgICAgdXNlVmFsdWU6IGlzQW5hbHl0aWNzU3VwcG9ydGVkRmFjdG9yeS5hc3luYyxcbiAgICAgIG11bHRpOiB0cnVlLFxuICAgIH1cbiAgXVxufSlcbmV4cG9ydCBjbGFzcyBBbmFseXRpY3NNb2R1bGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICBAT3B0aW9uYWwoKSBfc2NyZWVuVHJhY2tpbmdTZXJ2aWNlOiBTY3JlZW5UcmFja2luZ1NlcnZpY2UsXG4gICAgQE9wdGlvbmFsKCkgX3VzZXJUcmFja2luZ1NlcnZpY2U6IFVzZXJUcmFja2luZ1NlcnZpY2UsXG4gICkge1xuICAgIHJlZ2lzdGVyVmVyc2lvbignYW5ndWxhcmZpcmUnLCBWRVJTSU9OLmZ1bGwsICdhbmFseXRpY3MnKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvdmlkZUFuYWx5dGljcyhmbjogKGluamVjdG9yOiBJbmplY3RvcikgPT4gRmlyZWJhc2VBbmFseXRpY3MsIC4uLmRlcHM6IGFueVtdKTogRW52aXJvbm1lbnRQcm92aWRlcnMge1xuICByZWdpc3RlclZlcnNpb24oJ2FuZ3VsYXJmaXJlJywgVkVSU0lPTi5mdWxsLCAnYW5hbHl0aWNzJyk7XG5cbiAgcmV0dXJuIG1ha2VFbnZpcm9ubWVudFByb3ZpZGVycyhbXG4gICAgREVGQVVMVF9BTkFMWVRJQ1NfSU5TVEFOQ0VfUFJPVklERVIsXG4gICAgQU5BTFlUSUNTX0lOU1RBTkNFU19QUk9WSURFUixcbiAgICB7XG4gICAgICBwcm92aWRlOiBBUFBfSU5JVElBTElaRVIsXG4gICAgICB1c2VWYWx1ZTogaXNBbmFseXRpY3NTdXBwb3J0ZWRGYWN0b3J5LmFzeW5jLFxuICAgICAgbXVsdGk6IHRydWUsXG4gICAgfSxcbiAgICB7XG4gICAgICBwcm92aWRlOiBQUk9WSURFRF9BTkFMWVRJQ1NfSU5TVEFOQ0VTLFxuICAgICAgdXNlRmFjdG9yeTogYW5hbHl0aWNzSW5zdGFuY2VGYWN0b3J5KGZuKSxcbiAgICAgIG11bHRpOiB0cnVlLFxuICAgICAgZGVwczogW1xuICAgICAgICBOZ1pvbmUsXG4gICAgICAgIEluamVjdG9yLFxuICAgICAgICDJtUFuZ3VsYXJGaXJlU2NoZWR1bGVycyxcbiAgICAgICAgRmlyZWJhc2VBcHBzLFxuICAgICAgICAuLi5kZXBzLFxuICAgICAgXSxcbiAgICB9LFxuICBdKTtcbn1cbiJdfQ==