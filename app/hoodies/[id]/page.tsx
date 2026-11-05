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
  const pageUrl = `https://onchainhoodies.xyz/hoodies/${id}`;
  const config = /^\d{1,4}$/.test(id) && Number(id) < 6000 ? await fetchHomepage(Number(id)) : null;
  const title = config?.title ? `${config.title} — Hoodie #${id}` : `Hoodie #${id}'s Homepage`;
  const description = `Explore Hoodie #${id}'s personal homepage on the World Wide Hood. One Hoodie, one homepage, inherited by every new owner.`;
  return {
    metadataBase: new URL("https://onchainhoodies.xyz"),
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: { title, description, url: pageUrl, siteName:"OnChainHoodies",type:"website",images:[{url:`${pageUrl}/opengraph-image`,width:1200,height:630,alt:`Hoodie #${id} personalized homepage`}] },
    twitter: { card: "summary_large_image", title, description, images: [`${pageUrl}/opengraph-image`] },
  };
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
        <Link href="/hoodies" className="underline underline-offset-4">← WORLD WIDE HOOD</Link>
        <div className="flex flex-wrap items-center gap-3">
          
<a
  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `Visit Hoodie #${id}'s homepage on the World Wide Hood!\n\n@OnChainHoodies`
  )}&url=${encodeURIComponent(
    `https://onchainhoodies.xyz/hoodies/${id}`
  )}`}
  target="_blank"
  rel="noopener noreferrer"
  className="border border-[#ccff00] px-3 py-2 hover:bg-[#ccff00] hover:text-black"
>
  SHARE ON X ↗
</a>

          <HoodieHomepageEditLink id={id}/>
        </div>
      </nav>
      <HoodieHomepageView id={id} config={config} live={live}/>
    </div>
    <SiteFooter />
  </main>;
}
