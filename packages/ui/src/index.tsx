import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren, ReactNode } from "react";

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`sf-button sf-button--${variant} ${className}`} {...props} />;
}

export function Badge({ tone = "neutral", className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "active" | "success" | "warning" | "danger" }) {
  return <span className={`sf-badge sf-badge--${tone} ${className}`} {...props} />;
}

export function Panel({ title, eyebrow, actions, className = "", children }: PropsWithChildren<{ title?: string; eyebrow?: string; actions?: ReactNode; className?: string }>) {
  return <section className={`sf-panel ${className}`}>
    {(title || eyebrow || actions) && <header className="sf-panel__header"><div>{eyebrow && <div className="sf-eyebrow">{eyebrow}</div>}{title && <h2>{title}</h2>}</div>{actions}</header>}
    {children}
  </section>;
}
