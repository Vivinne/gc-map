/* Component-test wrapper: the search box with every prop filled (spread props do not cross into the test page). */
import { SearchBox } from './index';

const noop = () => {};
type Props = Parameters<typeof SearchBox>[0];

export function Box(p: Partial<Omit<Props, 'ref'>>) {
  return <SearchBox value="" showClear={false} categoryOpen={false} onFocus={noop} onChange={noop} onSubmit={noop} onClear={noop} onCategory={noop} {...p} />;
}
