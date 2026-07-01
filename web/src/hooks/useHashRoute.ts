// Minimal hash router: works on static hosting with zero config
// ("/#/poll/2"). Segments are decoded and empty parts dropped.

import { useEffect, useState } from 'react';

export interface HashRoute {
  segments: string[];
  raw: string;
}

function parseHash(): HashRoute {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const segments = raw
    .split('/')
    .filter((s) => s.length > 0)
    .map(decodeURIComponent);
  return { segments, raw };
}

export function useHashRoute(): HashRoute {
  const [route, setRoute] = useState<HashRoute>(parseHash);

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith('/') ? `#${to}` : `#/${to}`;
}
