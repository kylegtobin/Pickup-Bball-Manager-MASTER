import React, { useEffect, useRef } from 'react';

interface InfoModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, message, onClose }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      // Focus without visual indication
      buttonRef.current.focus({ preventScroll: true });
      buttonRef.current.style.outline = 'none';
      buttonRef.current.style.boxShadow = 'none';
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (isOpen && (event.key === 'Enter' || event.key === 'Escape')) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4 relative border-4 border-gray-900">
        <div className="text-center mb-6">
          <p className="text-lg">{message}</p>
        </div>
        <div className="flex justify-center">
          <button
            ref={buttonRef}
            onClick={onClose}
            className="px-8 py-3 text-lg font-semibold rounded-lg bg-gray-900 hover:bg-black text-white transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            style={{ outline: 'none', boxShadow: 'none' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
