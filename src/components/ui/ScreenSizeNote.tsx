import React from 'react';
import { readCloudSwitch, runnerOnThisPhone, setRunnerOnThisPhone } from '../../cloud/config';

// The app is built for a laptop or tablet at the court. On narrow screens we show
// a one-line heads-up. It sits in the normal page flow (no overlay), can be
// dismissed, and never renders on screens 700px and wider.
const NARROW_QUERY = '(max-width: 699px)';

const isNarrow = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;

const ScreenSizeNote: React.FC = () => {
  const [narrow, setNarrow] = React.useState<boolean>(isNarrow);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mql.matches);
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  if (!narrow || dismissed) return null;

  return (
    <div role="note" className="bg-gray-900 text-white">
      <div className="flex items-start gap-3 px-4 py-3">
        <p className="flex-1 text-sm leading-snug">
          Pickup Basketball Manager is built for a laptop or tablet at the court. For the best view, open it on a bigger screen.
          {readCloudSwitch() && runnerOnThisPhone() && (
            <>
              {' '}
              <button className="underline font-semibold" onClick={() => { setRunnerOnThisPhone(false); window.location.assign(window.location.pathname); }}>
                Just following the run?
              </button>
            </>
          )}
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 text-white/80 hover:text-white text-xl leading-none px-1"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default ScreenSizeNote;
