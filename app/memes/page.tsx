"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";

type Hoodie = {
  tokenId: string;
  name: string;
  image: string;
};

type MemeStatus = "active" | "under_review" | "hidden" | "removed";
type MemeSort = "new" | "popular" | "most-used";
type FlagReason =
  | "harassment"
  | "nsfw"
  | "spam"
  | "stolen"
  | "unrelated"
  | "other" ;

type Meme = {
  id: string;
  title: string;
  imageUrl: string;
  mediaType: "image" | "gif";
  creator: string;
  hoodieId: string;
  hoodieImage?: string;
  createdAt: string;
  status: MemeStatus;
  favorites: number;
  downloads: number;
  shareClicks: number;
  usageScore: number;
  viewerHasFavorited?: boolean;
  viewerHasFlagged?: boolean;
};

type MemeListResponse = {
  items?: Meme[];
  nextCursor?: string | null;
  error?: string;
};

type HoodieResponse = {
  items?: Hoodie[];
  error?: string;
};

type UploadForm = {
  title: string;
  hoodieId: string;
  file: File | null;
};

const API_IMAGE_BASE = "https://api.onchainhoodies.xyz";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const demoMemes: Meme[] = [
  {
    id: "demo-001",
    title: "THE HOOD KEEPS BUILDING",
    imageUrl: `${API_IMAGE_BASE}/images/1479.svg`,
    mediaType: "image",
    creator: "0x42f8...0c21",
    hoodieId: "1479",
    createdAt: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
    status: "active",
    favorites: 42,
    downloads: 18,
    shareClicks: 29,
    usageScore: 217,
  },
  {
    id: "demo-002",
    title: "GM FROM MY HOOD",
    imageUrl: `${API_IMAGE_BASE}/images/3738.svg`,
    mediaType: "image",
    creator: "0x91a3...8bd2",
    hoodieId: "3738",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    status: "active",
    favorites: 31,
    downloads: 22,
    shareClicks: 17,
    usageScore: 182,
  },
  {
    id: "demo-003",
    title: "BUILD. CREATE. COLLECT. SHIP.",
    imageUrl: `${API_IMAGE_BASE}/images/242.svg`,
    mediaType: "image",
    creator: "0xf81e...11a0",
    hoodieId: "242",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    status: "active",
    favorites: 23,
    downloads: 14,
    shareClicks: 20,
    usageScore: 151,
  },
];

function shortAddress(address: string) {
  if (!address) return "Unknown";
  if (address.includes("...")) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function hoodieArtwork(tokenId: string) {
  return `${API_IMAGE_BASE}/images/${tokenId}.svg`;
}

function sortMemes(items: Meme[], sort: MemeSort) {
  return [...items].sort((left, right) => {
    if (sort === "popular") return right.favorites - left.favorites;
    if (sort === "most-used") return right.usageScore - left.usageScore;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function WindowButton({
  children,
  onClick,
  disabled = false,
  active = false,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`win-button ${active ? "win-button-active" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

function WindowFrame({
  title,
  children,
  className = "",
  actions,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`win-window ${className}`}>
      <div className="win-titlebar">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden>▣</span>
          <span className="truncate">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <span className="win-title-control" aria-hidden>
            _
          </span>
          <span className="win-title-control" aria-hidden>
            □
          </span>
          <span className="win-title-control" aria-hidden>
            ×
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}

function MemeCard({ meme, onOpen }: { meme: Meme; onOpen: () => void }) {
  return (
    <button
      type="button"
      onDoubleClick={onOpen}
      onClick={onOpen}
      className="group min-w-0 text-left"
      aria-label={`Open ${meme.title}`}
    >
      <div className="relative aspect-square overflow-hidden border-2 border-transparent bg-white p-1 group-hover:border-[#000080] group-focus:border-[#000080]">
        <img
          src={meme.imageUrl}
          alt={meme.title}
          loading="lazy"
          decoding="async"
          className="image-render-pixel h-full w-full object-cover"
        />
        {meme.mediaType === "gif" && (
          <span className="absolute bottom-2 right-2 border border-black bg-[#c0c0c0] px-1.5 py-0.5 text-[9px] uppercase">
            GIF
          </span>
        )}
      </div>
      <div className="mx-auto mt-1 max-w-[95%] px-1 py-0.5 text-center text-[11px] leading-tight group-hover:bg-[#000080] group-hover:text-white group-focus:bg-[#000080] group-focus:text-white">
        <p className="line-clamp-2">{meme.title}</p>
        <p className="mt-1 text-[9px] opacity-70">Hoodie #{meme.hoodieId}</p>
      </div>
    </button>
  );
}

export default function MemeRegistryPage() {
  const { address, connect } = useWallet();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [memes, setMemes] = useState<Meme[]>([]);
  const [hoodies, setHoodies] = useState<Hoodie[]>([]);
  const [selectedMeme, setSelectedMeme] = useState<Meme | null>(null);
  const [sort, setSort] = useState<MemeSort>("new");
  const [query, setQuery] = useState("");
  const [loadingMemes, setLoadingMemes] = useState(true);
  const [loadingHoodies, setLoadingHoodies] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState<FlagReason>("spam");
  const [flagNote, setFlagNote] = useState("");
  const [form, setForm] = useState<UploadForm>({
    title: "",
    hoodieId: "",
    file: null,
  });

  const loadMemes = useCallback(async () => {
    setLoadingMemes(true);
    setError(null);

    try {
      const response = await fetch(`/api/memes?sort=${sort}`, {
        cache: "no-store",
      });

      if (!response.ok) throw new Error("The meme registry is not online yet.");

      const data = (await response.json()) as MemeListResponse;
      setMemes(data.items || []);
    } catch {
      // The demo entries keep the new page useful before the API routes are deployed.
      setMemes(sortMemes(demoMemes, sort));
    } finally {
      setLoadingMemes(false);
    }
  }, [sort]);

  useEffect(() => {
    void loadMemes();
  }, [loadMemes]);

  useEffect(() => {
    if (!address) {
      setHoodies([]);
      setForm((current) => ({ ...current, hoodieId: "" }));
      return;
    }

    const controller = new AbortController();

    async function loadHoodies() {
      setLoadingHoodies(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/hoodies?${new URLSearchParams({ owner: address }).toString()}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = (await response.json()) as HoodieResponse;

        if (!response.ok) {
          throw new Error(data.error || "Unable to load your Hoodies.");
        }

        const unique = Array.from(
          new Map((data.items || []).map((item) => [item.tokenId, item])).values()
        ).sort((a, b) => Number(a.tokenId) - Number(b.tokenId));

        setHoodies(unique);
        setForm((current) => ({
          ...current,
          hoodieId:
            current.hoodieId && unique.some((h) => h.tokenId === current.hoodieId)
              ? current.hoodieId
              : unique[0]?.tokenId || "",
        }));
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setHoodies([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your Hoodies."
        );
      } finally {
        if (!controller.signal.aborted) setLoadingHoodies(false);
      }
    }

    void loadHoodies();
    return () => controller.abort();
  }, [address]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const visibleMemes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const active = memes.filter((meme) => meme.status === "active");
    const filtered = !needle
      ? active
      : active.filter(
          (meme) =>
            meme.title.toLowerCase().includes(needle) ||
            meme.hoodieId.includes(needle) ||
            meme.creator.toLowerCase().includes(needle)
        );

    return sortMemes(filtered, sort);
  }, [memes, query, sort]);

  const totalUses = useMemo(
    () => memes.reduce((sum, meme) => sum + meme.usageScore, 0),
    [memes]
  );

  function resetUpload() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setForm({ title: "", hoodieId: hoodies[0]?.tokenId || "", file: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setError(null);

    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please upload a PNG, JPG, WEBP, or GIF.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("The file must be smaller than 15 MB.");
      event.target.value = "";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);
    setForm((current) => ({ ...current, file }));
  }

  async function submitMeme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!address) {
      await connect();
      return;
    }
    if (!form.file || !form.hoodieId || !form.title.trim()) {
      setError("Choose a Hoodie, title the meme, and select a file.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = new FormData();
      payload.append("file", form.file);
      payload.append("title", form.title.trim());
      payload.append("hoodieId", form.hoodieId);
      payload.append("wallet", address);

      const response = await fetch("/api/memes", {
        method: "POST",
        body: payload,
      });
      const data = (await response.json()) as Meme | { error?: string };

      if (!response.ok || !("id" in data)) {
        throw new Error("error" in data ? data.error : "Upload failed.");
      }

      setMemes((current) => [data, ...current]);
      setUploadOpen(false);
      resetUpload();
      setNotice("Meme published to the Hood.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleFavorite(meme: Meme) {
    if (!address) {
      await connect();
      return;
    }

    const wasFavorite = Boolean(meme.viewerHasFavorited);
    setMemes((current) =>
      current.map((item) =>
        item.id === meme.id
          ? {
              ...item,
              viewerHasFavorited: !wasFavorite,
              favorites: Math.max(0, item.favorites + (wasFavorite ? -1 : 1)),
            }
          : item
      )
    );

    try {
      const response = await fetch(`/api/memes/${meme.id}/favorite`, {
        method: wasFavorite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setMemes((current) =>
        current.map((item) =>
          item.id === meme.id
            ? {
                ...item,
                viewerHasFavorited: wasFavorite,
                favorites: Math.max(0, item.favorites + (wasFavorite ? 1 : -1)),
              }
            : item
        )
      );
      setError("Favorite could not be saved.");
    }
  }

  async function recordUsage(memeId: string, action: "download" | "share") {
    setMemes((current) =>
      current.map((item) =>
        item.id === memeId
          ? {
              ...item,
              downloads: item.downloads + (action === "download" ? 1 : 0),
              shareClicks: item.shareClicks + (action === "share" ? 1 : 0),
              usageScore: item.usageScore + (action === "download" ? 3 : 5),
            }
          : item
      )
    );

    try {
      await fetch(`/api/memes/${memeId}/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, wallet: address || null }),
        keepalive: true,
      });
    } catch {
      // Usage tracking must never block sharing or downloading.
    }
  }

  async function downloadMeme(meme: Meme) {
    await recordUsage(meme.id, "download");

    try {
      const response = await fetch(meme.imageUrl);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const extension = meme.mediaType === "gif" ? "gif" : "png";
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hood-meme-${meme.id}.${extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(meme.imageUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function shareMeme(meme: Meme) {
    await recordUsage(meme.id, "share");
    const pageUrl = `${window.location.origin}/memes/${meme.id}`;
    const text = `${meme.title}\n\nBuilt in the Hood. Hoodie #${meme.hoodieId}`;
    const intent = `https://x.com/intent/post?${new URLSearchParams({
      text,
      url: pageUrl,
    }).toString()}`;
    window.open(intent, "_blank", "noopener,noreferrer,width=720,height=620");
  }

  async function submitFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMeme) return;
    if (!address) {
      await connect();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/memes/${selectedMeme.id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          reason: flagReason,
          note: flagNote.trim() || undefined,
        }),
      });
      const data = (await response.json()) as {
        status?: MemeStatus;
        error?: string;
      };

      if (!response.ok) throw new Error(data.error || "Flag could not be sent.");

      const nextStatus = data.status || "active";
      setMemes((current) =>
        current.map((item) =>
          item.id === selectedMeme.id
            ? { ...item, viewerHasFlagged: true, status: nextStatus }
            : item
        )
      );
      setSelectedMeme((current) =>
        current
          ? { ...current, viewerHasFlagged: true, status: nextStatus }
          : current
      );
      setFlagOpen(false);
      setFlagNote("");
      setNotice(
        nextStatus === "hidden"
          ? "The meme reached the community threshold and is hidden for review."
          : "Flag submitted for community review."
      );
    } catch (flagError) {
      setError(
        flagError instanceof Error ? flagError.message : "Flag could not be sent."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#008080] text-black">
      <style jsx global>{`
        .win-window {
          border-top: 3px solid #ffffff;
          border-left: 3px solid #ffffff;
          border-right: 3px solid #404040;
          border-bottom: 3px solid #404040;
          background: #c0c0c0;
          box-shadow: 2px 2px 0 #000000;
        }

        .win-titlebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 30px;
          gap: 12px;
          padding: 3px 4px 3px 7px;
          background: #000080;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .win-title-control {
          display: grid;
          width: 20px;
          height: 20px;
          place-items: center;
          border-top: 2px solid #ffffff;
          border-left: 2px solid #ffffff;
          border-right: 2px solid #404040;
          border-bottom: 2px solid #404040;
          background: #c0c0c0;
          color: #000000;
          line-height: 1;
        }

        .win-button {
          min-height: 34px;
          border-top: 2px solid #ffffff;
          border-left: 2px solid #ffffff;
          border-right: 2px solid #404040;
          border-bottom: 2px solid #404040;
          background: #c0c0c0;
          padding: 7px 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .win-button:hover:not(:disabled),
        .win-button:focus-visible:not(:disabled) {
          outline: 1px dotted #000000;
          outline-offset: -5px;
        }

        .win-button:active:not(:disabled),
        .win-button-active {
          border-top-color: #404040;
          border-left-color: #404040;
          border-right-color: #ffffff;
          border-bottom-color: #ffffff;
          background: #d4d0c8;
          transform: translate(1px, 1px);
        }

        .win-button:disabled {
          color: #808080;
          text-shadow: 1px 1px #ffffff;
          cursor: not-allowed;
        }

        .win-input {
          width: 100%;
          min-height: 36px;
          border-top: 2px solid #404040;
          border-left: 2px solid #404040;
          border-right: 2px solid #ffffff;
          border-bottom: 2px solid #ffffff;
          background: #ffffff;
          padding: 7px 9px;
          border-radius: 0;
          font-size: 12px;
          outline: none;
        }

        .win-input:focus {
          outline: 1px dotted #000000;
          outline-offset: -4px;
        }

        .win-inset {
          border-top: 2px solid #404040;
          border-left: 2px solid #404040;
          border-right: 2px solid #ffffff;
          border-bottom: 2px solid #ffffff;
          background: #ffffff;
        }
      `}</style>

      <SiteHeader />

      <section className="mx-auto max-w-[1600px] px-3 pb-8 pt-20 md:px-6 md:pt-24">
        <WindowFrame title="C:\\THE_HOOD\\MEMES.EXE">
          <div className="border-b border-[#808080] px-2 py-1 text-[10px] uppercase">
            <span className="mr-5 underline">File</span>
            <span className="mr-5 underline">Edit</span>
            <span className="mr-5 underline">View</span>
            <span className="underline">Help</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b-2 border-white p-2">
            <WindowButton onClick={() => setUploadOpen(true)}>▣ Submit meme</WindowButton>
            <WindowButton onClick={() => void loadMemes()}>↻ Refresh</WindowButton>
            <div className="mx-1 hidden h-8 w-px bg-[#808080] shadow-[1px_0_0_#fff] md:block" />
            <WindowButton active={sort === "new"} onClick={() => setSort("new")}>
              New
            </WindowButton>
            <WindowButton
              active={sort === "popular"}
              onClick={() => setSort("popular")}
            >
              Popular
            </WindowButton>
            <WindowButton
              active={sort === "most-used"}
              onClick={() => setSort("most-used")}
            >
              Most used
            </WindowButton>

            <div className="ml-auto w-full md:w-[320px]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title, Hoodie, or wallet..."
                className="win-input"
                aria-label="Search memes"
              />
            </div>
          </div>

          {(notice || error) && (
            <div
              className={`m-2 border-2 p-3 text-[11px] uppercase tracking-[0.06em] ${
                error
                  ? "border-[#800000] bg-white text-[#800000]"
                  : "border-[#008000] bg-white text-[#006000]"
              }`}
            >
              {error || notice}
            </div>
          )}

          <div className="grid min-h-[650px] lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="border-b-2 border-[#808080] p-3 lg:border-b-0 lg:border-r-2">
              <div className="win-inset p-2">
                <p className="border-b border-[#808080] pb-2 text-[10px] font-bold uppercase">
                  Folders
                </p>
                <nav className="mt-2 space-y-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSort("new")}
                    className="block w-full px-2 py-1.5 text-left hover:bg-[#000080] hover:text-white"
                  >
                    📁 All Memes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSort("popular")}
                    className="block w-full px-2 py-1.5 text-left hover:bg-[#000080] hover:text-white"
                  >
                    📁 Community Favorites
                  </button>
                  <button
                    type="button"
                    onClick={() => setSort("most-used")}
                    className="block w-full px-2 py-1.5 text-left hover:bg-[#000080] hover:text-white"
                  >
                    📁 Most Used
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadOpen(true)}
                    className="block w-full px-2 py-1.5 text-left hover:bg-[#000080] hover:text-white"
                  >
                    📁 My Uploads
                  </button>
                </nav>
              </div>

              <div className="mt-3 win-inset p-3 text-[10px] leading-relaxed">
                <p className="font-bold uppercase">The Meme Registry</p>
                <p className="mt-2">
                  Uploads appear immediately. Hoodie holders curate the gallery by
                  using, favoriting, and flagging contributions.
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[9px] uppercase">
                <div className="win-inset p-2">
                  <strong className="block text-lg">{visibleMemes.length}</strong>
                  visible
                </div>
                <div className="win-inset p-2">
                  <strong className="block text-lg">{totalUses}</strong>
                  usage pts
                </div>
              </div>
            </aside>

            <div className="min-w-0 bg-white p-3 md:p-5">
              {loadingMemes ? (
                <div className="grid min-h-[480px] place-items-center text-xs uppercase tracking-[0.15em]">
                  Opening meme registry...
                </div>
              ) : visibleMemes.length ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {visibleMemes.map((meme) => (
                    <MemeCard
                      key={meme.id}
                      meme={meme}
                      onOpen={() => setSelectedMeme(meme)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid min-h-[480px] place-items-center text-center">
                  <div>
                    <p className="text-5xl">🗂️</p>
                    <p className="mt-4 text-sm font-bold uppercase">
                      No memes found
                    </p>
                    <p className="mt-2 text-xs">Be the first neighbor to add one.</p>
                    <WindowButton
                      className="mt-4"
                      onClick={() => setUploadOpen(true)}
                    >
                      Submit meme
                    </WindowButton>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-1 border-t-2 border-white p-1 text-[9px] uppercase md:grid-cols-[1fr_220px_220px]">
            <div className="border border-[#808080] px-2 py-1">
              {visibleMemes.length} object(s)
            </div>
            <div className="border border-[#808080] px-2 py-1">
              Status: community curated
            </div>
            <div className="border border-[#808080] px-2 py-1">
              Reward signal: usage
            </div>
          </div>
        </WindowFrame>
      </section>

      <section className="bg-[#ccff00] px-4 py-14 text-black md:px-6">
        <div className="mx-auto grid max-w-[1500px] gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em]">Built in the Hood</p>
            <h2 className="mt-4 text-5xl leading-[0.88] tracking-[-0.06em] md:text-7xl">
              UPLOADS ARE OPEN.
              <br />
              VALUE IS EARNED.
            </h2>
          </div>
          <div className="flex flex-col justify-end">
            <p className="max-w-2xl text-lg leading-relaxed md:text-2xl">
              A meme is published immediately. The community decides what spreads.
              Downloads, favorites, and shares build its usage score for future OCH
              contributor rewards.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => setUploadOpen(true)} className="pixel-cta">
                Submit a meme
              </button>
              <Link href="/" className="pixel-cta pixel-cta-dark">
                Back to the Hood
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />

      {selectedMeme && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-3 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={selectedMeme.title}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedMeme(null);
          }}
        >
          <WindowFrame
            title={`MEME_${selectedMeme.id}.VIEWER`}
            className="w-full max-w-5xl"
          >
            <div className="grid max-h-[86vh] overflow-auto lg:grid-cols-[minmax(0,1.4fr)_360px]">
              <div className="grid min-h-[360px] place-items-center bg-[#808080] p-3 md:p-6">
                <div className="win-inset max-h-[70vh] max-w-full overflow-auto bg-white p-2">
                  <img
                    src={selectedMeme.imageUrl}
                    alt={selectedMeme.title}
                    className="image-render-pixel max-h-[66vh] max-w-full object-contain"
                  />
                </div>
              </div>

              <aside className="border-t-2 border-white p-4 lg:border-l-2 lg:border-t-0">
                <p className="text-[9px] uppercase opacity-60">Meme title</p>
                <h2 className="mt-1 text-2xl font-bold uppercase leading-none">
                  {selectedMeme.title}
                </h2>

                <div className="mt-5 flex items-center gap-3 border-y border-[#808080] py-3">
                  <img
                    src={selectedMeme.hoodieImage || hoodieArtwork(selectedMeme.hoodieId)}
                    alt={`Hoodie #${selectedMeme.hoodieId}`}
                    className="image-render-pixel h-16 w-16 bg-black object-cover"
                  />
                  <div className="text-[10px] uppercase leading-relaxed">
                    <p className="font-bold">Hoodie #{selectedMeme.hoodieId}</p>
                    <p>By {shortAddress(selectedMeme.creator)}</p>
                    <p>{formatDate(selectedMeme.createdAt)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-center text-[9px] uppercase">
                  <div className="win-inset p-2">
                    <strong className="block text-xl">{selectedMeme.favorites}</strong>
                    favorites
                  </div>
                  <div className="win-inset p-2">
                    <strong className="block text-xl">{selectedMeme.downloads}</strong>
                    downloads
                  </div>
                  <div className="win-inset p-2">
                    <strong className="block text-xl">{selectedMeme.shareClicks}</strong>
                    shares
                  </div>
                  <div className="win-inset p-2">
                    <strong className="block text-xl">{selectedMeme.usageScore}</strong>
                    usage score
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <WindowButton onClick={() => void toggleFavorite(selectedMeme)}>
                    {selectedMeme.viewerHasFavorited ? "★ Favorited" : "☆ Favorite"}
                  </WindowButton>
                  <WindowButton onClick={() => void downloadMeme(selectedMeme)}>
                    ↓ Download meme
                  </WindowButton>
                  <WindowButton onClick={() => void shareMeme(selectedMeme)}>
                    𝕏 Share on X
                  </WindowButton>
                  <WindowButton
                    disabled={selectedMeme.viewerHasFlagged}
                    onClick={() => setFlagOpen(true)}
                  >
                    ⚑ {selectedMeme.viewerHasFlagged ? "Flag submitted" : "Flag meme"}
                  </WindowButton>
                  <WindowButton onClick={() => setSelectedMeme(null)}>
                    Close
                  </WindowButton>
                </div>
              </aside>
            </div>
          </WindowFrame>
        </div>
      )}

      {uploadOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-3 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Submit meme"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) {
              setUploadOpen(false);
            }
          }}
        >
          <WindowFrame title="SUBMIT_MEME.EXE" className="w-full max-w-3xl">
            {!address ? (
              <div className="p-5 text-center md:p-10">
                <p className="text-4xl">🔌</p>
                <h2 className="mt-4 text-2xl font-bold uppercase">
                  Connect to enter the Hood
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-xs leading-relaxed">
                  Uploading and flagging are limited to verified Hoodie holders.
                </p>
                <WindowButton className="mt-6" onClick={connect}>
                  Connect wallet
                </WindowButton>
              </div>
            ) : (
              <form onSubmit={submitMeme} className="grid md:grid-cols-[1fr_1fr]">
                <div className="border-b-2 border-white p-4 md:border-b-0 md:border-r-2 md:p-5">
                  <p className="text-[10px] font-bold uppercase">1. Choose a file</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="win-inset mt-3 grid aspect-square w-full place-items-center overflow-hidden bg-white p-3"
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Meme preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-center text-[10px] uppercase leading-relaxed">
                        <p className="text-5xl">🖼️</p>
                        <p className="mt-3 font-bold">Click to select meme</p>
                        <p className="mt-1 opacity-60">PNG · JPG · WEBP · GIF</p>
                        <p className="opacity-60">Maximum 15 MB</p>
                      </div>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    onChange={selectFile}
                    className="hidden"
                  />
                </div>

                <div className="p-4 md:p-5">
                  <p className="text-[10px] font-bold uppercase">2. Meme details</p>

                  <label className="mt-4 block text-[9px] font-bold uppercase">
                    Title
                    <input
                      value={form.title}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          title: event.target.value.slice(0, 80),
                        }))
                      }
                      maxLength={80}
                      placeholder="GM FROM MY HOOD"
                      className="win-input mt-1"
                    />
                  </label>

                  <label className="mt-4 block text-[9px] font-bold uppercase">
                    Attach to Hoodie
                    <select
                      value={form.hoodieId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          hoodieId: event.target.value,
                        }))
                      }
                      disabled={loadingHoodies || !hoodies.length}
                      className="win-input mt-1"
                    >
                      {!hoodies.length && (
                        <option value="">
                          {loadingHoodies ? "Loading Hoodies..." : "No Hoodies found"}
                        </option>
                      )}
                      {hoodies.map((hoodie) => (
                        <option key={hoodie.tokenId} value={hoodie.tokenId}>
                          Hoodie #{hoodie.tokenId}
                        </option>
                      ))}
                    </select>
                  </label>

                  {form.hoodieId && (
                    <div className="mt-4 flex items-center gap-3 win-inset p-2">
                      <img
                        src={hoodieArtwork(form.hoodieId)}
                        alt={`Hoodie #${form.hoodieId}`}
                        className="image-render-pixel h-16 w-16 bg-black object-cover"
                      />
                      <div className="text-[10px] uppercase leading-relaxed">
                        <p className="font-bold">Hoodie #{form.hoodieId}</p>
                        <p>{shortAddress(address)}</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 win-inset bg-[#ffffe1] p-3 text-[9px] leading-relaxed">
                    <strong className="block uppercase">Community rules</strong>
                    Uploads are public immediately. Harassment, NSFW content, spam,
                    stolen work, or unrelated uploads may be flagged and hidden by
                    Hoodie holders.
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <WindowButton
                      type="submit"
                      disabled={
                        submitting ||
                        !form.file ||
                        !form.title.trim() ||
                        !form.hoodieId
                      }
                    >
                      {submitting ? "Uploading..." : "Publish now"}
                    </WindowButton>
                    <WindowButton
                      disabled={submitting}
                      onClick={() => {
                        setUploadOpen(false);
                        resetUpload();
                      }}
                    >
                      Cancel
                    </WindowButton>
                  </div>
                </div>
              </form>
            )}
          </WindowFrame>
        </div>
      )}

      {flagOpen && selectedMeme && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Flag meme"
        >
          <WindowFrame title="COMMUNITY_FLAG.EXE" className="w-full max-w-lg">
            <form onSubmit={submitFlag} className="p-4 md:p-5">
              <p className="text-xs leading-relaxed">
                Flag <strong>{selectedMeme.title}</strong> for community review.
                One flag is allowed per holder wallet.
              </p>

              <label className="mt-4 block text-[9px] font-bold uppercase">
                Reason
                <select
                  value={flagReason}
                  onChange={(event) => setFlagReason(event.target.value as FlagReason)}
                  className="win-input mt-1"
                >
                  <option value="harassment">Harassment</option>
                  <option value="nsfw">NSFW content</option>
                  <option value="spam">Spam</option>
                  <option value="stolen">Stolen content</option>
                  <option value="unrelated">Unrelated content</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="mt-4 block text-[9px] font-bold uppercase">
                Note (optional)
                <textarea
                  value={flagNote}
                  onChange={(event) => setFlagNote(event.target.value.slice(0, 280))}
                  maxLength={280}
                  rows={4}
                  className="win-input mt-1 resize-none"
                  placeholder="Add context for the review..."
                />
              </label>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <WindowButton type="submit" disabled={submitting}>
                  {submitting ? "Sending..." : "Submit flag"}
                </WindowButton>
                <WindowButton
                  disabled={submitting}
                  onClick={() => setFlagOpen(false)}
                >
                  Cancel
                </WindowButton>
              </div>
            </form>
          </WindowFrame>
        </div>
      )}
    </main>
  );
}