import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render errors from a subtree and shows `fallback` instead.
 *
 * Preview uses this to survive a document whose MDX does not parse: React tears
 * down the whole tree on an uncaught render error, so without a boundary a single
 * stray `<` would blank the entire app rather than one pane.
 *
 * Give it a `key` that changes with the content so a fixed document re-renders
 * instead of staying stuck on the fallback.
 */

interface Props {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Preview render failed", error, info);
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}
