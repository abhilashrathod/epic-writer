'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Search params as view state, so every view state has a link. `go` sets or clears keys. */
export function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`${pathname}?${p}`, { scroll: false });
  };
  return { params, go };
}
