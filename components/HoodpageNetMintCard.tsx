/* eslint-disable @next/next/no-img-element -- NFT art includes arbitrary on-chain SVG and IPFS images. */
"use client";

import { useEffect, useState } from "react";
import { Contract, JsonRpcProvider, isAddress } from "ethers";
import { siteConfig } from "../lib/config";

const ABI = ["function name() view returns (string)", "function tokenURI(uint256) view returns (string)"] as const;
type Preview = { title: string; image?: string; tokenName?: string; error?: string };

function mediaUri(uri: unknown): string | undefined {
  if (typeof uri !== "string") return undefined;
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7).replace(/^ipfs\//, "")}`;
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  if (/^https:\/\//i.test(uri) || /^data:image\/(?:svg\+xml|png|gif|jpeg|webp)/i.test(uri)) return uri;
  return undefined;
}
async function tokenMetadata(uri: string): Promise<{ name?: string; image?: string }> {
  let data: unknown;
  if (uri.startsWith("data:application/json")) {
    const match = /^data:application\/json(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(uri);
    if (!match) throw new Error("Unsupported token metadata");
    data = JSON.parse(match[1] ? new TextDecoder().decode(Uint8Array.from(atob(match[2]), c => c.charCodeAt(0))) : decodeURIComponent(match[2]));
  } else {
    const url = mediaUri(uri);
    if (!url || url.startsWith("data:")) throw new Error("Token metadata URI unavailable");
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Token metadata unavailable");
    data = await response.json() as unknown;
  }
  if (!data || typeof data !== "object") return {};
  const metadata = data as Record<string, unknown>;
  return { name: typeof metadata.name === "string" ? metadata.name : undefined, image: mediaUri(metadata.image ?? metadata.image_url) };
}

export default function HoodpageNetMintCard({ collection }: { collection: string }) {
  const [preview, setPreview] = useState<Preview>({ title: "READING COLLECTION…" });
  useEffect(() => {
    let cancelled = false;
    async function read() {
      if (!isAddress(collection)) { setPreview({ title: "SET A COLLECTION ADDRESS" }); return; }
      setPreview({ title: "READING COLLECTION…" });
      try {
        const provider = new JsonRpcProvider(siteConfig.rpcUrl, Number(siteConfig.chainId), { staticNetwork: true });
        const nft = new Contract(collection, ABI, provider);
        const title = String(await nft.name());
        if (!cancelled) setPreview({ title });
        try {
          const metadata = await tokenMetadata(String(await nft.tokenURI(BigInt(1))));
          if (!cancelled) setPreview({ title, image: metadata.image, tokenName: metadata.name });
        } catch {
          if (!cancelled) setPreview({ title, error: "Token #1 artwork is not available yet." });
        }
      } catch {
        if (!cancelled) setPreview({ title: "COLLECTION UNAVAILABLE", error: "Could not read the collection contract." });
      }
    }
    void read();
    return () => { cancelled = true; };
  }, [collection]);
  return <div className="flex flex-col items-center gap-3">
    <p className="text-[10px] tracking-widest opacity-75">FROM THE HOOD · NET MINT</p>
    <h2 className="break-words text-base font-bold sm:text-xl">{preview.title}</h2>
    {preview.image && <img src={preview.image} alt={preview.tokenName || `${preview.title} — token #1`} loading="lazy" className="aspect-square w-full max-w-52 border border-current object-contain [image-rendering:pixelated]" />}
    {preview.image && <p className="text-[10px] opacity-80">{preview.tokenName || "TOKEN #1"}</p>}
    {preview.error && <p className="text-[10px] opacity-70">{preview.error}</p>}
    <p className="break-all text-[9px] opacity-70">{collection}</p>
    {isAddress(collection) && <a href={`/hoodos/netmint?collection=${encodeURIComponent(collection)}`} className="inline-block border border-current px-5 py-3 text-xs font-bold hover:opacity-70">OPEN MINT ↗</a>}
  </div>;
}
