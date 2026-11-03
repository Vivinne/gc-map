export type IconName = 'globe' | 'flag' | 'collapse' | 'expand' | 'down' | 'search' | 'plus' | 'minus' | 'fit' | 'close' | 'left' | 'right' | 'star' | 'starOn' | 'check' | 'filter' | 'map' | 'cards' | 'undo' | 'up' | 'edit' | 'trash' | 'download' | 'upload' | 'me';

/** Line icons drawn on a 16 px grid; colour follows the text colour */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false } as const;
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9 } as const;
  switch (name) {
    case 'globe':
      return (<svg {...p}><circle cx="8" cy="8" r="6.3" {...s} strokeWidth={1.6} /><path d="M1.7 8h12.6M8 1.7c2.2 2.3 2.2 10.3 0 12.6M8 1.7c-2.2 2.3-2.2 10.3 0 12.6" {...s} strokeWidth={1.4} /></svg>);
    case 'flag':
      return (<svg {...p}><path d="M3.5 14.5V2M3.5 2.5h9l-2 3 2 3h-9" {...s} strokeWidth={1.7} strokeLinejoin="round" /></svg>);
    case 'collapse':
      return (<svg {...p}><path d="M3 11h10" {...s} strokeWidth={2} /></svg>);
    case 'expand':
      return (<svg {...p}><rect x="3" y="3" width="10" height="10" {...s} strokeWidth={1.8} /></svg>);
    case 'down':
      return (<svg {...p}><path d="M3 6l5 5 5-5" {...s} /></svg>);
    case 'search':
      return (<svg {...p}><circle cx="6.8" cy="6.8" r="4.8" {...s} /><path d="M10.4 10.4 14.5 14.5" {...s} strokeWidth={2.1} /></svg>);
    case 'plus':
      return (<svg {...p}><path d="M8 2v12M2 8h12" {...s} /></svg>);
    case 'minus':
      return (<svg {...p}><path d="M2 8h12" {...s} /></svg>);
    case 'fit':
      return (<svg {...p}><path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4" {...s} /></svg>);
    case 'close':
      return (<svg {...p}><path d="M3 3l10 10M13 3 3 13" {...s} /></svg>);
    case 'left':
      return (<svg {...p}><path d="M10 2.5 4.5 8l5.5 5.5" {...s} /></svg>);
    case 'right':
      return (<svg {...p}><path d="M6 2.5 11.5 8 6 13.5" {...s} /></svg>);
    case 'star':
      return (<svg {...p}><path d="M8 1.6l1.9 4.1 4.5.5-3.4 3 1 4.4L8 11.4l-4 2.2 1-4.4-3.4-3 4.5-.5z" {...s} strokeWidth={1.5} strokeLinejoin="round" /></svg>);
    case 'starOn':
      return (<svg {...p}><path d="M8 1.6l1.9 4.1 4.5.5-3.4 3 1 4.4L8 11.4l-4 2.2 1-4.4-3.4-3 4.5-.5z" fill="currentColor" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /></svg>);
    case 'check':
      return (<svg {...p}><path d="M2.5 8.5 6 12l7.5-8.5" {...s} strokeWidth={2.1} /></svg>);
    case 'filter':
      return (<svg {...p}><path d="M1.5 3.5h13M4 8h8M6.5 12.5h3" {...s} /></svg>);
    case 'map':
      return (<svg {...p}><path d="M1.5 4l4-1.7 5 1.7 4-1.7v9.7l-4 1.7-5-1.7-4 1.7zM5.5 2.3v9.7M10.5 4v9.7" {...s} strokeWidth={1.5} strokeLinejoin="round" /></svg>);
    case 'cards':
      return (<svg {...p}><rect x="2" y="4.5" width="9.5" height="9.5" {...s} strokeWidth={1.5} /><path d="M4.5 2h9.5v9.5" {...s} strokeWidth={1.5} /></svg>);
    case 'up':
      return (<svg {...p}><path d="M2.5 10.5 8 5l5.5 5.5" {...s} /></svg>);
    case 'edit':
      return (<svg {...p}><path d="M10.5 2.5l3 3-8 8H2.5v-3z" {...s} strokeWidth={1.6} strokeLinejoin="round" /></svg>);
    case 'trash':
      return (<svg {...p}><path d="M2 4h12M6 4V2h4v2M3.5 4l1 10h7l1-10" {...s} strokeWidth={1.6} strokeLinejoin="round" /></svg>);
    case 'download':
      return (<svg {...p}><path d="M8 1.5v9M4 7l4 4 4-4M2 14.5h12" {...s} strokeWidth={1.7} /></svg>);
    case 'upload':
      return (<svg {...p}><path d="M8 11V2M4 5.5l4-4 4 4M2 14.5h12" {...s} strokeWidth={1.7} /></svg>);
    case 'me':
      return (<svg {...p}><circle cx="8" cy="5.2" r="3" {...s} strokeWidth={1.6} /><path d="M2.2 14.8c.8-3 3-4.6 5.8-4.6s5 1.6 5.8 4.6" {...s} strokeWidth={1.6} /></svg>);
    case 'undo':
      return (<svg {...p}><path d="M5 3.5 2 6.5l3 3M2.5 6.5H10a4 4 0 0 1 0 8H7" {...s} strokeWidth={1.6} /></svg>);
  }
}
