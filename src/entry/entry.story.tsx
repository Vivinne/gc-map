/* Component test stories for A2 entry: a part that fails as a running app can fail (an ordinary error, a missing script file). */
import Guard from './Guard';

function Fail({ kind }: { kind: 'error' | 'chunk' }): never {
  if (kind === 'chunk') {
    const e = new Error('Loading chunk 7 failed.');
    e.name = 'ChunkLoadError';
    throw e;
  }
  throw new Error('Something broke');
}

export function GuardedFailure({ kind }: { kind: 'error' | 'chunk' | 'none' }) {
  return <Guard>{kind === 'none' ? <p>App is running</p> : <Fail kind={kind} />}</Guard>;
}
