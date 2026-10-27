import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/**
 * Tabbed panels.
 *
 * Each `<Tab>` registers itself with its parent through context rather than the
 * parent introspecting `children`. Introspection would not work here: the MDX
 * pipeline wraps every component in `MdxNode`, so `Tabs` never sees `Tab`
 * elements directly — it sees dispatchers. Registration sidesteps that entirely.
 */

interface TabMeta {
  value: string;
  label: string;
}

interface TabsContextValue {
  active: string | null;
  register: (tab: TabMeta) => void;
  unregister: (value: string) => void;
  /** The tab and panel ids for a value, so each can name the other. */
  ids: (value: string) => { tab: string; panel: string };
}

const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabsProps {
  defaultValue?: string;
  children?: ReactNode;
}

export function Tabs({ defaultValue, children }: TabsProps) {
  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(defaultValue ?? null);

  const register = useCallback((tab: TabMeta) => {
    setTabs((current) =>
      current.some((t) => t.value === tab.value) ? current : [...current, tab],
    );
  }, []);

  const unregister = useCallback((value: string) => {
    setTabs((current) => current.filter((t) => t.value !== value));
  }, []);

  // Without a usable defaultValue, fall back to whichever tab registered first.
  const active = selected && tabs.some((t) => t.value === selected)
    ? selected
    : (tabs[0]?.value ?? null);

  // Values are author-chosen strings, so ids are built from the position the
  // tab registered in rather than from the value itself.
  const base = useId();
  const ids = useCallback(
    (value: string) => {
      const index = Math.max(0, tabs.findIndex((t) => t.value === value));
      return { tab: `${base}-tab-${index}`, panel: `${base}-panel-${index}` };
    },
    [base, tabs],
  );

  const context = useMemo(
    () => ({ active, register, unregister, ids }),
    [active, register, unregister, ids],
  );

  const bar = useRef<HTMLDivElement>(null);

  // The WAI-ARIA tabs pattern: one Tab stop for the whole row, arrows move
  // between tabs and select as they go, Home and End jump to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.value === active);
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft"
          ? index <= 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;

    if (next === null || !tabs[next]) return;
    event.preventDefault();
    setSelected(tabs[next].value);
    bar.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div className="mdx-tabs">
      <div className="mdx-tabs__bar" role="tablist" ref={bar} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.value === active;
          const { tab: tabId, panel } = ids(tab.value);
          return (
            <button
              key={tab.value}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panel}
              tabIndex={selected ? 0 : -1}
              className={`mdx-tabs__tab${selected ? " is-active" : ""}`}
              onClick={() => setSelected(tab.value)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <TabsContext.Provider value={context}>{children}</TabsContext.Provider>
    </div>
  );
}

export interface TabProps {
  value?: string;
  label?: string;
  children?: ReactNode;
}

export function Tab({ value, label, children }: TabProps) {
  const fallbackId = useId();
  const key = value ?? fallbackId;
  const context = useContext(TabsContext);
  const register = context?.register;
  const unregister = context?.unregister;

  useEffect(() => {
    if (!register || !unregister) return;
    register({ value: key, label: label ?? key });
    return () => unregister(key);
  }, [key, label, register, unregister]);

  // A <Tab> outside <Tabs> still shows its content rather than vanishing.
  if (!context) return <div className="mdx-tabs__panel">{children}</div>;
  if (context.active !== key) return null;

  const { tab, panel } = context.ids(key);

  return (
    <div className="mdx-tabs__panel" role="tabpanel" id={panel} aria-labelledby={tab} tabIndex={0}>
      {children}
    </div>
  );
}
