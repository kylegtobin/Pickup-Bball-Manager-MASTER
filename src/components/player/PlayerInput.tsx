import React, { useState, KeyboardEvent, FormEvent } from 'react';
import { useGame } from '../../context/GameContext';

const PlayerInput: React.FC = () => {
  const { addPlayer, removePlayer } = useGame();
  const [newPlayerName, setNewPlayerName] = useState('');
  const [removePlayerName, setRemovePlayerName] = useState('');

  const handleAddPlayer = (e: FormEvent) => {
    e.preventDefault();
    if (newPlayerName.trim()) {
      addPlayer(newPlayerName);
      setNewPlayerName('');
    }
  };

  const handleRemovePlayer = (e: FormEvent) => {
    e.preventDefault();
    if (removePlayerName.trim()) {
      removePlayer(removePlayerName);
      setRemovePlayerName('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, action: 'add' | 'remove') => {
    if (e.key === 'Enter') {
      if (action === 'add') {
        handleAddPlayer(e);
      } else {
        handleRemovePlayer(e);
      }
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Player Management</h2>
      
      {/* Add Player */}
      <div className="mb-4">
        <label htmlFor="addPlayer" className="block text-sm font-medium text-gray-700 mb-1">
          Enter New Player
        </label>
        <div className="flex">
          <input
            id="addPlayer"
            type="text"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'add')}
            className="flex-grow px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter player name"
          />
          <button
            onClick={handleAddPlayer}
            className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add Player
          </button>
        </div>
      </div>

      {/* Remove Player */}
      <div className="mb-4">
        <label htmlFor="removePlayer" className="block text-sm font-medium text-gray-700 mb-1">
          Remove Player
        </label>
        <div className="flex">
          <input
            id="removePlayer"
            type="text"
            value={removePlayerName}
            onChange={(e) => setRemovePlayerName(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'remove')}
            className="flex-grow px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter player name to remove"
          />
          <button
            onClick={handleRemovePlayer}
            className="px-4 py-2 bg-red-600 text-white rounded-r-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Remove Player
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayerInput;
