import type { Metadata } from 'next';
import Redirect from '../../components/Redirect';

// The old GC Atlas address (/gc-map/atlas/) moved to the site root: this page sends visitors there
export const metadata: Metadata = {
  title: 'GC Atlas',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://vivinne.github.io/gc-map/' },
};

export default function AtlasPage() {
  return <Redirect to="../" />;
}
