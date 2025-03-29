import React, { useEffect, useRef, useState } from 'react';

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

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-white shadow-lg rounded-md border border-gray-200 py-1 min-w-[150px]"
      style={{ top: position.y, left: position.x }}
    >
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => {
            option.action();
            onClose();
          }}
          className="w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700 text-sm"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
