import type { ReasonCode } from '../../../../packages/shared-types/src/index';

const reasonLabel: Record<ReasonCode, string> = {
  followed_author: 'Followed author',
  engaged_author: 'Habit signal',
  tag_match: 'Tag match',
  community_match: 'Community pull',
  thread_match: 'Thread continuation',
  reblogged_by_followed: 'Network echo',
  popular_in_interest: 'Popular in your lane',
  exploration_pick: 'Exploration',
  similar_users: 'Similar readers',
  recently_active_topic: 'Recent topic momentum',
};

type ReasonChipProps = {
  code?: ReasonCode;
};

export function ReasonChip({ code }: ReasonChipProps) {
  if (!code) {
    return null;
  }

  return (
    <span className="inline-flex items-center rounded-full bg-ember/10 px-2 py-0.5 text-xs font-medium text-ember">
      {reasonLabel[code]}
    </span>
  );
}
