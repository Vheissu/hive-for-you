import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  BookOpenText,
  EyeOff,
  Heart,
  HeartPlus,
  MessageSquare,
  MinusCircle,
  MoreHorizontal,
  PlusCircle,
  ShieldAlert,
  ThumbsUp,
  Undo2,
} from 'lucide-react';

import type { FeedItem, ForYouActionRequest } from '../../../../packages/shared-types/src/index';
import { logAction } from '../api';
import { ReasonChip } from './ReasonChip';
import { VotePopover } from './VotePopover';

function relativeTime(dateStr?: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(diff) || diff < 0) return '';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export type DismissedInfo = {
  label: string;
  onUndo: () => void;
};

type FeedCardProps = {
  account: string;
  dismissedInfo?: DismissedInfo;
  item: FeedItem;
  keychainAvailable: boolean;
  slot: number;
  snapshotId: string;
  onAction: (action: ForYouActionRequest) => void;
  onExplain: (postKey: string) => void;
  onRead: () => void;
  onVote: (weight: number) => Promise<void>;
};

export function FeedCard({
  account,
  dismissedInfo,
  item,
  keychainAvailable,
  slot,
  snapshotId,
  onAction,
  onExplain,
  onRead,
  onVote,
}: FeedCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [votePending, setVotePending] = useState<'like' | 'flag' | null>(null);
  const [votedState, setVotedState] = useState<'up' | 'down' | null>(null);
  const [votePopover, setVotePopover] = useState<'up' | 'down' | null>(null);
  const impressionSent = useRef(false);
  const leadTag = item.tags[0];
  const showLeadTag = leadTag && leadTag !== item.community;
  const voted = votedState ?? item.userVoted;

  useEffect(() => {
    if (!cardRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (!entry?.isIntersecting || impressionSent.current) {
          return;
        }

        impressionSent.current = true;
        logAction(account, {
          event: 'impression',
          postKey: item.postKey,
          snapshotId,
          slot,
        });
      },
      {
        rootMargin: '0px 0px -15% 0px',
        threshold: 0.45,
      },
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, [account, item.postKey, slot, snapshotId]);

  if (dismissedInfo) {
    return (
      <article
        className="animate-rise-in rounded-xl border border-border bg-gray-50 px-4 py-3 shadow-sm"
        ref={cardRef}
        style={{ animationDelay: `${Math.min(slot, 8) * 0.03}s` }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">{dismissedInfo.label}</p>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ember transition hover:bg-ember/10"
            onClick={dismissedInfo.onUndo}
            type="button"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="animate-rise-in rounded-xl border border-border bg-white p-4 shadow-sm"
      ref={cardRef}
      style={{ animationDelay: `${Math.min(slot, 8) * 0.03}s` }}
    >
      {/* Author row */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-text-secondary">
            {item.author[0]?.toUpperCase()}
          </div>
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <span className="font-medium text-text-primary truncate">@{item.author}</span>
            {item.community ? (
              <span className="text-text-secondary truncate">in {item.community}</span>
            ) : null}
            {item.createdAt ? (
              <span className="text-text-secondary" title={new Date(item.createdAt).toLocaleString()}>{relativeTime(item.createdAt)}</span>
            ) : null}
          </div>
          <ReasonChip code={item.context.reasonCodes[0]} />
        </div>

        <div className="relative shrink-0">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-gray-100 hover:text-text-primary"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-10 z-20 w-56 rounded-xl border border-border bg-white p-1 shadow-lg">
              <ActionButton
                icon={<BookOpenText className="h-4 w-4" />}
                label="Read in app"
                onClick={() => {
                  setMenuOpen(false);
                  onRead();
                }}
              />
              <ActionButton
                icon={<EyeOff className="h-4 w-4" />}
                label="Hide post"
                onClick={() => {
                  setMenuOpen(false);
                  onAction({ event: 'hide_post', postKey: item.postKey });
                }}
              />
              <ActionButton
                icon={<MinusCircle className="h-4 w-4" />}
                label={`Less from @${item.author}`}
                onClick={() => {
                  setMenuOpen(false);
                  onAction({ event: 'less_like_author', entityKey: item.author });
                }}
              />
              {item.community ? (
                <ActionButton
                  icon={<MinusCircle className="h-4 w-4" />}
                  label={`Less from ${item.community}`}
                  onClick={() => {
                    setMenuOpen(false);
                    onAction({ event: 'less_like_community', entityKey: item.community! });
                  }}
                />
              ) : null}
              {showLeadTag ? (
                <ActionButton
                  icon={<MinusCircle className="h-4 w-4" />}
                  label={`Less like #${leadTag}`}
                  onClick={() => {
                    setMenuOpen(false);
                    onAction({ event: 'less_like_tag', entityKey: leadTag });
                  }}
                />
              ) : null}
              <ActionButton
                icon={<PlusCircle className="h-4 w-4" />}
                label={`More from @${item.author}`}
                onClick={() => {
                  setMenuOpen(false);
                  onAction({ event: 'more_like_author', entityKey: item.author });
                }}
              />
              {item.community ? (
                <ActionButton
                  icon={<PlusCircle className="h-4 w-4" />}
                  label={`More from ${item.community}`}
                  onClick={() => {
                    setMenuOpen(false);
                    onAction({ event: 'more_like_community', entityKey: item.community! });
                  }}
                />
              ) : null}
              {showLeadTag ? (
                <ActionButton
                  icon={<HeartPlus className="h-4 w-4" />}
                  label={`More like #${leadTag}`}
                  onClick={() => {
                    setMenuOpen(false);
                    onAction({ event: 'more_like_tag', entityKey: leadTag });
                  }}
                />
              ) : null}
              <ActionButton
                icon={<MessageSquare className="h-4 w-4" />}
                label="Why this is shown"
                onClick={() => {
                  setMenuOpen(false);
                  onExplain(item.postKey);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Title */}
      <h2
        className="mb-2 cursor-pointer text-base font-semibold text-text-primary hover:text-ember transition-colors"
        onClick={onRead}
      >
        {item.title}
      </h2>

      {/* Content row: body preview + thumbnail */}
      <div className="mb-3 flex gap-3">
        <p className="flex-1 text-sm leading-relaxed text-text-secondary line-clamp-2">
          {item.bodyPreview}
        </p>
        {item.image ? (
          <img
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
            src={item.image}
          />
        ) : null}
      </div>

      {/* Tags */}
      {item.tags.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map((tag) => (
            <button
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary transition hover:bg-gray-200 hover:text-text-primary"
              key={tag}
              onClick={() => onAction({ event: 'more_like_tag', entityKey: tag })}
              type="button"
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-4 text-xs text-text-secondary">
          <span>{item.stats.positiveVotes} votes</span>
          <span>{item.stats.children} replies</span>
          <span>${(item.stats.pendingPayout ?? 0).toFixed(1)}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-gray-100 hover:text-text-primary"
            onClick={onRead}
            title="Read post"
            type="button"
          >
            <BookOpenText className="h-4 w-4" />
          </button>
          <a
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-gray-100 hover:text-text-primary"
            href={`https://peakd.com/@${item.author}/${item.permlink}`}
            rel="noreferrer"
            target="_blank"
            title="Open on PeakD"
          >
            <ArrowUpRight className="h-4 w-4" />
          </a>
          <div className="relative">
            <div className="flex items-center gap-1">
              <button
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-50 ${
                  voted === 'up'
                    ? 'bg-green/10 text-green'
                    : 'text-text-secondary hover:bg-green/10 hover:text-green'
                }`}
                disabled={!keychainAvailable || votePending !== null || voted !== undefined}
                onClick={() => setVotePopover(votePopover === 'up' ? null : 'up')}
                title={voted === 'up' ? 'Upvoted' : keychainAvailable ? 'Upvote' : 'Hive Keychain required'}
                type="button"
              >
                {votePending === 'like' ? <ThumbsUp className="h-4 w-4 animate-pulse" /> : <Heart className={`h-4 w-4${voted === 'up' ? ' fill-current' : ''}`} />}
              </button>
              <button
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-50 ${
                  voted === 'down'
                    ? 'bg-ember/10 text-ember'
                    : 'text-text-secondary hover:bg-ember/10 hover:text-ember'
                }`}
                disabled={!keychainAvailable || votePending !== null || voted !== undefined}
                onClick={() => setVotePopover(votePopover === 'down' ? null : 'down')}
                title={voted === 'down' ? 'Flagged' : keychainAvailable ? 'Flag' : 'Hive Keychain required'}
                type="button"
              >
                <ShieldAlert className={`h-4 w-4${voted === 'down' ? ' fill-current' : ''}`} />
              </button>
            </div>
            {votePopover !== null && (
              <VotePopover
                direction={votePopover}
                onConfirm={async (weight) => {
                  setVotePopover(null);
                  const kind = weight > 0 ? 'like' : 'flag';
                  setVotePending(kind);
                  try {
                    await onVote(weight);
                    setVotedState(weight > 0 ? 'up' : 'down');
                  } finally {
                    setVotePending(null);
                  }
                }}
                onClose={() => setVotePopover(null)}
              />
            )}
          </div>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-ember/10 hover:text-ember"
            onClick={() => onExplain(item.postKey)}
            title="Why this?"
            type="button"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

type ActionButtonProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

function ActionButton({ icon, label, onClick }: ActionButtonProps) {
  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-text-primary transition hover:bg-gray-50"
      onClick={onClick}
      type="button"
    >
      <span className="text-text-secondary">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
