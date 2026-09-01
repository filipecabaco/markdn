import { useEffect, useState } from "react";
import type { Settings, SettingsResponse, Theme, ViewMode } from "../api";
import { MAX_SPEED, MIN_SPEED } from "../hooks/useAutoScroll";

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

export function SettingsPanel({ state, onChange, onClose }: Props) {
  const { settings, rootLocked } = state;
  const [root, setRoot] = useState(settings.root ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="picker__backdrop" onMouseDown={onClose}>
      <div
        className="settings"
        role="dialog"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="picker__title">Settings</h2>

        <div className="settings__body">
          <section className="settings__row">
            <label className="settings__label" htmlFor="settings-root">
              Document root
              <span className="settings__note">
                Everything MarkDN can read or write, for the editor and for MCP clients.
              </span>
            </label>

            <div className="settings__control settings__control--stack">
              <div className="settings__inline">
                <input
                  id="settings-root"
                  className="settings__input"
                  value={root}
                  disabled={rootLocked || busy}
                  spellCheck={false}
                  placeholder={state.root}
                  onChange={(event) => setRoot(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyRoot();
                  }}
                />
                <button
                  type="button"
                  className="button"
                  disabled={rootLocked || busy || root.trim() === (settings.root ?? "")}
                  onClick={applyRoot}
                >
                  Apply
                </button>
              </div>

              {rootLocked ? (
                <p className="settings__note settings__note--warn">
                  Pinned by <code>MARKDN_ROOT</code> for this launch. Unset it to change the
                  root from here.
                </p>
              ) : (
                <p className="settings__note">
                  Empty means your home directory. Currently <code>{state.root}</code>.
                </p>
              )}
            </div>
          </section>

          <section className="settings__row">
            <span className="settings__label">Theme</span>
            <div className="settings__control">
              <div className="segmented" role="group" aria-label="Theme">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className={`segmented__item${settings.theme === theme.id ? " is-active" : ""}`}
                    aria-pressed={settings.theme === theme.id}
                    onClick={() => apply({ theme: theme.id })}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings__row">
            <label className="settings__label">
              Default view
              <span className="settings__note">The pane layout a new window opens with.</span>
            </label>
            <div className="settings__control">
              <div className="segmented" role="group" aria-label="Default view">
                {VIEWS.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    className={`segmented__item${
                      settings.defaultView === view.id ? " is-active" : ""
                    }`}
                    aria-pressed={settings.defaultView === view.id}
                    onClick={() => apply({ defaultView: view.id })}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings__row">
            <label className="settings__label" htmlFor="settings-font">
              Editor text size
            </label>
            <div className="settings__control settings__control--inline">
              <input
                id="settings-font"
                type="range"
                min={10}
                max={24}
                step={1}
                value={settings.editorFontSize}
                onChange={(event) => apply({ editorFontSize: Number(event.target.value) })}
              />
              <output className="settings__value">{settings.editorFontSize}px</output>
            </div>
          </section>

          <section className="settings__row">
            <label className="settings__label" htmlFor="settings-speed">
              Auto-scroll speed
              <span className="settings__note">
                Also adjustable with <kbd>+</kbd> and <kbd>−</kbd> while scrolling.
              </span>
            </label>
            <div className="settings__control settings__control--inline">
              <input
                id="settings-speed"
                type="range"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={5}
                value={settings.autoScrollSpeed}
                onChange={(event) => apply({ autoScrollSpeed: Number(event.target.value) })}
              />
              <output className="settings__value">{settings.autoScrollSpeed} px/s</output>
            </div>
          </section>

          <section className="settings__row">
            <label className="settings__label" htmlFor="settings-hidden">
              Show hidden files
              <span className="settings__note">
                Include dot-directories in the tree and in search.
              </span>
            </label>
            <div className="settings__control">
              <input
                id="settings-hidden"
                type="checkbox"
                checked={settings.showHiddenFiles}
                onChange={(event) => apply({ showHiddenFiles: event.target.checked })}
              />
            </div>
          </section>

          {error && (
            <p className="settings__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="settings__footer">
          <span>Stored in</span>
          <code title={state.path}>{state.path}</code>
        </footer>
      </div>
    </div>
  );
}
