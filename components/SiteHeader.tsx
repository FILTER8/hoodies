"use client";

import Link from "next/link";
import { useState } from "react";
import WalletButton from "./WalletButton";
import { siteConfig } from "../lib/config";

const links = [
  { href: "/#collection", label: "Collection" },
  { href: "/#builds", label: "Builds" },
  { href: "/tools/export", label: "Exporter" },
  { href: "/cam", label: "Cam" },
  { href: "/#contracts", label: "Contracts" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b-2 border-black bg-[#ccff00]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:px-8">
        <Link href="/" className="text-sm tracking-[0.28em]">
          {siteConfig.shortName}
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[11px] uppercase tracking-[0.16em] hover:underline hover:underline-offset-4"
            >
              {link.label}
            </Link>
          ))}

          <a
            href={siteConfig.openSeaUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] uppercase tracking-[0.16em] hover:underline hover:underline-offset-4"
          >
            OpenSea
          </a>

          <WalletButton />
        </nav>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="border-2 border-black px-3 py-2 text-[10px] uppercase tracking-[0.16em] lg:hidden"
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div className="border-t-2 border-black bg-[#ccff00] p-4 lg:hidden">
          <div className="grid gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-2 border-black px-4 py-3 text-xs uppercase tracking-[0.16em]"
              >
                {link.label}
              </Link>
            ))}
            <a
              href={siteConfig.openSeaUrl}
              target="_blank"
              rel="noreferrer"
              className="border-2 border-black px-4 py-3 text-xs uppercase tracking-[0.16em]"
            >
              OpenSea
            </a>
            <WalletButton />
          </div>
        </div>
      )}
    </header>
  );
}
