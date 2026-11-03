import { Minus, Plus } from "lucide-react";
import type { AutoScroll } from "../hooks/useAutoScroll";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/**
 * The readout for auto-scroll.
 *
 * Auto-scroll is otherwise invisible state with an invisible parameter: the page
 * moves and nothing says why, or how fast, or how to stop. It also carries the
 * controls, because macOS claims Cmd+Space for Spotlight before the app can see
 * it, so the shortcut cannot be the only way to work this.
 *
 * "Manual" is the state that most needs saying out loud: the reader pressed an
 * arrow, the session is deliberately holding, and it will pick up again by
 * itself in a moment. Without the label that reads as auto-scroll having broken.
 */

interface Props {
  autoScroll: AutoScroll;
}

export function AutoScrollHud({ autoScroll }: Props) {
  if (!autoScroll.active) return null;

  const { paused, nudging, pause, resume } = autoScroll;
  const label = paused ? "Paused" : nudging ? "Manual" : "Auto-scroll";

  return (
    <div
      className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-popover p-1 pl-3 text-sm text-popover-foreground shadow-lg"
      role="status"
      aria-live="off"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full bg-foreground",
          !paused && !nudging && "animate-pulse motion-reduce:animate-none",
          paused && "bg-muted-foreground",
        )}
      />
      <span className="mr-1 font-medium">{label}</span>

      <Button variant="ghost" size="icon-sm" onClick={autoScroll.slower} aria-label="Slower" title="Slower (−)">
        <Minus />
      </Button>
      <span className="w-16 text-center text-xs text-muted-foreground tabular-nums">
        {autoScroll.speed} px/s
      </span>
      <Button variant="ghost" size="icon-sm" onClick={autoScroll.faster} aria-label="Faster" title="Faster (+)">
        <Plus />
      </Button>

      <Button variant="ghost" size="sm" onClick={paused ? resume : pause} title={`${paused ? "Resume" : "Pause"} (space)`}>
        {paused ? "Resume" : "Pause"}
        <Kbd>space</Kbd>
      </Button>

      <Button variant="ghost" size="sm" onClick={autoScroll.stop}>
        Stop
        <Kbd>esc</Kbd>
      </Button>
    </div>
  );
}
