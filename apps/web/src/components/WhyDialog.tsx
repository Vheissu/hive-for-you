import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { fetchExplanation } from '../api';

type WhyDialogProps = {
  account: string;
  postKey?: string;
  open: boolean;
  onClose: () => void;
};

export function WhyDialog({ account, postKey, open, onClose }: WhyDialogProps) {
  const explanationQuery = useQuery({
    queryKey: ['explain', account, postKey],
    queryFn: () => fetchExplanation(account, postKey!),
    enabled: open && Boolean(postKey),
  });

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose} role="presentation">
      <div className="relative w-full max-w-2xl rounded-xl border border-border bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()} role="presentation">
        <button
          className="absolute right-3 top-3 rounded-lg border border-border p-1.5 text-text-secondary transition hover:border-gray-300 hover:text-text-primary"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-ember">Why this showed up</p>
            <h2 className="text-xl font-semibold text-text-primary">Recommendation breakdown</h2>
            <p className="text-sm text-text-secondary">
              These are the strongest positive contributors for the selected item.
            </p>
          </div>

          {explanationQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-6 rounded bg-gray-100" />
              <div className="h-14 rounded-lg bg-gray-50" />
              <div className="h-14 rounded-lg bg-gray-50" />
            </div>
          ) : explanationQuery.data ? (
            <div className="space-y-3">
              {explanationQuery.data.reasons.map((reason) => (
                <div className="rounded-lg border border-border bg-gray-50 p-3" key={reason.code}>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-text-primary">{reason.text}</p>
                    <span className="text-xs text-text-secondary">
                      {reason.contribution.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-ember"
                      style={{ width: `${Math.min(reason.contribution * 40, 100)}%` }}
                    />
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-border bg-gray-50 p-3">
                <p className="mb-2 text-xs font-medium text-text-secondary">Source sets</p>
                <div className="flex flex-wrap gap-1.5">
                  {explanationQuery.data.sourceSet.map((source) => (
                    <span
                      className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary"
                      key={source}
                    >
                      {source.replaceAll('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-gray-50 p-3 text-sm text-text-secondary">
              No explanation data was available for this item.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
