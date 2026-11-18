"use client";

import Link from "next/link";
import { useState } from "react";
import { siteConfig } from "../lib/config";
import WalletButton from "./WalletButton";

const links = [
  { href: "/hoodies", label: "Hoodies" },
  { href: "/hoodos", label: "HoodOS" },
  { href: "/journey", label: "Journey" },
  { href: "/builders", label: "Builders" },
];
const SKILL_URL = "https://github.com/FILTER8/onchainhoodies-bankr-skill";

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b-2 border-[var(--hood-fg)] bg-[var(--hood-bg)] text-[var(--hood-fg)]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-5 px-4 md:px-8">
        <Link href="/" className="shrink-0 text-sm tracking-[0.18em]" aria-label="OnChainHoodies home">{siteConfig.shortName}</Link>
        <nav className="hidden items-center gap-5 lg:flex" aria-label="Main navigation">
          {links.map(link => <Link key={link.href} href={link.href} className="text-[10px] uppercase tracking-[0.13em] hover:underline hover:underline-offset-4">{link.label}</Link>)}
          <a href={SKILL_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-[0.13em] hover:underline hover:underline-offset-4">AI Agents ↗</a>
          <WalletButton />
        </nav>
        <button type="button" onClick={() => setOpen(value => !value)} className="border-2 border-[var(--hood-fg)] px-3 py-2 text-[10px] uppercase tracking-[0.16em] lg:hidden" aria-expanded={open} aria-controls="hood-mobile-nav" aria-label="Toggle navigation">{open ? "Close" : "Menu"}</button>
      </div>
      {open && <nav id="hood-mobile-nav" className="border-t-2 border-[var(--hood-fg)] bg-[var(--hood-bg)] p-4 lg:hidden" aria-label="Mobile navigation">
        <div className="grid gap-3">
          {links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="border-2 border-[var(--hood-fg)] px-4 py-3 text-xs uppercase tracking-[0.16em]">{link.label}</Link>)}
          <a href={SKILL_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="border-2 border-[var(--hood-fg)] px-4 py-3 text-xs uppercase tracking-[0.16em]">AI Agents ↗</a>
          <div className="border-2 border-[var(--hood-fg)] p-3"><p className="mb-3 text-[8px] uppercase tracking-[0.12em] opacity-65">Active network / {siteConfig.chainName}</p><WalletButton /></div>
        </div>
      </nav>}
    </header>
  );
}
