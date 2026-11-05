import type { Metadata } from "next";
import Link from "next/link";
import HoodieHomepageEditLink from "../../../components/HoodieHomepageEditLink";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import HoodieHomepageView from "../../../components/HoodieHomepageView";
import { defaultHomepage, fetchHomepage, fetchHomepageLive } from "../../../lib/hoodieHomepage";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Hoodie #${id}'s homepage`, description: `Visit Hoodie #${id}'s home on the World Wide Hood.` };
}
export default async function HoodiePublicPage({ params }: Props) {
  const { id: raw } = await params;
  if (!/^\d+$/.test(raw) || Number(raw) > 5999 || Number(raw) < 0) {
    return <main className="min-h-screen bg-black p-10 text-[#ccff00]">Hoodie not found.</main>;
  }
  const id = Number(raw);
  const config = await fetchHomepage(id) || defaultHomepage(id);
  const live = await fetchHomepageLive(id, config, process.env.NEXT_PUBLIC_SITE_URL || "https://onchainhoodies.xyz");
  return <main className="min-h-screen bg-black text-[#ccff00]">
    <SiteHeader />
    <div className="w-full pt-24 sm:pt-28">
      <nav className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[10px] uppercase tracking-widest sm:px-8">
        <Link href="/hoodie" className="underline underline-offset-4">← WORLD WIDE HOOD</Link>
        <HoodieHomepageEditLink id={id}/>
      </nav>
      <HoodieHomepageView id={id} config={config} live={live}/>
    </div>
    <SiteFooter />
  </main>;
}
