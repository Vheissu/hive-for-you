import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, KeyRound, RefreshCcw, Sparkles, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FeedItem, ForYouActionRequest } from '../../../../packages/shared-types/src/index';
import { defaultAccount, fetchFeed, fetchProfile, resetPersonalization, sendAction } from '../api';
import { FeedCard } from '../components/FeedCard';
import { ProfileRail } from '../components/ProfileRail';
import { ReaderDialog } from '../components/ReaderDialog';
import { SkeletonCard } from '../components/SkeletonCard';
import { WhyDialog } from '../components/WhyDialog';
import { isKeychainAvailable, requestVote } from '../keychain';

type VisibleFeedItem = FeedItem & {
  snapshotId: string;
  slot: number;
};

type NoticeState = {
  tone: 'success' | 'error';
  text: string;
};

type DismissedEntry = {
  action: ForYouActionRequest;
  label: string;
  timerId: ReturnType<typeof setTimeout>;
};

const EMPTY_HIDDEN_POSTS = new Set<string>();
const FEED_REFRESH_EVENTS = new Set<ForYouActionRequest['event']>([
  'hide_post',
  'more_like_author',
  'more_like_tag',
  'more_like_community',
  'less_like_author',
  'less_like_tag',
  'less_like_community',
  'positive_vote',
  'negative_vote',
]);

export function ForYouPage() {
  const account = defaultAccount;
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [hiddenPostsByAccount, setHiddenPostsByAccount] = useState<Record<string, Set<string>>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [explainPostKey, setExplainPostKey] = useState<string>();
  const [readerPostKey, setReaderPostKey] = useState<string>();
  const [keychainAvailable, setKeychainAvailable] = useState(() => isKeychainAvailable());
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [dismissedPosts, setDismissedPosts] = useState<Map<string, DismissedEntry>>(new Map());
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const hiddenPosts = useMemo(() => hiddenPostsByAccount[account] ?? EMPTY_HIDDEN_POSTS, [account, hiddenPostsByAccount]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncKeychain = () => {
      setKeychainAvailable(isKeychainAvailable());
    };

    syncKeychain();
    window.addEventListener('focus', syncKeychain);
    document.addEventListener('visibilitychange', syncKeychain);

    return () => {
      window.removeEventListener('focus', syncKeychain);
      document.removeEventListener('visibilitychange', syncKeychain);
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, 4_500);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  const feedQuery = useInfiniteQuery({
    queryKey: ['for-you', account, refreshNonce],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchFeed({
        account,
        cursor: pageParam,
        pageSize: 12,
        refresh: pageParam === undefined && refreshNonce > 0,
      }),
    getNextPageParam: (page) => page.nextCursor,
  });

  const profileQuery = useQuery({
    queryKey: ['profile', account],
    queryFn: () => fetchProfile(account),
  });

  const actionMutation = useMutation({
    mutationFn: (action: ForYouActionRequest) => sendAction(account, action),
    onSuccess: (_response, action) => {
      if (FEED_REFRESH_EVENTS.has(action.event)) {
        void queryClient.invalidateQueries({ queryKey: ['for-you', account] });
      }

      if (action.event !== 'impression') {
        void queryClient.invalidateQueries({ queryKey: ['profile', account] });
      }
    },
    onError: (_error, action) => {
      if (action.event === 'hide_post') {
        // Remove from dismissed state if still pending
        setDismissedPosts((current) => {
          const entry = current.get(action.postKey);
          if (!entry) return current;
          clearTimeout(entry.timerId);
          const next = new Map(current);
          next.delete(action.postKey);
          return next;
        });

        setHiddenPostsByAccount((current) => {
          const next = new Set(current[account] ?? []);
          next.delete(action.postKey);
          return {
            ...current,
            [account]: next,
          };
        });
      }

      setNotice({
        tone: 'error',
        text: 'The feed action did not stick. Refresh and try again.',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetPersonalization(account),
    onSuccess: async () => {
      setHiddenPostsByAccount((current) => ({
        ...current,
        [account]: new Set<string>(),
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['for-you', account] }),
        queryClient.invalidateQueries({ queryKey: ['profile', account] }),
      ]);
      setRefreshNonce((value) => value + 1);
      setNotice({
        tone: 'success',
        text: `Personalization was reset for @${account}.`,
      });
    },
    onError: () => {
      setNotice({
        tone: 'error',
        text: 'Reset failed. The previous personalization state is still active.',
      });
    },
  });

  const items = useMemo<VisibleFeedItem[]>(() => {
    const seen = new Set<string>();
    const result: VisibleFeedItem[] = [];

    feedQuery.data?.pages.forEach((page) => {
      page.items.forEach((item) => {
        if (hiddenPosts.has(item.postKey) || seen.has(item.postKey)) {
          return;
        }

        seen.add(item.postKey);
        result.push({
          ...item,
          snapshotId: page.snapshotId,
          slot: result.length,
        });
      });
    });

    return result;
  }, [feedQuery.data?.pages, hiddenPosts]);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feedQuery;

  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPage();
        }
      },
      { rootMargin: '800px 0px' },
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

  const finalizeDismissal = useCallback(
    (postKey: string) => {
      setDismissedPosts((current) => {
        if (!current.has(postKey)) return current;
        const next = new Map(current);
        next.delete(postKey);
        return next;
      });
      setHiddenPostsByAccount((current) => {
        const next = new Set(current[account] ?? []);
        next.add(postKey);
        return { ...current, [account]: next };
      });
    },
    [account],
  );

  const undoDismissal = useCallback(
    (postKey: string) => {
      setDismissedPosts((current) => {
        const entry = current.get(postKey);
        if (!entry) return current;
        clearTimeout(entry.timerId);

        // Fire compensating action for less_like_* events
        const { action } = entry;
        if (action.event === 'less_like_author' && 'entityKey' in action) {
          actionMutation.mutate({ event: 'more_like_author', entityKey: action.entityKey });
        } else if (action.event === 'less_like_tag' && 'entityKey' in action) {
          actionMutation.mutate({ event: 'more_like_tag', entityKey: action.entityKey });
        } else if (action.event === 'less_like_community' && 'entityKey' in action) {
          actionMutation.mutate({ event: 'more_like_community', entityKey: action.entityKey });
        }

        const next = new Map(current);
        next.delete(postKey);
        return next;
      });
    },
    [actionMutation],
  );

  const handleAction = (action: ForYouActionRequest, postKey: string) => {
    const isDismissable =
      action.event === 'hide_post' ||
      action.event === 'less_like_author' ||
      action.event === 'less_like_tag' ||
      action.event === 'less_like_community';

    if (isDismissable) {
      const label =
        action.event === 'hide_post'
          ? 'Post hidden \u00b7 Used to improve your feed'
          : action.event === 'less_like_author' && 'entityKey' in action
            ? `Noted \u00b7 We\u2019ll show less from @${action.entityKey}`
            : action.event === 'less_like_tag' && 'entityKey' in action
              ? `Noted \u00b7 We\u2019ll show less #${action.entityKey}`
              : action.event === 'less_like_community' && 'entityKey' in action
                ? `Noted \u00b7 We\u2019ll show less from ${action.entityKey}`
                : 'Post dismissed';

      const timerId = setTimeout(() => finalizeDismissal(postKey), 5_000);

      setDismissedPosts((current) => {
        const existing = current.get(postKey);
        if (existing) clearTimeout(existing.timerId);
        const next = new Map(current);
        next.set(postKey, { action, label, timerId });
        return next;
      });

      actionMutation.mutate(action);
      return;
    }

    actionMutation.mutate(action);
  };

  const handleRead = (item: VisibleFeedItem) => {
    setReaderPostKey(item.postKey);
    actionMutation.mutate({
      event: 'open_post',
      postKey: item.postKey,
      snapshotId: item.snapshotId,
      slot: item.slot,
    });
  };

  const handleVote = async (item: VisibleFeedItem, weight: number) => {
    if (!keychainAvailable) {
      setNotice({
        tone: 'error',
        text: 'Hive Keychain is required before you can vote or flag from the feed.',
      });
      return;
    }

    try {
      const response = await requestVote(account, item.author, item.permlink, weight);

      if (!response.success) {
        setNotice({
          tone: 'error',
          text: response.error ?? 'Keychain rejected the broadcast.',
        });
        return;
      }

      setNotice({
        tone: 'success',
        text: weight > 0 ? `Vote broadcast for @${item.author}.` : `Flag broadcast for @${item.author}.`,
      });

      actionMutation.mutate({
        event: weight > 0 ? 'positive_vote' : 'negative_vote',
        postKey: item.postKey,
        snapshotId: item.snapshotId,
        slot: item.slot,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Voting failed unexpectedly.',
      });
    }
  };

  const signalCount =
    (profileQuery.data?.topAuthors.length ?? 0) +
    (profileQuery.data?.topTags.length ?? 0) +
    (profileQuery.data?.topCommunities.length ?? 0);

  return (
    <>
      {/* Compact top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-ember" />
            <span className="text-base font-semibold text-text-primary">Hive For You</span>
            <span className="text-sm text-text-secondary">@{account}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 text-xs text-text-secondary sm:flex">
              <KeyRound className={`h-3.5 w-3.5 ${keychainAvailable ? 'text-green' : 'text-ember'}`} />
              <span>{keychainAvailable ? 'Keychain' : 'No Keychain'}</span>
            </div>
            <span className="hidden text-xs text-text-secondary sm:inline">{signalCount} signals</span>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-primary transition hover:bg-gray-50"
              onClick={() => setRefreshNonce((value) => value + 1)}
              type="button"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-gray-100 hover:text-text-primary xl:hidden"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <User className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {feedQuery.isLoading ? (
              Array.from({ length: 4 }, (_, index) => <SkeletonCard key={`skeleton-${index}`} />)
            ) : items.length > 0 ? (
              items.map((item) => {
                const dismissed = dismissedPosts.get(item.postKey);
                return (
                  <FeedCard
                    account={account}
                    dismissedInfo={
                      dismissed
                        ? { label: dismissed.label, onUndo: () => undoDismissal(item.postKey) }
                        : undefined
                    }
                    item={item}
                    key={item.postKey}
                    keychainAvailable={keychainAvailable}
                    onAction={(action) => handleAction(action, item.postKey)}
                    onExplain={setExplainPostKey}
                    onRead={() => handleRead(item)}
                    onVote={(weight) => handleVote(item, weight)}
                    slot={item.slot}
                    snapshotId={item.snapshotId}
                  />
                );
              })
            ) : (
              <div className="rounded-xl border border-border bg-white p-6 text-center shadow-sm">
                <p className="text-lg font-semibold text-text-primary">No recent posts survived the current filters.</p>
                <p className="mt-2 text-sm text-text-secondary">
                  Refresh the feed or reset personalization to rebuild the recommendation pool for @{account}.
                </p>
              </div>
            )}

            <div className="py-6" ref={loadMoreRef}>
              {feedQuery.isFetchingNextPage ? (
                <div className="grid gap-4">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              ) : null}
            </div>
          </div>

          <div className="hidden xl:block">
            <ProfileRail
              account={account}
              keychainAvailable={keychainAvailable}
              onOpenDrawer={() => setDrawerOpen(true)}
              onReset={() => resetMutation.mutate()}
              profile={profileQuery.data}
              resetPending={resetMutation.isPending}
            />
          </div>
        </section>
      </main>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30 xl:hidden" onClick={() => setDrawerOpen(false)} role="presentation">
          <div
            className="absolute right-0 top-0 h-full w-full max-w-sm p-4"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <ProfileRail
              account={account}
              keychainAvailable={keychainAvailable}
              onOpenDrawer={() => setDrawerOpen(false)}
              onReset={() => resetMutation.mutate()}
              profile={profileQuery.data}
              resetPending={resetMutation.isPending}
            />
          </div>
        </div>
      ) : null}

      {notice ? <StatusNotice notice={notice} /> : null}

      <ReaderDialog account={account} onClose={() => setReaderPostKey(undefined)} open={Boolean(readerPostKey)} postKey={readerPostKey} />
      <WhyDialog account={account} onClose={() => setExplainPostKey(undefined)} open={Boolean(explainPostKey)} postKey={explainPostKey} />
    </>
  );
}

function StatusNotice({ notice }: { notice: NoticeState }) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl border border-border bg-white p-3 shadow-lg">
      <div className="flex items-start gap-2.5">
        {notice.tone === 'success' ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 text-green" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 text-ember" />
        )}
        <p className="text-sm text-text-primary">{notice.text}</p>
      </div>
    </div>
  );
}
