import Link from "next/link";
import { siteConfig } from "../lib/config";

export default function SiteFooter() {
  return (
    <footer className="border-t-2 border-black bg-[#ccff00] px-6 py-10 text-black">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xl tracking-[0.22em]">HOODIES</p>
          <p className="mt-3 max-w-md text-xs uppercase leading-relaxed tracking-[0.14em] opacity-70">
            The collection is permanent. The Hood keeps building.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 text-[11px] uppercase tracking-[0.16em]">
          <Link href="/api">API</Link>
                   <a href={siteConfig.discordUrl} target="_blank" rel="noreferrer">
            Discord
          </a>
          <a href={siteConfig.openSeaUrl} target="_blank" rel="noreferrer">
            OpenSea
          </a>
          <a href={siteConfig.githubUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={siteConfig.xUrl} target="_blank" rel="noreferrer">
            X
          </a>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-[1440px] flex-wrap justify-between gap-3 border-t-2 border-black pt-5 text-[10px] uppercase tracking-[0.16em]">
        <span>CC0</span>
        <span>Fully On-Chain</span>
        <span>{siteConfig.chainName}</span>
      </div>
    </footer>
  );
}
