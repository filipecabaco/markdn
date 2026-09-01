import type { ComponentType } from "react";
import { Alert } from "./Alert";
import { Callout } from "./Callout";
import { Card } from "./Card";
import { Tab, Tabs } from "./Tabs";

/**
 * Every component a document may reference.
 *
 * This is the allowlist: `MdxNode` renders a placeholder for anything absent
 * here, so a document can never reach code that was not deliberately registered.
 * `lib/markdn/mcp/components.ex` mirrors this for MCP clients — add to both.
 */

export interface RegistryEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  description: string;
  hasChildren: boolean;
}

export const REGISTRY: Record<string, RegistryEntry> = {
  Alert: {
    component: Alert,
    description: "Highlighted message box",
    hasChildren: true,
  },
  Callout: {
    component: Callout,
    description: "Inline aside for tips and notes",
    hasChildren: true,
  },
  Card: {
    component: Card,
    description: "Titled container for grouped content",
    hasChildren: true,
  },
  Tabs: {
    component: Tabs,
    description: "Tabbed panels; children must be <Tab>",
    hasChildren: true,
  },
  Tab: {
    component: Tab,
    description: "One panel inside <Tabs>",
    hasChildren: true,
  },
};

export const COMPONENT_NAMES = Object.keys(REGISTRY);
