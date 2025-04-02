import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
}

const Switch: React.FC<SwitchProps> = ({ checked, onChange, className = '' }) => {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`${className} ${
        checked ? 'bg-blue-600' : 'bg-gray-700'
      } relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 border-2 border-gray-400`}
    >
      <span
        className={`${
          checked ? 'translate-x-8' : 'translate-x-1'
        } inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-md`}
      />
    </button>
  );
};

export default Switch;
