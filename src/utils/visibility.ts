import type React from 'react';

// The real night stays mounted (hidden) behind an open sample, so "is a dialog open?" must only
// count dialogs someone can actually see.
export const isShown = (el: Element | null): boolean => !!el && el.getClientRects().length > 0;

// A visible dialog other than court view is open (court view keeps the scoring keys working)
export const blockingDialogOpen = (): boolean =>
  Array.from(document.querySelectorAll('[aria-modal="true"]:not([aria-label="Court view"])')).some(isShown);

// Someone is typing in a box
export const typing = (): boolean => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
};

// Enter or Space on a tappable element that isn't a real button
export const activateOnKey = (fn?: () => void) => (e: React.KeyboardEvent) => {
  if (!fn) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};
