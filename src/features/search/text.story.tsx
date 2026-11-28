/* Component-test wrapper: the search text and recents doors (useSearchText, useRecent). */
import { useEffect, useState } from 'react';
import { useRecent, useSearchText } from './index';

declare global {
  interface Window {
    textTest: { text: ReturnType<typeof useSearchText>; recent: ReturnType<typeof useRecent>; setScreen(s: string): void };
  }
}

export function TextStory({ screen: first = 'preview', sent = '' }: { screen?: string; sent?: string }) {
  const [screen, setScreen] = useState(first);
  const text = useSearchText(screen, sent);
  const recent = useRecent();
  useEffect(() => {
    window.textTest = { text, recent, setScreen };
  });
  return <output id="text">{JSON.stringify({ draft: text.draft, texts: recent.texts, buildings: recent.buildings })}</output>;
}
