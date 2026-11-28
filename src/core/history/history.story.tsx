/* Component-test wrapper: the history door (useHistory) on a page; the test calls it through window.historyTest. */
import { useEffect } from 'react';
import { EMPTY_SCREEN, useHistory, type Screen } from './index';

declare global {
  interface Window {
    historyTest: { api: ReturnType<typeof useHistory>; stack(): Screen[] };
  }
}

export function HistoryStory() {
  const h = useHistory(EMPTY_SCREEN);
  useEffect(() => {
    window.historyTest = { api: h, stack: () => window.historyTest.api.stackRef.current };
  });
  return <output id="stack">{JSON.stringify(h.stack)}</output>;
}
