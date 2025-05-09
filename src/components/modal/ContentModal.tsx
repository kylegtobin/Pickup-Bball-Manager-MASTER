import React, { useEffect, useRef } from 'react';

interface ContentModalProps {
  isOpen: boolean;
  title: string;
  content: React.ReactNode;
  onClose: () => void;
}

const ContentModal: React.FC<ContentModalProps> = ({ isOpen, title, content, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  
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
        className="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 relative border-2 border-gray-300 max-h-[90vh] flex flex-col"
      >
        {/* Header with title and close button */}
        <div className="flex justify-between items-center border-b-2 border-gray-300 p-6 bg-gray-50">
          <div className="w-8"></div> {/* Empty div for spacing */}
          {['My Story', 'Game Format & Rules', 'Site User Guide'].includes(title) ? (
            <div className="w-full flex flex-col items-center">
              <span
                className="text-5xl font-extrabold tracking-widest uppercase text-center"
                style={{
                  fontFamily: "'Montserrat', 'Arial Black', 'Arial Bold', sans-serif",
                  background: 'linear-gradient(90deg, #2d064a 60%, #5d3fd3 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '0.22em',
                  display: 'block',
                  textShadow: '0 2px 6px rgba(44,0,70,0.18)',
                  position: 'relative',
                }}
              >
                {title.toUpperCase()}
                <span style={{
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(120deg, rgba(255,255,255,0.18) 20%, rgba(255,255,255,0.01) 80%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  pointerEvents: 'none',
                  zIndex: 1,
                  display: 'block',
                }} />
              </span>
            </div>
          ) : (
            <h2 className="text-3xl font-bold text-gray-800 text-center">{title}</h2>
          )}
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none transition-colors duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content area with scrolling */}
        <div className="p-8 overflow-y-auto">
          {content}
        </div>
      </div>
    </div>
  );
};

export default ContentModal;
