import { useEffect, useState } from 'react';
import type { Snapshot } from '../domain/state';
import { initDb, loadSnapshot, subscribe } from './db';

export interface SnapshotState { snap?: Snapshot; error?: string; loading: boolean }

export function useSnapshot(): SnapshotState {
  const [state, setState] = useState<SnapshotState>({ loading: true });
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await initDb();
        const snap = await loadSnapshot();
        if (!cancelled) setState({ snap, loading: false });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    };
    void run();
    const unsubscribe = subscribe(() => void run());
    return () => { cancelled = true; unsubscribe(); };
  }, []);
  return state;
}
