'use client';

import { useEffect } from 'react';

/** Sends the visitor to another address: at once with script, and by a meta refresh without it */
export default function Redirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${to}`} />
      <p className="moved">
        Moved to <a href={to}>GC Atlas</a>.
      </p>
    </>
  );
}
