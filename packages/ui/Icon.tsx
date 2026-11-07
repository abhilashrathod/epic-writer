import type { SVGProps } from 'react';

/** Line icons for entry types: 24×24, stroked with currentColor. */
export const ICONS = {
  circle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c0-4 3.6-7 8-7s8 3 8 7',
  family:
    'M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M12 7v5 M6 17v-5h12v5',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8Z',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6Z',
  mountain: 'M3 20 9 9l4 6 3-4 5 9Z',
  river: 'M3 9c3-2 6 2 9 0s6-2 9 0 M3 15c3-2 6 2 9 0s6-2 9 0',
  planet: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M3 16c2 2 16-5 18-9',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8l-5.4 2.7 1.2-6-4.5-4.2 6.1-.7Z',
  sword: 'M14 4h6v6L10 20l-6-6Z M5 19l-2 2',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  ship: 'M12 3c3 3 4 7 4 11l-4 4-4-4c0-4 1-8 4-11Z M8 14l-3 3 M16 14l3 3',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  scroll: 'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7 M7 4a2 2 0 0 0-2 2v2h2 M9 9h6 M9 13h6',
  gem: 'M6 4h12l3 5-9 11L3 9Z M3 9h18',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z M4 19V5',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...rest }: { name: string } & SVGProps<SVGSVGElement>) {
  const d = ICONS[name as IconName] ?? ICONS.circle;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
