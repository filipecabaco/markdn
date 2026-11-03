import { BookOpen, FolderTree, ListTree, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The iPhone's tab bar: the app's four places, as iOS puts them, at the bottom
 * within thumb reach. Sections, never actions — Save and Edit live in the top
 * bar with the document they act on.
 */

export type PhoneTab = "read" | "documents" | "outline" | "search";

const TABS: { id: PhoneTab; label: string; icon: LucideIcon }[] = [
  { id: "read", label: "Read", icon: BookOpen },
  { id: "documents", label: "Documents", icon: FolderTree },
  { id: "outline", label: "Outline", icon: ListTree },
  { id: "search", label: "Search", icon: Search },
];

interface Props {
  active: PhoneTab;
  onChange: (tab: PhoneTab) => void;
}

export function TabBar({ active, onChange }: Props) {
  return (
    <nav
      className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      aria-label="Sections"
    >
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={cn(
            "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-muted-foreground outline-none focus-visible:bg-muted",
            active === id && "text-foreground",
          )}
          aria-current={active === id ? "page" : undefined}
          onClick={() => onChange(id)}
        >
          <Icon aria-hidden="true" className="size-5" strokeWidth={active === id ? 2.2 : 1.8} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
