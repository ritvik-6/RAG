import { useToastStore } from '../../stores/toastStore';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        let icon = <Info className="toast-info-icon shrink-0" size={16} />;
        let typeClass = 'toast-info';

        if (toast.type === 'success') {
          icon = <CheckCircle className="toast-success-icon shrink-0" size={16} />;
          typeClass = 'toast-success';
        } else if (toast.type === 'error') {
          icon = <XCircle className="toast-error-icon shrink-0" size={16} />;
          typeClass = 'toast-error';
        }

        return (
          <div key={toast.id} className={`toast-item ${typeClass}`}>
            {icon}
            <span className="toast-text">{toast.message}</span>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => removeToast(toast.id)}
              title="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
