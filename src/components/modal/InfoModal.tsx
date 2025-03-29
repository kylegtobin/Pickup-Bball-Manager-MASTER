import React from 'react';

interface InfoModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, message, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 pointer-events-auto flex items-center justify-center z-50">
      <div className="bg-blue-50 p-8 rounded-lg shadow-2xl max-w-md w-full mx-4 border-2 border-blue-200">
        <div className="mb-6 text-lg font-medium text-gray-800 text-center">
          {message}
        </div>
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-8 py-2.5 rounded-md min-w-[100px] text-lg shadow-sm"
          >
            Ok
          </button>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
