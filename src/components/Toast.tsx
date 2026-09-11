import { useAtomValue } from 'jotai';
import { meadowUiAtom } from '../state/meadow';

export function Toast() {
  const { toast } = useAtomValue(meadowUiAtom);
  return (
    <div id="toast" className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
      {toast}
    </div>
  );
}
