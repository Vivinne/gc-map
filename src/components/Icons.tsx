export type IconName = 'search' | 'plus' | 'minus' | 'close' | 'left' | 'grid' | 'clock';

/** Line icons drawn on a 16 px grid; colour follows the text colour */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false } as const;
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9 } as const;
  switch (name) {
    case 'grid':
      return (<svg {...p}><rect x="1.5" y="1.5" width="4.5" height="4.5" {...s} strokeWidth={1.6} /><rect x="10" y="1.5" width="4.5" height="4.5" {...s} strokeWidth={1.6} /><rect x="1.5" y="10" width="4.5" height="4.5" {...s} strokeWidth={1.6} /><rect x="10" y="10" width="4.5" height="4.5" {...s} strokeWidth={1.6} /></svg>);
    case 'clock':
      return (<svg {...p}><circle cx="8" cy="8" r="6" {...s} strokeWidth={1.6} /><path d="M8 4.5V8l2.5 1.6" {...s} strokeWidth={1.6} /></svg>);
    case 'search':
      return (<svg {...p}><circle cx="6.8" cy="6.8" r="4.8" {...s} /><path d="M10.4 10.4 14.5 14.5" {...s} strokeWidth={2.1} /></svg>);
    case 'plus':
      return (<svg {...p}><path d="M8 2v12M2 8h12" {...s} /></svg>);
    case 'minus':
      return (<svg {...p}><path d="M2 8h12" {...s} /></svg>);
    case 'close':
      return (<svg {...p}><path d="M3 3l10 10M13 3 3 13" {...s} /></svg>);
    case 'left':
      return (<svg {...p}><path d="M10 2.5 4.5 8l5.5 5.5" {...s} /></svg>);
  }
}
