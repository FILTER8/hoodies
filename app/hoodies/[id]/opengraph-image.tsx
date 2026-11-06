/* eslint-disable @next/next/no-img-element -- next/og requires plain img elements. */
import { ImageResponse } from "next/og";
import sharp from "sharp";
import {
  defaultHomepage,
  fetchHomepage,
  fetchHomepageLive,
  mediaUrl,
} from "../../../lib/hoodieHomepage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "The World Wide Hood — personalized Hoodie homepage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ id: string }> };

type ImageMode = "tile" | "cover" | "contain" | "stretch";

const GREEN = "#ccff00";
const BLACK = "#000000";
const MAX_IMAGE_BYTES = 4_000_000;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function fetchArtwork(url: string): Promise<Buffer | null> {
  // Fully on-chain tokenURI images are frequently inline SVG/PNG data URLs.
  if (url.startsWith("data:")) {
    const match = /^data:(image\/(?:svg\+xml|png|jpeg|webp|gif))(;base64)?,([\s\S]*)$/i.exec(url);
    if (!match) return null;
    try {
      const bytes = match[2]
        ? Buffer.from(match[3], "base64")
        : Buffer.from(decodeURIComponent(match[3]), "utf8");
      return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
    } catch { return null; }
  }
  if (!url.startsWith("https://")) return null;
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!response.ok) return null;
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
    if (!["image/gif", "image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mime)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

async function pngDataUri(bytes: Buffer, width?: number): Promise<string | null> {
  try {
    // Animated GIFs are deliberately rendered as their first frame: Open Graph cards are static.
    let pipeline = sharp(bytes, { animated: false, limitInputPixels: 16_000_000 }).rotate();
    if (width) pipeline = pipeline.resize({ width, withoutEnlargement: false, kernel: "nearest" });
    const png = await pipeline.png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

async function makeBackground(
  bytes: Buffer,
  mode: ImageMode,
  scale: number,
  isNft: boolean,
  baseColor: string,
): Promise<string | null> {
  try {
    // Normalize GIF, SVG, WebP and NFT art to a still PNG before composition.
    const source = sharp(bytes, { animated: false, limitInputPixels: 16_000_000 }).rotate();
    const metadata = await source.metadata();
    const w = metadata.width || 1;
    const h = metadata.height || 1;
    const safeScale = Math.max(25, Math.min(300, scale));
    let backdrop: Buffer;

    if (mode === "tile") {
      // Mirror the public renderer: NFT tiles use pixels; uploaded backgrounds use % width.
      const tileWidth = isNft ? Math.round(safeScale * 1.5) : Math.round(size.width * safeScale / 100);
      const tw = Math.max(1, Math.min(2400, tileWidth));
      const th = Math.max(1, Math.round((h / w) * tw));
      const tile = await sharp(bytes, { animated: false, limitInputPixels: 16_000_000 })
        .resize({ width: tw, height: th, fit: "fill", kernel: "nearest" }).png().toBuffer();
      const tileUri = `data:image/png;base64,${tile.toString("base64")}`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><pattern id="tile" patternUnits="userSpaceOnUse" width="${tw}" height="${th}"><image href="${tileUri}" width="${tw}" height="${th}"/></pattern></defs><rect width="1200" height="630" fill="${xmlEscape(baseColor)}"/><rect width="1200" height="630" fill="url(#tile)"/></svg>`;
      backdrop = await sharp(Buffer.from(svg)).png().toBuffer();
    } else {
      const fit = mode === "contain" ? "contain" : mode === "stretch" ? "fill" : "cover";
      const rendered = await sharp(bytes, { animated: false, limitInputPixels: 16_000_000 })
        .resize(size.width, size.height, { fit, background: baseColor, kernel: "nearest" }).png().toBuffer();
      backdrop = rendered;
    }
    return `data:image/png;base64,${backdrop.toString("base64")}`;
  } catch (error) {
    console.error("HoodPage Open Graph background could not be rendered:", error);
    return null;
  }
}

export default async function OpenGraphImage({ params }: Props) {
  const { id: raw } = await params;
  const id = /^\d{1,4}$/.test(raw) && Number(raw) < 6000 ? Number(raw) : 0;
  const config = (await fetchHomepage(id)) || defaultHomepage(id);
  const isGreen = config.theme === "green";
  const ink = isGreen ? BLACK : GREEN;
  const paper = isGreen ? GREEN : BLACK;
  const pageBackground = safeColor(config.backgroundColor, paper);
  const identity = config.modules.find(m => m.type === "identity");
  const marquee = config.modules.find(m => m.type === "marquee");
  const bgConfig = config.background;
  const isNft = Boolean(bgConfig?.nft);

  let backgroundUrl = bgConfig?.asset ? mediaUrl("backgrounds", bgConfig.asset) : "";
  if (bgConfig?.nft) {
    // Resolve NFT artwork through the same public live inventory as the homepage itself.
    // This also supports contract/token IDs rather than freezing an old external image URL.
    try {
      const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://onchainhoodies.xyz";
      const live = await fetchHomepageLive(id, config, siteOrigin);
      const nft = live.nfts?.find(n =>
        n.contract.toLowerCase() === bgConfig.nft!.contract.toLowerCase() &&
        n.tokenId === bgConfig.nft!.tokenId && !n.spam,
      );
      if (nft?.image) backgroundUrl = nft.image;
    } catch (error) {
      console.error("HoodPage Open Graph NFT artwork lookup failed:", error);
    }
  }

  const [avatarBytes, backgroundBytes] = await Promise.all([
    fetchArtwork(`https://api.onchainhoodies.xyz/images/${id}.svg`),
    backgroundUrl ? fetchArtwork(backgroundUrl) : Promise.resolve(null),
  ]);
  const [avatar, background] = await Promise.all([
    avatarBytes ? pngDataUri(avatarBytes, 306) : Promise.resolve(null),
    backgroundBytes ? makeBackground(backgroundBytes, bgConfig?.mode || "tile", bgConfig?.scale ?? 100, isNft, pageBackground) : Promise.resolve(null),
  ]);

  const title = (config.title || "THE WORLD WIDE HOOD").slice(0, 70).toUpperCase();
  const welcome = marquee?.type === "marquee"
    ? marquee.text.replace(/\[\[gif:[^\]]+\]\]/gi, "").slice(0, 85)
    : `WELCOME TO HOODIE #${id}`;
  const panelFill = paper; // Opaque labels remain readable over patterned and bright backgrounds.

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: pageBackground, color: ink, fontFamily: "monospace", position: "relative", overflow: "hidden" }}>
      {background && <img src={background} alt="" style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "fill" }} />}
      <div style={{ display: "flex", position: "absolute", inset: 0, padding: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", border: `5px solid ${ink}`, padding: 20, position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 21, letterSpacing: 2, backgroundColor: panelFill, padding: "8px 14px" }}>
            <span>ONCHAINHOODIES / PERSONAL WEB</span><span>EST. 2026</span>
          </div>
          <div style={{ display: "flex", flex: 1, gap: 30, alignItems: "center", justifyContent: "space-between", padding: "12px 10px" }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 700, gap: 22, alignItems: "flex-start" }}>
              <div style={{ display: "flex", fontSize: 25, letterSpacing: 2, backgroundColor: panelFill, padding: "10px 14px" }}>★ {welcome || "WELCOME TO MY PAGE"} ★</div>
              <div style={{ display: "flex", fontSize: title.length > 30 ? 42 : title.length > 19 ? 53 : 68, fontWeight: 900, lineHeight: 1.1, backgroundColor: panelFill, padding: "12px 14px", overflow: "hidden", maxWidth: 700 }}>{title}</div>
              <div style={{ display: "flex", fontSize: 25, backgroundColor: panelFill, padding: "8px 14px" }}>HOODIE #{id} · MY CORNER OF THE INTERNET</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 330, height: 330, backgroundColor: ink, border: `6px solid ${paper}`, flexShrink: 0 }}>
              {avatar ? <img src={avatar} width={306} height={306} alt="" style={{ width: 306, height: 306, objectFit: "contain", imageRendering: "pixelated" }} /> : <span style={{ fontSize: 90, color: paper }}>#{id}</span>}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", backgroundColor: panelFill, padding: "8px 14px", fontSize: 23 }}>
            <span>THE WORLD WIDE HOOD</span><span>ONCHAINHOODIES.XYZ/HOODIES/{id}</span>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
