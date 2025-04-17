'use client';

import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    // Avoid running on the server
    if (typeof window !== 'undefined') {
      const media = window.matchMedia(query);
      
      // Initial check
      setMatches(media.matches);
      
      // Add listener for changes
      const listener = (e) => setMatches(e.matches);
      media.addEventListener('change', listener);
      
      // Cleanup
      return () => media.removeEventListener('change', listener);
    }
  }, [query]);
  
  return matches;
}