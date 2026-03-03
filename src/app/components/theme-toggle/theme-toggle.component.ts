// src/app/components/theme-toggle/theme-toggle.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button class="theme-toggle" (click)="toggleTheme()" [attr.aria-label]="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'">
      <span class="sun" *ngIf="!isDark">☀️</span>
      <span class="moon" *ngIf="isDark">🌙</span>
    </button>
  `,
  styles: [`
    .theme-toggle {
      background: transparent;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }

    .theme-toggle:hover {
      transform: rotate(15deg);
      background: rgba(255, 255, 255, 0.2);
    }

    .sun, .moon {
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.5); }
      to { opacity: 1; transform: scale(1); }
    }
  `]
})
export class ThemeToggleComponent implements OnInit {
  isDark = false;

  constructor(private themeService: ThemeService) {}

  ngOnInit() {
    this.isDark = this.themeService.isDark();
  }

  toggleTheme() {
    this.themeService.toggleTheme();
    this.isDark = this.themeService.isDark();
  }
}