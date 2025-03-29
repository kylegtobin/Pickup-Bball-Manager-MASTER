import React, { useEffect } from 'react';

interface ContextMenuProps {
  position: {
    x: number;
    y: number;
  };
  onClose: () => void;
  options: {
    label: string;
    action: () => void;
  }[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ position, onClose, options }) => {
  useEffect(() => {
    const handleClickOutside = () => {
      onClose();
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      className="fixed bg-white rounded shadow-lg border border-gray-200 py-1 z-50"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {options.map((option, index) => (
        <button
          key={index}
          className="block w-full text-left px-4 py-2 hover:bg-gray-100"
          onClick={() => {
            option.action();
            onClose();
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
