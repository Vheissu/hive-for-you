import type { EntityScore } from '../../../../packages/shared-types/src/index';

type InterestMeterProps = {
  item: EntityScore;
};

export function InterestMeter({ item }: InterestMeterProps) {
  const width = Math.max(Math.min((item.score / 12) * 100, 100), 6);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-text-primary">{item.key}</span>
        <span className="text-xs text-text-secondary">{item.score.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-ember"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
