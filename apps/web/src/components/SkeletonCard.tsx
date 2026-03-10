export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gray-100" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </div>
      <div className="space-y-2">
        <div className="h-5 w-3/4 rounded bg-gray-100" />
        <div className="h-4 rounded bg-gray-50" />
        <div className="h-4 w-5/6 rounded bg-gray-50" />
      </div>
      <div className="mt-3 flex gap-4">
        <div className="h-4 w-16 rounded bg-gray-50" />
        <div className="h-4 w-16 rounded bg-gray-50" />
        <div className="h-4 w-16 rounded bg-gray-50" />
      </div>
    </div>
  );
}
