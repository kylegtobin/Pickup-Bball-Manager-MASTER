import { WaitingQueueItem, Player, PreviousTeam, GamesBehindCategory, WaitTimeInfo } from '../types';
import { isPreviousTeam } from '../context/GameContext';

// Color constants for games behind categories
const COLORS = {
  '1': '#4CAF50',         // Green
  '1-2': '#8BC34A',       // Light Green
  '2': '#CDDC39',         // Light Yellow
  '2-3': '#FFC107',       // Medium Yellow
  '3': '#FF9800',         // Light Red/Orange
  '3-4': '#FF5722',       // Red
  '4': '#F44336',         // Darker Red
  '4-5': '#D32F2F',       // Darkest Red
  '5+': '#B71C1C',        // Solid Red
};

// Base wait times in minutes for each games behind category
const BASE_WAIT_TIMES: Record<GamesBehindCategory, number> = {
  '1': 12,
  '1-2': 18,
  '2': 24,
  '2-3': 30,
  '3': 36,
  '3-4': 42,
  '4': 48,
  '4-5': 54,
  '5+': 60
};

/**
 * Calculate how many games behind an individual player is
 * @param positionsAhead Number of positions ahead in the queue
 * @returns The games behind category (1, 1-2, 2, etc.)
 */
export const calculateGamesBehindIndividual = (positionsAhead: number): GamesBehindCategory => {
  const gamesBehind = 1 + Math.floor(positionsAhead / 5);
  
  if (gamesBehind >= 5) {
    return '5+';
  }
  
  return gamesBehind as GamesBehindCategory;
};

/**
 * Calculate how many games behind a previous team is
 * @param positionsAhead Number of positions ahead in the queue
 * @param teamSize Size of the team (how many players)
 * @returns The games behind category (1, 1-2, 2, etc.)
 */
export const calculateGamesBehindTeam = (positionsAhead: number, teamSize: number): GamesBehindCategory => {
  const alpha = 1 + Math.floor(positionsAhead / 5);
  
  if (alpha >= 5) {
    return '5+';
  }
  
  // Check if team fits entirely within a block
  if (positionsAhead + teamSize <= 5 * alpha) {
    return alpha as GamesBehindCategory;
  } 
  // Check if team crosses one boundary
  else if (positionsAhead + teamSize <= 5 * (alpha + 1)) {
    return `${alpha}-${alpha + 1}` as GamesBehindCategory;
  } 
  // Team bridges two entire blocks (rare)
  else {
    // Safety check for valid categories
    if (alpha + 2 >= 5) {
      return '5+';
    }
    return `${alpha}-${alpha + 2}` as GamesBehindCategory;
  }
};

/**
 * Calculate wait time information for a queue item
 * @param waitingQueue The current waiting queue
 * @param currentIndex Index of the item in the queue
 * @param elapsedMinutes Minutes elapsed in the current game
 * @returns Wait time information including games behind, minutes, and color
 */
export const calculateWaitTimeInfo = (
  waitingQueue: WaitingQueueItem[], 
  currentIndex: number,
  elapsedMinutes: number
): WaitTimeInfo => {
  // Safety check - ensure we're within valid bounds
  if (currentIndex < 0 || currentIndex >= waitingQueue.length) {
    // Return a default value for invalid indices
    return {
      gamesBehind: 1 as GamesBehindCategory,
      waitMinutes: 12,
      color: '#4CAF50' // Green
    };
  }

  // Count total positions ahead
  let positionsAhead = 0;
  
  for (let i = 0; i < currentIndex; i++) {
    const item = waitingQueue[i];
    if (isPreviousTeam(item)) {
      positionsAhead += item.players.length;
    } else {
      positionsAhead += 1;
    }
  }
  
  // Get the current item
  const currentItem = waitingQueue[currentIndex];
  let gamesBehind: GamesBehindCategory;
  
  // Calculate games behind based on item type
  if (isPreviousTeam(currentItem)) {
    gamesBehind = calculateGamesBehindTeam(positionsAhead, currentItem.players.length);
  } else {
    gamesBehind = calculateGamesBehindIndividual(positionsAhead);
  }
  
  // Get base wait time
  const baseWaitTime = BASE_WAIT_TIMES[gamesBehind];
  
  // Subtract elapsed minutes
  const adjustedWaitTime = Math.max(0, baseWaitTime - elapsedMinutes);
  
  // Get color for the category
  const color = COLORS[gamesBehind];
  
  return {
    gamesBehind,
    waitMinutes: adjustedWaitTime,
    color
  };
};

/**
 * Format wait time for display
 * @param waitMinutes Minutes to wait
 * @returns Formatted wait time string (e.g., "24 min" or "1 Hour+")
 */
export const formatWaitTime = (waitMinutes: number): string => {
  if (waitMinutes >= 60) {
    return "1 Hour+";
  }
  return `${waitMinutes} min`;
};
