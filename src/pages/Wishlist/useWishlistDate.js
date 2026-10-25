import { useEffect, useState } from 'react';

/** Reschedule at local midnight (including DST) and after background suspension. */
export default function useWishlistDate() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer;
    const refresh = () => {
      const current = new Date();
      setNow(current);
      clearTimeout(timer);
      const midnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - current.getTime() + 1);
    };
    const onVisible = () => { if (document.visibilityState !== 'hidden') refresh(); };
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return now;
}
