import Link from 'next/link';

/** Address not on the site (404): a way back to the map (N8) */
export default function NotFound() {
  return (
    <main className="moved">
      <h1>Page not found</h1>
      <p>
        <Link href="/">Back to the map</Link>
      </p>
    </main>
  );
}
