import { RefObject, useEffect } from 'react';
import { isShown } from './visibility';

// Only the most recently opened dialog keeps focus
const stack: HTMLElement[] = [];

const focusables = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(x => x.offsetParent !== null || x === document.activeElement);

// Moves focus into a dialog, keeps Tab inside it, and puts focus back where it was on close
export const useDialogFocus = (ref: RefObject<HTMLElement>, active = true) => {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const before = document.activeElement as HTMLElement | null;
    stack.push(el);
    // A dialog inside the hidden real night (behind an open sample) never takes focus
    if (isShown(el) && !el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(el)[0] ?? el;
      first.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const top = [...stack].reverse().find(isShown);
      if (top !== el) return;
      const list = focusables(el);
      if (list.length === 0) { e.preventDefault(); el.focus(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const at = document.activeElement as HTMLElement | null;
      if (!at || !el.contains(at)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const i = stack.lastIndexOf(el);
      if (i >= 0) stack.splice(i, 1);
      if (before && document.contains(before)) before.focus();
    };
  }, [ref, active]);
};
