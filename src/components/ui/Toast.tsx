import React, { createContext, useContext, useState, useCallback } from 'react';

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeToast, setActiveToast] = useState<Toast | null>(null);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setActiveToast({ message, type });
    setTimeout(() => setActiveToast(null), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {activeToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '1rem',
            backgroundColor: activeToast.type === 'error' ? '#fee2e2' : 
                           activeToast.type === 'success' ? '#dcfce7' : '#e0f2fe',
            borderRadius: '0.375rem',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            zIndex: 50,
          }}
        >
          {activeToast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
