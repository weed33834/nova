'use client';

import { useEffect } from 'react';
import { preloadData } from '@/lib/utils/preloader';
import { cacheFetch } from '@/lib/utils/cache';

export function PreloaderInit() {
  useEffect(() => {
    const loadServerProviders = () =>
      cacheFetch(
        'server-providers',
        async () => {
          try {
            const res = await fetch('/api/server-providers');
            return res.ok ? res.json() : null;
          } catch {
            return null;
          }
        },
        300_000,
      );

    preloadData(loadServerProviders);

    setTimeout(() => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = '/logo-horizontal.svg';
      document.head.appendChild(link);
    }, 2000);
  }, []);

  return null;
}
