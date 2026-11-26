'use client';

import { useEffect } from 'react';

/** Sends the visitor to another address with its query: at once with script, and by a meta refresh without it */
export default function Redirect({ to }: { to: string }) {
  // the old address's search, card and map view come along (B7)
  useEffect(() => {
    window.location.replace(to + window.location.search + window.location.hash);
  }, [to]);
  return (
    <>
      {/* without script only: a refresh at once would leave before the script carries the query along */}
      <noscript>
        <meta httpEquiv="refresh" content={`0; url=${to}`} />
      </noscript>
      <p className="moved">
        Moved to <a href={to}>GC Atlas</a>.
      </p>
    </>
  );
}
