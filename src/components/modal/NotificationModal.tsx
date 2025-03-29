import React from 'react';

interface NotificationModalProps {
  message: string;
  onClose: () => void;
  isOpen: boolean;
}

const NotificationModal: React.FC<NotificationModalProps> = ({ message, onClose, isOpen }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
        <h3 className="text-xl font-semibold mb-4">Notification</h3>
        <p className="mb-6">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Ok
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;
