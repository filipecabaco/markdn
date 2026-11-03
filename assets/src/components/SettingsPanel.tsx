import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Settings, SettingsResponse, Theme, ViewMode } from "../api";
import { MAX_SPEED, MIN_SPEED } from "../hooks/useAutoScroll";
import { useModal } from "../hooks/useModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "./Segmented";

/**
 * Settings, backed by the JSON file the panel names at the bottom.
 *
 * Everything except the root applies the moment it is changed — these are
 * preferences, not a form, and a Save button would only add a step where the
 * result is already visible behind the dialog. The root is different: it is
 * typed, it can be wrong, and changing it moves the whole document tree, so it
 * is applied deliberately and the server's rejection is shown next to the field.
 */

interface Props {
  state: SettingsResponse;
  onChange: (patch: Partial<Settings>) => Promise<void>;
  onClose: () => void;
}

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "editor", label: "Source" },
  { id: "split", label: "Split" },
  { id: "preview", label: "Render" },
];

function Row({
  label,
  htmlFor,
  note,
  children,
}: {
  label: string;
  htmlFor?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
      <div className="flex flex-col gap-0.5">
        <label className="text-sm font-medium" htmlFor={htmlFor}>
          {label}
        </label>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </section>
  );
}

const range = "w-full cursor-pointer accent-primary";

export function SettingsPanel({ state, onChange, onClose }: Props) {
  const { settings, rootLocked } = state;
  const [root, setRoot] = useState(settings.root ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useModal(dialog);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const apply = (patch: Partial<Settings>) => {
    setError(null);
    onChange(patch).catch((err: Error) => setError(err.message));
  };

  const applyRoot = () => {
    setBusy(true);
    setError(null);
    onChange({ root: root.trim() === "" ? null : root.trim() })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-[8vh] dark:bg-black/50"
      onMouseDown={onClose}
    >
      <div
        ref={dialog}
        className="flex w-full max-w-2xl flex-col rounded-xl border bg-popover text-popover-foreground shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">Settings</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Close settings" onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="divide-y px-5">
          <Row
            label="Document root"
            htmlFor="settings-root"
            note="Everything markdn can read or write, for the editor and for MCP clients."
          >
            <div className="flex gap-2">
              <Input
                id="settings-root"
                className="font-mono text-xs md:text-xs"
                value={root}
                disabled={rootLocked || busy}
                spellCheck={false}
                placeholder={state.root}
                onChange={(event) => setRoot(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyRoot();
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={rootLocked || busy || root.trim() === (settings.root ?? "")}
                onClick={applyRoot}
              >
                Apply
              </Button>
            </div>
            {rootLocked ? (
              <p className="text-xs text-warning">
                Pinned by <code className="font-mono">MARKDN_ROOT</code> for this launch. Unset it
                to change the root from here.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Empty means your home directory. Currently{" "}
                <code className="font-mono break-all">{state.root}</code>.
              </p>
            )}
          </Row>

          <Row label="Theme">
            <Segmented
              label="Theme"
              options={THEMES}
              value={settings.theme}
              onChange={(theme) => apply({ theme })}
            />
          </Row>

          <Row label="Default view" note="The pane layout a new window opens with.">
            <Segmented
              label="Default view"
              options={VIEWS}
              value={settings.defaultView}
              onChange={(defaultView) => apply({ defaultView })}
            />
          </Row>

          <Row label="Editor text size" htmlFor="settings-font">
            <div className="flex items-center gap-3">
              <input
                id="settings-font"
                type="range"
                className={range}
                min={10}
                max={24}
                step={1}
                value={settings.editorFontSize}
                onChange={(event) => apply({ editorFontSize: Number(event.target.value) })}
              />
              <output className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {settings.editorFontSize}px
              </output>
            </div>
          </Row>

          <Row
            label="Auto-scroll speed"
            htmlFor="settings-speed"
            note="Also adjustable with + and − while scrolling."
          >
            <div className="flex items-center gap-3">
              <input
                id="settings-speed"
                type="range"
                className={range}
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={5}
                value={settings.autoScrollSpeed}
                onChange={(event) => apply({ autoScrollSpeed: Number(event.target.value) })}
              />
              <output className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {settings.autoScrollSpeed} px/s
              </output>
            </div>
          </Row>

          <Row
            label="Show hidden files"
            htmlFor="settings-hidden"
            note="Include dot-directories in the tree and in search."
          >
            <Switch
              id="settings-hidden"
              checked={settings.showHiddenFiles}
              onCheckedChange={(checked) => apply({ showHiddenFiles: checked })}
            />
          </Row>

          {error && (
            <p className="py-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="flex min-w-0 items-center gap-2 rounded-b-xl border-t bg-muted/50 px-5 py-2.5 text-xs text-muted-foreground">
          <span className="shrink-0">Stored in</span>
          <code className="min-w-0 truncate font-mono" title={state.path}>
            {state.path}
          </code>
        </footer>
      </div>
    </div>
  );
}
