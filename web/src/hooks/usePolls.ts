// Poll data hooks: on-mount fetch, manual refresh, optional silent
// auto-refresh (used by the results view while a poll page is open).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAllPolls,
  fetchLatestLedger,
  fetchPoll,
  type PollInfo,
} from '../lib/stellar.ts';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface PollsState extends AsyncState<PollInfo[]> {
  latestLedger: number | null;
  refresh: () => void;
}

export function usePolls(): PollsState {
  const [state, setState] = useState<AsyncState<PollInfo[]>>({
    data: null,
    loading: true,
    error: null,
  });
  const [latestLedger, setLatestLedger] = useState<number | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [polls, ledger] = await Promise.all([fetchAllPolls(), fetchLatestLedger()]);
      if (!aliveRef.current) return;
      setState({ data: polls, loading: false, error: null });
      setLatestLedger(ledger);
    } catch (err) {
      if (!aliveRef.current) return;
      setState((prev) => ({ ...prev, loading: false, error: errorText(err) }));
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return { ...state, latestLedger, refresh: () => void load() };
}

export interface PollState extends AsyncState<PollInfo> {
  latestLedger: number | null;
  refreshing: boolean;
  refresh: () => void;
}

export function usePoll(id: number, opts?: { refreshMs?: number }): PollState {
  const refreshMs = opts?.refreshMs ?? 0;
  const [state, setState] = useState<AsyncState<PollInfo>>({
    data: null,
    loading: true,
    error: null,
  });
  const [latestLedger, setLatestLedger] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);

  const load = useCallback(
    async (background: boolean) => {
      if (background) setRefreshing(true);
      else setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [poll, ledger] = await Promise.all([fetchPoll(id), fetchLatestLedger()]);
        if (!aliveRef.current) return;
        setState({ data: poll, loading: false, error: null });
        setLatestLedger(ledger);
      } catch (err) {
        if (!aliveRef.current) return;
        setState((prev) => ({
          data: background ? prev.data : null,
          loading: false,
          error: errorText(err),
        }));
      } finally {
        if (aliveRef.current) setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    aliveRef.current = true;
    void load(false);
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (refreshMs <= 0) return;
    const timer = window.setInterval(() => void load(true), refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs, load]);

  return { ...state, latestLedger, refreshing, refresh: () => void load(true) };
}
