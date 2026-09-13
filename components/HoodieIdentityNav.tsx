"use client";

import Link from "next/link";
import { BookOpen, Flag, Wallet } from "pixelarticons/react";

type IdentitySection = "wallet" | "journey" | "passport";

export default function HoodieIdentityNav({
  tokenId,
  active,
  className = "",
}: {
  tokenId?: string | number | null;
  active: IdentitySection;
  className?: string;
}) {
  const id =
    tokenId === null || tokenId === undefined
      ? ""
      : String(tokenId).trim();

  const suffix = /^\d+$/.test(id)
    ? `?hoodie=${encodeURIComponent(id)}`
    : "";

  const items = [
    {
      key: "wallet" as const,
      label: "HoodWallet",
      detail: "Own + act",
      href: `/hoodwallet${suffix}`,
      Icon: Wallet,
    },
    {
      key: "journey" as const,
      label: "Journey",
      detail: "History + milestones",
      href: `/journey${suffix}`,
      Icon: Flag,
    },
    {
      key: "passport" as const,
      label: "Passport",
      detail: "Identity + record",
      href: `/passport${suffix}`,
      Icon: BookOpen,
    },
  ];

  return (
    <nav
      aria-label="Hoodie identity"
      className={`grid grid-cols-3 border border-current ${className}`}
    >
      {items.map(({ key, label, detail, href, Icon }, index) => {
        const selected = key === active;

        return (
          <Link
            key={key}
            href={href}
            aria-current={selected ? "page" : undefined}
            className={`group flex min-w-0 items-center gap-2 px-3 py-3 transition-colors md:gap-3 md:px-4 ${
              index > 0 ? "border-l border-current" : ""
            } ${
              selected
                ? "bg-black text-[#ccff00]"
                : "hover:bg-black hover:text-[#ccff00]"
            }`}
          >
            <Icon
              width={32}
              height={32}
              aria-hidden="true"
              className="shrink-0 md:h-9 md:w-9"
            />

            <span className="min-w-0">
              <span className="block truncate text-[9px] uppercase tracking-[0.1em] md:text-[11px]">
                {label}
              </span>
              <span className="mt-1 hidden truncate text-[6px] uppercase tracking-[0.08em] opacity-55 sm:block md:text-[7px]">
                {detail}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
