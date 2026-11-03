import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

/** shadcn's Card: title and description over the content. */
export function Card({ title, subtitle, children }: CardProps) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10">
      <header className="flex flex-col gap-1 px-4">
        <h3 className="m-0 text-base leading-snug font-medium">{title}</h3>
        {subtitle && <p className="m-0 text-sm text-muted-foreground">{subtitle}</p>}
      </header>
      <div className="mdx-body px-4">{children}</div>
    </section>
  );
}
