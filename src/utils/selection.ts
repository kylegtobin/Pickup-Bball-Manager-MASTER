import { GameState, Player, PreviousTeam } from '../types';

export type Selection =
  | { kind: 'player'; player: Player; where: 'champions' | 'challengers' | 'line' | 'group'; groupId?: string }
  | { kind: 'group'; group: PreviousTeam }
  | null;

// What a manual-mode tap has picked up: a single player, or a whole group waiting in line.
export const findSelection = (state: GameState, id: string | null): Selection => {
  if (!id) return null;
  const champ = state.champions.find(p => p.id === id);
  if (champ) return { kind: 'player', player: champ, where: 'champions' };
  const chall = state.challengers.find(p => p.id === id);
  if (chall) return { kind: 'player', player: chall, where: 'challengers' };
  for (const item of state.waitingQueue) {
    if ('players' in item) {
      if (item.id === id) return { kind: 'group', group: item };
      const member = item.players.find(p => p.id === id);
      if (member) return { kind: 'player', player: member, where: 'group', groupId: item.id };
    } else if (item.id === id) {
      return { kind: 'player', player: item, where: 'line' };
    }
  }
  return null;
};

// Shared look for manual-mode targets, so every "Move here" spot reads the same
export const dropSpotClass = (active: boolean, armed: boolean) =>
  `drop-zone rounded-md text-center text-base font-semibold transition-colors duration-150 cursor-pointer ${
    active
      ? 'border-2 border-[#1E3A8A] bg-[#1E3A8A] text-white'
      : armed
        ? 'border-2 border-[#1E3A8A] bg-blue-50 text-[#1E3A8A] ring-2 ring-[#1E3A8A]/20'
        : 'border-2 border-dashed border-[#1E3A8A]/40 bg-[#1E3A8A]/[0.04] text-[#1E3A8A]/80'
  }`;

export const selectedClass = 'ring-4 ring-[#F5B301] bg-amber-50';
