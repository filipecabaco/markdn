/**
 * The iPhone's tab bar: the app's four places, as iOS puts them, at the bottom
 * within thumb reach. Sections, never actions — Save and Edit live in the top
 * bar with the document they act on.
 */

export type PhoneTab = "read" | "documents" | "outline" | "search";

const TABS: { id: PhoneTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "read",
    label: "Read",
    icon: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
      </>
    ),
  },
  {
    id: "documents",
    label: "Documents",
    icon: (
      <>
        <path d="M6 3v18" />
        <circle cx="6" cy="6" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="6" cy="18" r="2" />
        <path d="M11 6h8M11 12h8M11 18h6" />
      </>
    ),
  },
  {
    id: "outline",
    label: "Outline",
    icon: (
      <>
        <path d="M12 3v18" />
        <circle cx="12" cy="7" r="2.5" />
        <circle cx="12" cy="17" r="2.5" />
        <path d="M12 12h6" />
      </>
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m15.5 15.5 4.5 4.5" />
      </>
    ),
  },
];

interface Props {
  active: PhoneTab;
  onChange: (tab: PhoneTab) => void;
}

export function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tabbar__item${active === tab.id ? " is-active" : ""}`}
          aria-current={active === tab.id ? "page" : undefined}
          onClick={() => onChange(tab.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {tab.icon}
          </svg>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
