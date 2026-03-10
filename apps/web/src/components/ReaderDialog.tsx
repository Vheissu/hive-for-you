import { useQuery } from '@tanstack/react-query';
import { ExternalLink, X } from 'lucide-react';

import type { CommentItem } from '../../../../packages/shared-types/src/index';
import { fetchPostDetail } from '../api';
import { MarkdownBody } from './MarkdownBody';

function commentRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(diff) || diff < 0) return '';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Comment({ comment }: { comment: CommentItem }) {
  const indent = Math.min(comment.depth, 3);

  return (
    <div className="flex gap-3" style={{ paddingLeft: `${indent * 24}px` }}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-text-secondary">
        {comment.author[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">@{comment.author}</span>
          <span>{commentRelativeTime(comment.createdAt)}</span>
          {comment.votes > 0 ? <span>{comment.votes} votes</span> : null}
        </div>
        <div className="text-sm">
          <MarkdownBody content={comment.body} />
        </div>
      </div>
    </div>
  );
}

type ReaderDialogProps = {
  account: string;
  postKey?: string;
  open: boolean;
  onClose: () => void;
};

export function ReaderDialog({ account, postKey, open, onClose }: ReaderDialogProps) {
  const postQuery = useQuery({
    queryKey: ['post-detail', account, postKey],
    queryFn: () => fetchPostDetail(account, postKey!),
    enabled: open && Boolean(postKey),
  });

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose} role="presentation">
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <button
          className="absolute right-3 top-3 z-10 rounded-lg border border-border bg-white p-1.5 text-text-secondary transition hover:border-gray-300 hover:text-text-primary"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        {postQuery.isLoading ? (
          <div className="space-y-4 p-6">
            <div className="h-6 rounded bg-gray-100" />
            <div className="h-4 w-1/2 rounded bg-gray-50" />
            <div className="h-48 rounded-lg bg-gray-50" />
          </div>
        ) : postQuery.data ? (
          <>
            <div className="border-b border-border p-6">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <span className="font-medium">@{postQuery.data.author}</span>
                {postQuery.data.community ? <span>{postQuery.data.community}</span> : null}
                {postQuery.data.createdAt ? <span>{new Date(postQuery.data.createdAt).toLocaleString()}</span> : null}
              </div>
              <h2 className="text-2xl font-semibold text-text-primary">{postQuery.data.title}</h2>
            </div>

            <div className="overflow-y-auto px-6 pb-6 pt-4">
              <div className="mb-4 flex flex-wrap gap-1.5">
                {postQuery.data.tags.map((tag) => (
                  <span
                    className="rounded-full bg-green/10 px-2 py-0.5 text-xs font-medium text-green"
                    key={tag}
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              <MarkdownBody content={postQuery.data.rawBody} />

              {postQuery.data.comments.length > 0 ? (
                <div className="mt-8 border-t border-border pt-6">
                  <h3 className="mb-4 text-sm font-semibold text-text-primary">
                    {postQuery.data.comments.length} {postQuery.data.comments.length === 1 ? 'reply' : 'replies'}
                  </h3>
                  <div className="space-y-4">
                    {postQuery.data.comments.map((comment, i) => (
                      <Comment comment={comment} key={`${comment.author}-${comment.createdAt}-${i}`} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-border px-6 py-3">
              <a
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-gray-50"
                href={postQuery.data.url}
                rel="noreferrer"
                target="_blank"
              >
                Open on PeakD
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </>
        ) : (
          <div className="p-6 text-sm text-text-secondary">The selected post could not be loaded.</div>
        )}
      </div>
    </div>
  );
}
