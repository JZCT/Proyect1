// src/app/components/skeleton/skeleton.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-wrapper" [class]="type">
      <div class="skeleton-item" *ngFor="let item of [].constructor(count); let i = index" 
           [style.animationDelay]="i * 0.1 + 's'">
        <div class="skeleton-line" *ngFor="let line of [].constructor(lines); let j = index"></div>
      </div>
    </div>
  `,
  styles: [`
    .skeleton-wrapper {
      padding: 16px;
      width: 100%;
    }

    .skeleton-item {
      margin-bottom: 16px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-line {
      height: 16px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 4px;
      margin-bottom: 8px;
    }

    .skeleton-line:last-child {
      margin-bottom: 0;
    }

    /* Variantes */
    :host-context(.card) .skeleton-line:first-child {
      height: 24px;
      width: 70%;
    }

    :host-context(.avatar) .skeleton-line:first-child {
      width: 50px;
      height: 50px;
      border-radius: 50%;
    }

    :host-context(.table) .skeleton-line {
      height: 20px;
    }

    /* Tamaños específicos por tipo */
    .card .skeleton-line:first-child {
      height: 24px;
      width: 70%;
    }

    .avatar .skeleton-line:first-child {
      width: 50px;
      height: 50px;
      border-radius: 50%;
    }

    .table .skeleton-line {
      height: 20px;
    }

    /* Grid para cards */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
    }

    .grid .skeleton-item {
      background: #f8fafc;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
    }

    /* Dark theme support */
    :host-context(body.dark-theme) .skeleton-line {
      background: linear-gradient(90deg, #3d3d3d 25%, #4d4d4d 50%, #3d3d3d 75%);
    }

    :host-context(body.dark-theme) .grid .skeleton-item {
      background: #2d2d2d;
      border-color: #4d4d4d;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class SkeletonComponent {
  @Input() type: 'card' | 'list' | 'table' | 'avatar' | 'grid' = 'list';
  @Input() count: number = 3;
  @Input() lines: number = 3;
}