// src/app/components/confirm-modal/confirm-modal.component.ts
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" *ngIf="show" (click)="onCancel()">
      <div class="modal-container" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>{{ title }}</h3>
          <button class="close-btn" (click)="onCancel()">✕</button>
        </div>
        
        <div class="modal-body">
          <p>{{ message }}</p>
        </div>
        
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="onCancel()">
            {{ cancelText }}
          </button>
          <button class="btn btn-danger" (click)="onConfirm()">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    }

    .modal-container {
      background: white;
      border-radius: 16px;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      animation: slideUp 0.3s ease;
    }

    .modal-header {
      padding: 20px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h3 {
      margin: 0;
      color: #1e293b;
      font-size: 18px;
    }

    .close-btn {
      background: transparent;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #64748b;
      padding: 4px 8px;
      border-radius: 8px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: #f1f5f9;
      color: #334155;
    }

    .modal-body {
      padding: 20px;
    }

    .modal-body p {
      margin: 0;
      color: #475569;
      line-height: 1.6;
    }

    .modal-footer {
      padding: 20px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #334155;
    }

    .btn-secondary:hover {
      background: #cbd5e1;
    }

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover {
      background: #dc2626;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @media (max-width: 480px) {
      .modal-container {
        width: 95%;
      }
    }
  `]
})
export class ConfirmModalComponent {
  @Input() show = false;
  @Input() title = 'Confirmar acción';
  @Input() message = '¿Estás seguro de realizar esta acción?';
  @Input() confirmText = 'Confirmar';
  @Input() cancelText = 'Cancelar';
  
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    this.cancel.emit();
  }
}