import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
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

  const context = useMemo(
    () => ({ active, register, unregister }),
    [active, register, unregister],
  );

  return (
    <div className="mdx-tabs">
      <div className="mdx-tabs__bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={tab.value === active}
            className={`mdx-tabs__tab${tab.value === active ? " is-active" : ""}`}
            onClick={() => setSelected(tab.value)}
          >
            {tab.label}
          </button>
        ))}
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

  return (
    <div className="mdx-tabs__panel" role="tabpanel">
      {children}
    </div>
  );
}
