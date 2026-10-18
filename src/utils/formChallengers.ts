import { Player, PreviousTeam, WaitingQueueItem } from '../types';

const isGroup = (item: WaitingQueueItem): item is PreviousTeam =>
  typeof item === 'object' && item !== null && 'type' in item && item.type === 'PreviousTeam';

export interface ChallengerPlan {
  // Players who are definitely in, in line order
  picked: Player[];
  // Set when the next group in line is bigger than the open spots
  shootout: { team: PreviousTeam; spots: number } | null;
  // Everything still waiting after the picked players (and after the shootout group, if any)
  rest: WaitingQueueItem[];
}

/**
 * The one place that decides who fills the Challengers from the front of the line.
 * Individuals are taken one at a time. A group is taken whole if it fits the open spots.
 * If the next group is bigger than the open spots, that group shoots for them.
 * Used by the game rules (GameContext) and by the court view's "next up" preview.
 */
export const planChallengers = (queue: WaitingQueueItem[], size = 5): ChallengerPlan => {
  const picked: Player[] = [];
  let i = 0;
  while (picked.length < size && i < queue.length) {
    const item = queue[i];
    if (!isGroup(item)) {
      picked.push({ ...item });
      i++;
      continue;
    }
    const spots = size - picked.length;
    if (item.players.length <= spots) {
      picked.push(...item.players.map(p => ({ ...p })));
      i++;
      continue;
    }
    return { picked, shootout: { team: item, spots }, rest: queue.slice(i + 1) };
  }
  return { picked, shootout: null, rest: queue.slice(i) };
};

export const LOSERS_GROUP_ID = '__this_games_losers__';

export interface NextUpPreview {
  picked: Player[]; // real players who are definitely next
  losersFill: number; // spots this game's losers take without a shootout (0 if none)
  shootout: { spots: number; players: Player[] | null } | null; // players null = this game's losers shoot
}

/**
 * What happens after the current game ends, before anyone knows who wins.
 * The losing team goes to the back of the line as a group, then the Challengers
 * are filled with planChallengers, the same as the real rules.
 */
export const previewNextUp = (queue: WaitingQueueItem[]): NextUpPreview => {
  const losers: PreviousTeam = {
    type: 'PreviousTeam',
    id: LOSERS_GROUP_ID,
    players: Array.from({ length: 5 }, (_, n) => ({ id: `${LOSERS_GROUP_ID}-${n}`, name: '' })),
  };
  const plan = planChallengers([...queue, losers]);
  const real = plan.picked.filter(p => !p.id.startsWith(LOSERS_GROUP_ID));
  const losersFill = plan.picked.length - real.length;
  let shootout: NextUpPreview['shootout'] = null;
  if (plan.shootout) {
    shootout = {
      spots: plan.shootout.spots,
      players: plan.shootout.team.id === LOSERS_GROUP_ID ? null : plan.shootout.team.players,
    };
  }
  return { picked: real, losersFill, shootout };
};
