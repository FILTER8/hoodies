export type TextSize = "sm" | "md" | "lg" | "xl";
export type ModuleAppearance = { align?: "left" | "center" | "right"; inverted?: boolean; framed?: boolean; size?: TextSize; textFill?: "none" | "black" | "robin" };
export type HomepageModule = ModuleAppearance & (
  | { id: string; type: "identity"; avatarSize?: number; showSubtitle?: boolean }
  | { id: string; type: "talk" }
  | { id: string; type: "text"; title: string; text: string }
  | { id: string; type: "links"; items: { label: string; url: string; gif?: string }[] }
  | { id: string; type: "divider"; style: "stars" | "line"; asset?: string }
  | { id: string; type: "marquee"; text: string }
  | { id: string; type: "assets"; showTokens?: boolean; showNfts?: boolean; tokenSymbols?: string[]; nftKeys?: string[]; limit?: number }
  | { id: string; type: "following"; showFollowers?: boolean; showFollowing?: boolean; showLists?: boolean }
  | { id: string; type: "memory"; limit?: number; category?: string; showStats?: boolean }
  | { id: string; type: "netmint"; collection: string; title?: string }
  | { id: string; type: "journey"; completedOnly?: boolean; limit?: number; showStats?: boolean }
  | { id: string; type: "decor"; asset: string; width?: number }
  | { id: string; type: "midi"; asset: string; label?: string; loop?: boolean }
);
export const MEDIA_BASE = "https://assets.onchainhoodies.xyz/hoodpage";
export type MediaItem = { file: string; label: string; url: string };
export type MediaLibrary = { gifs: MediaItem[]; backgrounds: MediaItem[]; decorations: MediaItem[]; midi: MediaItem[] };
export const EMPTY_MEDIA: MediaLibrary = { gifs: [], backgrounds: [], decorations: [], midi: [] };
// Filename-only paths. R2 listing is the authority; never accept arbitrary remote URLs.
export function mediaFilename(file: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}\.(gif|png|webp|jpg|jpeg)$/i.test(file) && !file.includes("..");
}
export function midiFilename(file: string): boolean {
  return typeof file === "string" && file.length <= 160 && /^[^/\\\x00-\x1f?#]+\.(mid|midi)$/iu.test(file) && !file.includes("..");
}
export function mediaUrl(kind: "gifs" | "backgrounds" | "decorations" | "midi", file: string): string {
  return (kind === "midi" ? midiFilename(file) : mediaFilename(file)) ? (kind === "midi" ? homepageApi(`/v1/homepage/midi/${encodeURIComponent(file)}`) : `${MEDIA_BASE}/${kind}/${encodeURIComponent(file)}`) : "";
}
export async function fetchMediaLibrary(): Promise<MediaLibrary> {
  const response = await fetch(homepageApi("/v1/homepage/assets"));
  if (!response.ok) throw new Error(`Media library unavailable (${response.status})`);
  const data = await response.json() as Partial<MediaLibrary>;
  const clean = (items: MediaItem[] | undefined, kind: "gifs" | "backgrounds" | "decorations" | "midi") =>
    (Array.isArray(items) ? items : []).filter(item => item && typeof item.file === "string" && (kind === "midi" ? midiFilename(item.file) : mediaFilename(item.file)))
      .map(item => ({ file: item.file, label: String(item.label || item.file), url: mediaUrl(kind, item.file) }));
  return { gifs: clean(data.gifs, "gifs"), backgrounds: clean(data.backgrounds, "backgrounds"), decorations: clean(data.decorations, "decorations"), midi: clean(data.midi, "midi") };
}
export type BackgroundMode = "tile" | "cover" | "contain" | "stretch";
export type HomepageConfig = {
  version: 2;
  theme: "robin" | "green";
  backgroundColor?: string;
  background?: { asset?: string; nft?: { contract: string; tokenId: string }; mode: BackgroundMode; scale: number };
  title?: string;
  showOuterFrame?: boolean;
  modules: HomepageModule[];
};
export type HomepageDirectoryEntry = { tokenId: number; updatedAt: string; title: string; preview?: { theme: "robin" | "green"; backgroundColor?: string; background?: { asset?: string; nft?: { contract: string; tokenId: string }; mode: BackgroundMode; scale: number }; avatarSize?: number; marquee?: string; about?: string; decorations?: Array<{kind: "gifs" | "decorations"; file: string}> } };
export type HomepageNft = { contract: string; tokenId: string; name: string; collectionName: string; image?: string; balance?: string; spam?: boolean };
export type HomepageAsset = { symbol: string; name: string; balanceFormatted: string; contract?: string };
export type HomepageJourney = { name: string; completed: boolean; description?: string; href?: string };
export type HomepageMemoryEvent = { type: string; title?: string; detail?: string; source?: string; timestamp?: number; transactionHash?: string };
export type HomepageLiveData = { memoryStats?: { totalMemories: number; hoodIts: number }; memory?: HomepageMemoryEvent[]; quote?: string; wallet?: string; assets?: HomepageAsset[]; nfts?: HomepageNft[]; milestones?: HomepageJourney[] };

export function defaultHomepage(id: number): HomepageConfig {
  return {
    version: 2, theme: "robin", title: "THE WORLD WIDE HOOD", showOuterFrame: false, modules: [
      { id: "welcome", type: "marquee", text: `★ WELCOME TO HOODIE #${id}'S HOMEPAGE ★`, framed: false },
      { id: "identity", type: "identity", avatarSize: 144, size: "lg", framed: false, showSubtitle: true },
      { id: "talk", type: "talk", framed: true, textFill: "black" },
      { id: "about", type: "text", title: "ABOUT ME", text: "Welcome to my corner of the Hood. Make yourself at home!", framed: true, textFill: "black" },
      { id: "divider", type: "divider", style: "stars", framed: false },
      { id: "links", type: "links", items: [
        { label: "MY HOODIE", url: `https://onchainhoodies.xyz/hoodies/${id}` },
        { label: "THE HOOD", url: "https://onchainhoodies.xyz/hoodos" },
      ], framed: false },
    ],
  };
}
export function homepageApi(path: string): string {
  const base = process.env.NEXT_PUBLIC_PRODUCTION_API_URL?.trim() || "https://api.onchainhoodies.xyz";
  return `${base.replace(/\/+$/, "")}${path}`;
}
export async function fetchHomepage(id: number): Promise<HomepageConfig | null> {
  try {
    const response = await fetch(homepageApi(`/v1/homepage/${id}`), { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { config?: HomepageConfig | null };
    return data.config?.version === 2 && Array.isArray(data.config.modules) ? data.config : null;
  } catch { return null; }
}
export async function fetchHomepageLive(id: number, config: HomepageConfig, siteOrigin?: string): Promise<HomepageLiveData> {
  const needsJourney = config.modules.some(m => m.type === "journey" || m.type === "assets") || Boolean(config.background?.nft);
  const needsAssets = config.modules.some(m => m.type === "assets") || Boolean(config.background?.nft);
  const needsMemory = config.modules.some(m => m.type === "memory" || m.type === "journey");
  const live: HomepageLiveData = {};
  const [talk, journey, memory] = await Promise.allSettled([
    fetch(homepageApi(`/v1/token/${id}/hood-talk/history`), { cache: "no-store" }).then(r => r.ok ? r.json() : null),
    needsJourney ? fetch(homepageApi(`/v1/token/${id}/journey`), { cache: "no-store" }).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
    needsMemory ? fetch(homepageApi(`/v1/token/${id}/memory?limit=100`), {cache: "no-store"}).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
  ]);
  if (talk.status === "fulfilled" && talk.value) {
    const talks = (talk.value as {talks?: Array<{ quote?: string; count?: number; sequence?: number }>}).talks || [];
    live.quote = [...talks].sort((a,b)=>(b.count ?? b.sequence ?? 0)-(a.count ?? a.sequence ?? 0))[0]?.quote || "";
  }
  if (journey.status === "fulfilled" && journey.value) {
    const value = journey.value as { hoodWallet?: {address?: string | null}; milestones?: Array<HomepageJourney> };
    live.wallet = value.hoodWallet?.address || "";
    live.milestones = (value.milestones || []).map(m => ({ name: m.name, completed: Boolean(m.completed), description: m.description, href: m.href }));
  }
  if (memory.status === "fulfilled" && memory.value) {
    const payload = memory.value as {summary?: {totalMemories?: number; hoodIts?: number}; timeline?: {events?: HomepageMemoryEvent[]}};
    const timeline = payload.timeline;
    if (payload.summary) live.memoryStats = { totalMemories: Number(payload.summary.totalMemories) || 0, hoodIts: Number(payload.summary.hoodIts) || 0 };
    live.memory = Array.isArray(timeline?.events) ? timeline.events.slice(0, 100) : [];
  }
  // Use the existing Next.js server endpoint. On client it is same-origin; on server pass the origin explicitly.
  if (needsAssets && live.wallet) {
    try {
      const base = siteOrigin || "";
      const response = await fetch(`${base}/api/hoodwallet/assets?address=${encodeURIComponent(live.wallet)}`, { cache: "no-store" });
      if (response.ok) {
        const inventory = await response.json() as { assets?: HomepageAsset[]; nfts?: HomepageNft[] };
        live.assets = (inventory.assets || []).slice(0, 100);
        live.nfts = (inventory.nfts || []).filter(n => !n.spam).slice(0, 100);
      }
    } catch { /* Inventory is optional; homepage should still load. */ }
  }
  return live;
}
