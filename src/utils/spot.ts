import { GameState } from '../types';
import { isPreviousTeam } from '../context/GameContext';
import { calculateGamesBehindIndividual } from './waitTimeUtils';

// Where a player is right now, in a few words: "You're on the Champions", "2 games away"
export const describeSpot = (state: GameState, playerId: string): string | null => {
  if (state.champions.some(p => p.id === playerId)) return "You're on the Champions";
  if (state.challengers.some(p => p.id === playerId)) return "You're on the Challengers";
  let ahead = 0;
  for (const item of state.waitingQueue) {
    if (isPreviousTeam(item)) {
      if (item.players.some(p => p.id === playerId)) break;
      ahead += item.players.length;
    } else {
      if (item.id === playerId) break;
      ahead += 1;
    }
  }
  const inLine = state.waitingQueue.some(item =>
    isPreviousTeam(item) ? item.players.some(p => p.id === playerId) : item.id === playerId
  );
  if (!inLine) return null;
  const teamsFull = state.champions.length === 5 && state.challengers.length === 5;
  if (!teamsFull) return "You're in line. Teams fill as players sign in.";
  const games = calculateGamesBehindIndividual(ahead);
  if (games === 1) return "You're up next game";
  return `${games} games away`;
};
