// src/app/services/theme.service.ts
import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private currentTheme: 'light' | 'dark' = 'light';

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.loadTheme();
  }

  private loadTheme() {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      this.setTheme(savedTheme);
    } else {
      // Detectar preferencia del sistema
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setTheme(prefersDark ? 'dark' : 'light');
    }
  }

  toggleTheme() {
    this.setTheme(this.currentTheme === 'light' ? 'dark' : 'light');
  }

  setTheme(theme: 'light' | 'dark') {
    this.currentTheme = theme;
    
    if (theme === 'dark') {
      this.renderer.addClass(document.body, 'dark-theme');
    } else {
      this.renderer.removeClass(document.body, 'dark-theme');
    }
    
    localStorage.setItem('theme', theme);
  }

  getTheme() {
    return this.currentTheme;
  }

  isDark() {
    return this.currentTheme === 'dark';
  }
}