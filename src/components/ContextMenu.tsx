import React, { useEffect, useRef } from 'react';

type MenuOption = {
  label: string;
  action: () => void;
};

interface ContextMenuProps {
  options: MenuOption[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ options, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!position) return null;

  // Ensure menu stays within viewport
  const menuStyle = {
    top: position.y,
    left: position.x,
    maxHeight: 'calc(100vh - ' + position.y + 'px)', // Prevent extending beyond bottom of viewport
    maxWidth: 'calc(100vw - ' + position.x + 'px)' // Prevent extending beyond right of viewport
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white shadow-lg rounded-md border border-gray-200 py-1 min-w-[150px]"
      style={menuStyle}
    >
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => {
            option.action();
            onClose();
          }}
          className={`w-full text-center px-4 py-2 hover:bg-gray-100 text-base ${
            option.label.startsWith('Remove') ? 'text-red-600 font-bold' : 'text-gray-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
