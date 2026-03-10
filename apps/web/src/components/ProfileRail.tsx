import { KeyRound, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';

import type { UserProfileView } from '../../../../packages/shared-types/src/index';
import { InterestMeter } from './InterestMeter';

type ProfileRailProps = {
  account: string;
  keychainAvailable: boolean;
  onOpenDrawer: () => void;
  onReset: () => void;
  profile?: UserProfileView;
  resetPending: boolean;
};

export function ProfileRail({
  account,
  keychainAvailable,
  onOpenDrawer,
  onReset,
  profile,
  resetPending,
}: ProfileRailProps) {
  return (
    <aside className="sticky top-16 space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm xl:w-[320px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ember">Personalization</p>
            <h2 className="text-lg font-semibold text-text-primary">Signal room</h2>
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition hover:border-gray-300 hover:text-text-primary xl:hidden"
            onClick={onOpenDrawer}
            type="button"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Tune
          </button>
        </div>

        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-text-secondary">Hive account</p>
          <p className="mt-1 text-lg font-semibold text-text-primary">@{account}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
            <KeyRound className={`h-3.5 w-3.5 ${keychainAvailable ? 'text-green' : 'text-ember'}`} />
            <span>{keychainAvailable ? 'Keychain ready' : 'Install Hive Keychain to vote'}</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-3">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-ember" />
          <p className="text-xs font-medium text-text-secondary">Top author signals</p>
        </div>
        <div className="space-y-3">
          {(profile?.topAuthors ?? []).slice(0, 4).map((item) => (
            <InterestMeter item={item} key={item.key} />
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-3">
        <p className="mb-2 text-xs font-medium text-text-secondary">Favorite tags</p>
        <div className="flex flex-wrap gap-1.5">
          {(profile?.topTags ?? []).slice(0, 8).map((item) => (
            <span
              className="rounded-full bg-green/10 px-2 py-0.5 text-xs font-medium text-green"
              key={item.key}
            >
              #{item.key}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-3">
        <p className="mb-3 text-xs font-medium text-text-secondary">Communities in rotation</p>
        <div className="space-y-3">
          {(profile?.topCommunities ?? []).slice(0, 4).map((item) => (
            <InterestMeter item={item} key={item.key} />
          ))}
        </div>
      </div>

      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-text-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
        disabled={resetPending}
        onClick={onReset}
        type="button"
      >
        <RotateCcw className="h-4 w-4" />
        {resetPending ? 'Resetting...' : 'Reset personalization'}
      </button>
    </aside>
  );
}
