// Poll data hooks: on-mount fetch, manual refresh, optional silent
// auto-refresh (used by the results view while a poll page is open).

import { useCallback, useEffect, useRef, useState } from 'react';
import { chain } from '../lib/chain.ts';
import { DEMO_POLL_ID, DEMO_ROOT_HEX } from '../lib/passes.ts';
import type { PollInfo } from '../lib/stellar.ts';

const DOCKET_PAGE_SIZE = 12;

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface PollsState {
  /** Newest-first, pinned poll excluded. */
  polls: PollInfo[] | null;
  /** The featured demo poll (freshest poll on the demo electorate root). */
  pinned: PollInfo | null;
  count: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  latestLedger: number | null;
  loadMore: () => void;
  refresh: () => void;
}

/** Freshest demo-root poll wins the pin; falls back to the canonical poll 2. */
function pickPinned(loaded: PollInfo[], fallback: PollInfo | null): PollInfo | null {
  const demos = loaded.filter((p) => p.rootHex === DEMO_ROOT_HEX);
  if (demos.length > 0) {
    return demos.reduce((a, b) => (b.id > a.id ? b : a));
  }
  return fallback;
}

export function usePolls(): PollsState {
  const [polls, setPolls] = useState<PollInfo[] | null>(null);
  const [pinned, setPinned] = useState<PollInfo | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [latestLedger, setLatestLedger] = useState<number | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fetchPollsNewest, fetchLatestLedger, fetchPoll } = await chain();
      const [page, ledger, demoFallback] = await Promise.all([
        fetchPollsNewest(DOCKET_PAGE_SIZE),
        fetchLatestLedger(),
        fetchPoll(DEMO_POLL_ID).catch(() => null),
      ]);
      if (!aliveRef.current) return;
      const pin = pickPinned(page.polls, demoFallback);
      setPinned(pin);
      setPolls(page.polls.filter((p) => p.id !== pin?.id));
      setCount(page.count);
      setNextBeforeId(page.nextBeforeId);
      setLatestLedger(ledger);
      setLoading(false);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(errorText(err));
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (nextBeforeId === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const { fetchPollsNewest } = await chain();
      const page = await fetchPollsNewest(DOCKET_PAGE_SIZE, nextBeforeId);
      if (!aliveRef.current) return;
      setPolls((prev) => {
        const seen = new Set([...(prev ?? []).map((p) => p.id), pinned?.id]);
        return [...(prev ?? []), ...page.polls.filter((p) => !seen.has(p.id))];
      });
      setNextBeforeId(page.nextBeforeId);
    } catch (err) {
      if (aliveRef.current) setError(errorText(err));
    } finally {
      if (aliveRef.current) setLoadingMore(false);
    }
  }, [nextBeforeId, loadingMore, pinned]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return {
    polls,
    pinned,
    count,
    loading,
    loadingMore,
    error,
    hasMore: nextBeforeId !== null,
    latestLedger,
    loadMore: () => void loadMore(),
    refresh: () => void load(),
  };
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
        const { fetchPoll, fetchLatestLedger } = await chain();
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
