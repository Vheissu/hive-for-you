import { useEffect, useRef, useState } from 'react';

type VotePopoverProps = {
  direction: 'up' | 'down';
  onConfirm: (weight: number) => void;
  onClose: () => void;
};

const SNAP_POINTS = [25, 50, 75, 100] as const;

export function VotePopover({ direction, onConfirm, onClose }: VotePopoverProps) {
  const [weight, setWeight] = useState(100);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const isUp = direction === 'up';
  const sign = isUp ? 1 : -1;

  function snapClass(snap: number) {
    if (weight !== snap) return 'bg-gray-100 text-text-secondary hover:bg-gray-200';
    return isUp ? 'bg-green/15 text-green' : 'bg-ember/15 text-ember';
  }

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded-xl border border-border bg-white p-3 shadow-lg"
    >
      {/* Snap-point buttons */}
      <div className="mb-2 flex gap-1.5">
        {SNAP_POINTS.map((snap) => (
          <button
            key={snap}
            className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${snapClass(snap)}`}
            onClick={() => setWeight(snap)}
            type="button"
          >
            {snap}%
          </button>
        ))}
      </div>

      {/* Range slider */}
      <input
        className="mb-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-current"
        max={100}
        min={25}
        onChange={(e) => setWeight(Number(e.target.value))}
        step={1}
        style={{ color: isUp ? 'var(--color-green)' : 'var(--color-ember)' }}
        type="range"
        value={weight}
      />

      {/* Confirm button */}
      <button
        className={`w-full rounded-lg px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 ${
          isUp ? 'bg-green' : 'bg-ember'
        }`}
        onClick={() => onConfirm(weight * 100 * sign)}
        type="button"
      >
        Vote {weight}%
      </button>

      {/* Caret pointing down */}
      <div className="absolute left-1/2 top-full -translate-x-1/2">
        <div className="h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-white" />
      </div>
    </div>
  );
}
