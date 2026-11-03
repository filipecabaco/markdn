import { cn } from "@/lib/utils";

/**
 * The markdn mark: four rounded tiles locking together into an "m" — a bar and
 * three stems, drawn the way yaah's "y" is. The middle stem is the one brand
 * colour (markdown's ↓, read again); the rest follow the text colour, so the
 * mark sits in either theme. `loading` plays the tiles sliding into place.
 */

/** [x, y, width, height] in a 60×60 box: the bar, then the stems left to right. */
const TILES = [
  [0, 0, 60, 17],
  [0, 20, 16, 40],
  [22, 20, 16, 40],
  [44, 20, 16, 40],
] as const;

export function Mark({
  className,
  loading = false,
  title,
}: {
  className?: string;
  loading?: boolean;
  title?: string;
}) {
  return (
    <svg
      viewBox="-6 -6 72 72"
      className={cn("markdn-mark shrink-0", className)}
      data-loading={loading || undefined}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {TILES.map(([x, y, w, h], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={5}
          data-tile={i}
          className={i === 2 ? "fill-brand" : "fill-current"}
        />
      ))}
    </svg>
  );
}

/** The mark with the name beside it, as in the header. */
export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <Mark className="size-[1.35em]" />
      {!compact && <span className="font-semibold tracking-tight">markdn</span>}
    </span>
  );
}
