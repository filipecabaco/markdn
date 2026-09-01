import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

export function Card({ title, subtitle, children }: CardProps) {
  return (
    <section className="mdx-card">
      <header className="mdx-card__header">
        <h3 className="mdx-card__title">{title}</h3>
        {subtitle && <p className="mdx-card__subtitle">{subtitle}</p>}
      </header>
      <div className="mdx-card__body">{children}</div>
    </section>
  );
}
