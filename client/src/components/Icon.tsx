const P: Record<string, string> = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.3-4.3',
  heart: 'M12 20.5S3.5 15.3 3.5 9A4.7 4.7 0 0 1 12 6.6 4.7 4.7 0 0 1 20.5 9c0 6.3-8.5 11.5-8.5 11.5Z',
  bag: 'M5 8h14l-1 12H6L5 8Zm4 0V7a3 3 0 0 1 6 0v1',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  left: 'm15 5-7 7 7 7',
  right: 'm9 5 7 7-7 7',
  filter: 'M4 6h16M7 12h10M10 18h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
};
export function Icon({ name, size }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
