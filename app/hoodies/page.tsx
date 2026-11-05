import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import HoodieHomepageTile from "../../components/HoodieHomepageTile";
import { homepageApi, type HomepageDirectoryEntry } from "../../lib/hoodieHomepage";

export const dynamic = "force-dynamic";
type DirectoryResponse = { total: number; entries: HomepageDirectoryEntry[] };
export default async function HomepageDirectory({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.min(250, Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const perPage = 24;
  let listing: DirectoryResponse = { total: 0, entries: [] };
  let unavailable = false;
  try {
    const response = await fetch(homepageApi(`/v1/homepage/directory?offset=${(page - 1) * perPage}&limit=${perPage}`), { cache: "no-store" });
    if (!response.ok) throw new Error("Directory unavailable");
    listing = await response.json() as DirectoryResponse;
  } catch { unavailable = true; }
  const totalPages = Math.max(1, Math.ceil(listing.total / perPage));
  return <main className="min-h-screen bg-black text-[#ccff00] [font-family:DepartureMono,monospace]">
    <SiteHeader />
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-28 sm:px-8 sm:pt-32">
      <div className="mb-6 border-b border-[#ccff00] pb-6"><p className="text-[11px] tracking-widest">ONCHAINHOODIES / PERSONAL WEB</p><h1 className="mt-3 text-3xl sm:text-5xl">THE WORLD WIDE HOOD</h1><p className="mt-4 max-w-2xl text-sm leading-relaxed">Explore homepages made by Hoodies, newest updates first. Every page stays with its Hoodie when ownership changes.</p></div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><p className="text-xs">{listing.total} PUBLISHED HOMEPAGES</p><Link href="/hoodos/homepage" className="border border-[#ccff00] px-4 py-3 text-xs hover:bg-[#ccff00] hover:text-black">CREATE YOUR HOMEPAGE ↗</Link></div>
      {unavailable ? <p role="alert">The homepage directory is temporarily unavailable.</p> : listing.entries.length === 0 ? <p>No published pages yet. Be the first to create one!</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{listing.entries.map(entry => <HoodieHomepageTile key={entry.tokenId} entry={entry} />)}</div>}
      {totalPages > 1 && <nav className="mt-8 flex justify-between text-xs">{page > 1 ? <Link href={`/hoodie?page=${page - 1}`} className="underline">← PREVIOUS</Link> : <span/>}<span>{page} / {totalPages}</span>{page < totalPages ? <Link href={`/hoodie?page=${page + 1}`} className="underline">NEXT →</Link> : <span/>}</nav>}
    </div><SiteFooter />
  </main>;
}
