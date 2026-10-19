import React, { useEffect, useRef } from 'react';
import { useDialogFocus } from '../../utils/useDialogFocus';

interface ContentModalProps {
  isOpen: boolean;
  title: string;
  content: React.ReactNode;
  onClose: () => void;
}

const ContentModal: React.FC<ContentModalProps> = ({ isOpen, title, content, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  // Marked as a dialog so the scoreboard keys (Q/W/O/P, Space) stay quiet while it's open, and Tab stays inside
  useDialogFocus(modalRef, isOpen);
  
  // Handle escape key press to close modal
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isOpen, onClose]);
  
  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="outline-none bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 relative border-2 border-gray-300 max-h-[90vh] flex flex-col"
      >
        {/* Header with title and close button */}
        <div className="flex justify-between items-center border-b-2 border-gray-300 p-6 bg-gray-50">
          <div className="w-8"></div> {/* Empty div for spacing */}
          {['My Story', 'Game Format & Rules', 'Site User Guide'].includes(title) ? (
            <div className="w-full flex flex-col items-center">
              <h2
                className="text-center"
                style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontStyle: 'italic', fontWeight: 900, fontSize: 'clamp(30px, 4vw, 44px)', lineHeight: 1, color: '#0F1B2D' }}
              >
                {title}
              </h2>
              <span aria-hidden="true" className="mt-2 block h-1.5 w-16 rounded-full" style={{ background: 'linear-gradient(90deg, #E85A00 50%, #1E3A8A 50%)' }} />
            </div>
          ) : (
            <h2 className="text-3xl font-bold text-gray-800 text-center">{title}</h2>
          )}
          <button 
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="text-gray-500 hover:text-gray-700 focus:outline-none transition-colors duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content area with scrolling */}
        {/* Focus starts here so Page Down, End and the arrow keys scroll the guide; Tab still reaches Close and any links or video */}
        <div className="p-8 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3A8A]" tabIndex={0} data-autofocus role="region" aria-label={`${title} content`}>
          {content}
        </div>
      </div>
    </div>
  );
};

export default ContentModal;
