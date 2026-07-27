"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";

const API_BASE =
  process.env.NEXT_PUBLIC_PASSPORT_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8787"
    : "https://passport-api.onchainhoodies.xyz");

const ADMIN_WALLET = (
  process.env.NEXT_PUBLIC_ADMIN_WALLET || ""
).toLowerCase();

const POSTS_PAGE_SIZE = 10;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type XAccount = {
  id?: string;
  userId?: string;
  user_id?: string;
  x_user_id?: string;
  username?: string;
  x_username?: string;
  name?: string;
  x_name?: string;
  profileImageUrl?: string;
  profile_image_url?: string;
};

type Account = {
  wallet: string;
  hoodieBalance: number;
  x?: XAccount | null;
  xAccount?: XAccount | null;
  xUsername?: string | null;
  activePosts?: number;
  pastPosts?: number;
  flaggedPosts?: number;
  pfpStatus?: string | null;
};

type Metrics = {
  like_count?: number;
  reply_count?: number;
  repost_count?: number;
  retweet_count?: number;
  quote_count?: number;
};

type PostRecord = {
  post_id?: string;
  postId?: string;
  tweet_id?: string;
  tweetId?: string;
  tweet_url?: string;
  tweetUrl?: string;
  url?: string;
  status?: "active" | "past" | "flagged" | string;
  submitted_at?: string;
  submittedAt?: string;
  expires_at?: string;
  expiresAt?: string;
  flag_reason?: string | null;
  flagReason?: string | null;
  x_username?: string;
  xUsername?: string;
  current_like_count?: number;
  current_reply_count?: number;
  current_repost_count?: number;
  current_quote_count?: number;
  growth_like_count?: number;
  growth_reply_count?: number;
  growth_repost_count?: number;
  growth_quote_count?: number;
  public_metrics?: Metrics;
};

type PfpRecord = {
  token_id?: number;
  tokenId?: number;
  status?: string;
  review_reason?: string | null;
  reviewReason?: string | null;
};

type Hoodie = {
  tokenId: string;
  name?: string;
  image?: string;
};

type FeedTab = "active" | "past";
type PassportTab = "submit" | "pfp" | "posts";
type MyPostsTab = "active" | "past" | "flagged";

type RefreshResult = {
  postsUpdated: number;
  postsDeleted: number;
  postsFailed: number;
  snapshotsCreated: number;
  pfpsChecked: number;
};

declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (element?: HTMLElement) => void;
      };
    };
  }
}

function shortWallet(value: string) {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function postId(post: PostRecord) {
  return post.post_id || post.postId || post.tweet_id || post.tweetId || "";
}

function postUrl(post: PostRecord) {
  const direct = post.tweet_url || post.tweetUrl || post.url;
  if (direct) return direct;
  const id = postId(post);
  return id ? `https://x.com/i/status/${id}` : "https://x.com/OnChainHoodies";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function remainingTime(value?: string) {
  if (!value) return "24H TRACKING";
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "SNAPSHOT DUE";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}H ${minutes}M LEFT`;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function TweetEmbed({ url }: { url: string }) {
  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://platform.twitter.com/widgets.js"]',
    );

    if (existing) {
      window.twttr?.widgets.load();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.charset = "utf-8";
    document.body.appendChild(script);
  }, [url]);

  return (
    <div className="flex min-h-[220px] items-start justify-center bg-black [&_.twitter-tweet]:!m-0 [&_iframe]:!max-w-full">
      <blockquote
        className="twitter-tweet"
        data-theme="dark"
        data-dnt="true"
        data-align="center"
      >
        <a href={url}>View post on X</a>
      </blockquote>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-r border-[#ccff00] p-3">
      <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">{label}</p>
      <p className="mt-2 text-xl leading-none">{value}</p>
    </div>
  );
}

function metricsFor(post: PostRecord) {
  return {
    likes:
      post.growth_like_count ??
      post.current_like_count ??
      post.public_metrics?.like_count ??
      0,
    replies:
      post.growth_reply_count ??
      post.current_reply_count ??
      post.public_metrics?.reply_count ??
      0,
    reposts:
      post.growth_repost_count ??
      post.current_repost_count ??
      post.public_metrics?.repost_count ??
      post.public_metrics?.retweet_count ??
      0,
    quotes:
      post.growth_quote_count ??
      post.current_quote_count ??
      post.public_metrics?.quote_count ??
      0,
  };
}

function PostCard({
  post,
  admin,
  onFlag,
}: {
  post: PostRecord;
  admin: boolean;
  onFlag?: (post: PostRecord) => void;
}) {
  const metrics = metricsFor(post);
  const status = (post.status || "active").toLowerCase();

  return (
    <article className="border-2 border-black bg-black text-[#ccff00]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ccff00] p-4 text-[8px] uppercase tracking-[0.14em]">
        <span>{status}</span>
        <span>
          {status === "active"
            ? remainingTime(post.expires_at || post.expiresAt)
            : formatDate(post.submitted_at || post.submittedAt)}
        </span>
      </div>

      <div className="min-h-[220px] overflow-hidden bg-black p-2 sm:p-3">
        <TweetEmbed url={postUrl(post)} />
      </div>

      <div className="grid grid-cols-2 border-l border-t border-[#ccff00] sm:grid-cols-4">
        <Metric label="Likes" value={metrics.likes} />
        <Metric label="Replies" value={metrics.replies} />
        <Metric label="Reposts" value={metrics.reposts} />
        <Metric label="Quotes" value={metrics.quotes} />
      </div>

      {status === "flagged" && (post.flag_reason || post.flagReason) ? (
        <p className="border-t border-[#ccff00] p-4 text-xs leading-relaxed">
          Rejected: {post.flag_reason || post.flagReason}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ccff00] p-4">
        <a
          href={postUrl(post)}
          target="_blank"
          rel="noreferrer"
          className="text-[9px] uppercase tracking-[0.15em] underline underline-offset-4"
        >
          Open on X →
        </a>

        {admin && status !== "flagged" && onFlag ? (
          <button
            type="button"
            onClick={() => onFlag(post)}
            className="border border-[#ccff00] px-3 py-2 text-[8px] uppercase tracking-[0.14em]"
          >
            Flag post
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function CommunityPage() {
  const { address, connect } = useWallet();
  const [view, setView] = useState<"passport" | "feed">("passport");
  const [passportTab, setPassportTab] = useState<PassportTab>("submit");
  const [myPostsTab, setMyPostsTab] = useState<MyPostsTab>("active");
  const [feedTab, setFeedTab] = useState<FeedTab>("active");
  const [account, setAccount] = useState<Account | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [feed, setFeed] = useState<PostRecord[]>([]);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [pfp, setPfp] = useState<PfpRecord | null>(null);
  const [hoodies, setHoodies] = useState<Hoodie[]>([]);
  const [tweetUrl, setTweetUrl] = useState("");
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);

  const isAdmin = Boolean(
    address && ADMIN_WALLET && address.toLowerCase() === ADMIN_WALLET,
  );

  const xAccount = account?.x || account?.xAccount || null;
  const xUsername =
    xAccount?.username ||
    xAccount?.x_username ||
    account?.xUsername ||
    null;

  const signedIn = Boolean(account?.wallet);

  const loadAccount = useCallback(async () => {
    try {
      const data = await apiFetch<Account & { ok?: boolean }>("/v1/account");
      setAccount(data);
      return true;
    } catch {
      setAccount(null);
      return false;
    }
  }, []);

  const loadPosts = useCallback(
    async (
      status: MyPostsTab,
      offset = 0,
      append = false,
    ) => {
      if (append) {
        setPostsLoading(true);
      }

      try {
        const requestedLimit = POSTS_PAGE_SIZE + 1;
        const data = await apiFetch<{ posts?: PostRecord[] }>(
          `/v1/posts?${new URLSearchParams({
            status,
            limit: String(requestedLimit),
            offset: String(offset),
          })}`,
        );

        const received = data.posts || [];
        const nextPosts = received.slice(0, POSTS_PAGE_SIZE);

        setPosts((current) => (append ? [...current, ...nextPosts] : nextPosts));
        setPostsHasMore(received.length > POSTS_PAGE_SIZE);
      } catch {
        if (!append) setPosts([]);
        setPostsHasMore(false);
      } finally {
        setPostsLoading(false);
      }
    },
    [],
  );

  const loadPfp = useCallback(async () => {
    try {
      const data = await apiFetch<{ pfp?: PfpRecord | null }>("/v1/pfp");
      setPfp(data.pfp || null);
    } catch {
      setPfp(null);
    }
  }, []);

  const loadHoodies = useCallback(async () => {
    if (!address) {
      setHoodies([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/hoodies?${new URLSearchParams({ owner: address })}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as { items?: Hoodie[] };
      const items = data.items || [];
      setHoodies(items);
      setSelectedTokenId((current) => current || items[0]?.tokenId || "");
    } catch {
      setHoodies([]);
    }
  }, [address]);

  const loadFeed = useCallback(
    async (
      status: FeedTab,
      offset = 0,
      append = false,
    ) => {
      if (append) {
        setFeedLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        const requestedLimit = POSTS_PAGE_SIZE + 1;
        const data = await apiFetch<{ posts?: PostRecord[] }>(
          `/v1/feed?${new URLSearchParams({
            status,
            limit: String(requestedLimit),
            offset: String(offset),
          })}`,
        );

        const received = data.posts || [];
        const nextPosts = received.slice(0, POSTS_PAGE_SIZE);

        setFeed((current) => (append ? [...current, ...nextPosts] : nextPosts));
        setFeedHasMore(received.length > POSTS_PAGE_SIZE);
      } catch (feedError) {
        if (!append) setFeed([]);
        setFeedHasMore(false);
        setError(
          feedError instanceof Error
            ? feedError.message
            : "Unable to load the Feed.",
        );
      } finally {
        setLoading(false);
        setFeedLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xResult = params.get("x");
    const detail = params.get("detail");

    if (xResult !== "connected" && xResult !== "error") return;

    window.history.replaceState({}, "", window.location.pathname);

    queueMicrotask(() => {
      if (xResult === "connected") {
        setMessage(detail ? `X connected: @${detail}` : "X account connected.");
      } else {
        setError(detail || "X connection failed.");
      }
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAccount();
    });
  }, [loadAccount]);

  useEffect(() => {
    if (!signedIn) return;

    queueMicrotask(() => {
      void Promise.all([loadPosts("active"), loadPfp()]);
    });
  }, [signedIn, loadPosts, loadPfp]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadHoodies();
    });
  }, [loadHoodies]);

  useEffect(() => {
    if (view !== "feed") return;

    queueMicrotask(() => {
      void loadFeed(feedTab);
    });
  }, [view, feedTab, loadFeed]);

  useEffect(() => {
    if (!signedIn || passportTab !== "posts") return;

    queueMicrotask(() => {
      void loadPosts(myPostsTab);
    });
  }, [signedIn, passportTab, myPostsTab, loadPosts]);

  async function createPassportSession() {
    if (!address) {
      await connect();
      return;
    }

    const ethereum = (window as unknown as { ethereum?: EthereumProvider }).ethereum;

    if (!ethereum) {
      setError("No browser wallet was found.");
      return;
    }

    setAction("Signing Passport...");
    setError("");
    setMessage("");

    try {
      const nonce = await apiFetch<{ message: string }>("/v1/auth/nonce", {
        method: "POST",
        body: JSON.stringify({ wallet: address }),
      });

      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [nonce.message, address],
      })) as string;

      await apiFetch("/v1/auth/wallet", {
        method: "POST",
        body: JSON.stringify({ wallet: address, signature }),
      });

      await Promise.all([loadAccount(), loadPosts("active"), loadPfp()]);
      setMessage("Passport verified. Welcome to the Hood.");
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Passport verification failed.",
      );
    } finally {
      setAction("");
    }
  }

  async function connectX() {
    setAction("Opening X...");
    setError("");

    try {
      const data = await apiFetch<{ authorizationUrl: string }>(
        "/v1/auth/x/start",
      );
      window.location.href = data.authorizationUrl;
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Unable to connect X.",
      );
      setAction("");
    }
  }

  async function submitPost(event: FormEvent) {
    event.preventDefault();
    setAction("Submitting post...");
    setError("");
    setMessage("");

    try {
      await apiFetch("/v1/posts", {
        method: "POST",
        body: JSON.stringify({ url: tweetUrl.trim() }),
      });
      setTweetUrl("");
      await Promise.all([loadPosts("active"), loadAccount()]);
      setMessage("Post submitted. Tracking has started for 24 hours.");
      setPassportTab("posts");
      setMyPostsTab("active");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Post submission failed.",
      );
    } finally {
      setAction("");
    }
  }

  async function submitPfp(event: FormEvent) {
    event.preventDefault();
    setAction("Submitting PFP...");
    setError("");
    setMessage("");

    try {
      await apiFetch("/v1/pfp", {
        method: "POST",
        body: JSON.stringify({ tokenId: Number(selectedTokenId) }),
      });
      await loadPfp();
      setMessage("PFP submitted for verification.");
    } catch (pfpError) {
      setError(
        pfpError instanceof Error
          ? pfpError.message
          : "PFP submission failed.",
      );
    } finally {
      setAction("");
    }
  }

  async function flagPost(post: PostRecord) {
    const id = postId(post);
    if (!id) return;

    const reason = window.prompt("Why should this post be flagged?");
    if (reason === null) return;

    setAction("Flagging post...");
    setError("");

    try {
      await apiFetch(`/v1/admin/posts/${id}/flag`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await loadFeed(feedTab);
      setMessage("Post flagged and removed from the public Feed.");
    } catch (flagError) {
      setError(
        flagError instanceof Error
          ? flagError.message
          : "Unable to flag the post.",
      );
    } finally {
      setAction("");
    }
  }

  async function runRefresh() {
    setAction("Refreshing Passport...");
    setError("");
    setMessage("");
    setRefreshResult(null);

    try {
      const data = await apiFetch<{ result: RefreshResult }>(
        "/v1/admin/refresh",
        { method: "POST" },
      );

      setRefreshResult(data.result);
      await Promise.all([loadAccount(), loadPosts(myPostsTab)]);
      if (view === "feed") await loadFeed(feedTab);
      setMessage("Passport refresh complete.");
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Passport refresh failed.",
      );
    } finally {
      setAction("");
    }
  }

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto max-w-[1440px] px-4 pb-12 pt-24 sm:px-6 md:pb-16 md:pt-36">
        <div className="flex flex-col gap-5 border-b-2 border-black pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
              Citizen Passport / Season 01
            </p>
            <h1 className="mt-3 text-[clamp(2.8rem,7vw,6.5rem)] leading-[0.8] tracking-[-0.075em]">
              GROW THE
              <br />
              HOOD.
            </h1>
          </div>

          <div className="flex w-full border-2 border-black sm:w-auto">
            {(["passport", "feed"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                className={`flex-1 px-4 py-3 text-[9px] uppercase tracking-[0.14em] first:border-r-2 first:border-black sm:flex-none sm:px-5 sm:text-[10px] sm:tracking-[0.16em] ${
                  view === item ? "bg-black text-[#ccff00]" : ""
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {message ? (
          <div className="mt-6 border-2 border-black bg-black p-4 text-sm text-[#ccff00]">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 border-2 border-black p-4 text-sm">{error}</div>
        ) : null}

        {action ? (
          <p className="mt-5 text-[9px] uppercase tracking-[0.15em] opacity-60">
            {action}
          </p>
        ) : null}

        {isAdmin && signedIn ? (
          <section className="mt-6 border-2 border-black bg-black p-4 text-[#ccff00] sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                  Admin controls
                </p>
                <p className="mt-2 text-sm uppercase tracking-[0.08em]">
                  Run the same refresh used by the 12-hour cron.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void runRefresh()}
                disabled={Boolean(action)}
                className="w-full border border-[#ccff00] px-4 py-3 text-[9px] uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Refresh Passport
              </button>
            </div>

            {refreshResult ? (
              <div className="mt-5 grid grid-cols-2 border-l border-t border-[#ccff00] sm:grid-cols-5">
                {[
                  ["Updated", refreshResult.postsUpdated],
                  ["Deleted", refreshResult.postsDeleted],
                  ["Failed", refreshResult.postsFailed],
                  ["Snapshots", refreshResult.snapshotsCreated],
                  ["PFPs", refreshResult.pfpsChecked],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="border-b border-r border-[#ccff00] p-3"
                  >
                    <p className="text-[7px] uppercase tracking-[0.12em] opacity-55">
                      {label}
                    </p>
                    <p className="mt-2 text-xl leading-none">{value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {view === "passport" ? (
          <section className="py-12 md:py-16">
            {!address ? (
              <div className="border-2 border-black p-8 md:p-12">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                  Step 01
                </p>
                <h2 className="mt-5 text-4xl leading-none md:text-6xl">
                  CONNECT YOUR WALLET
                </h2>
                <p className="mt-6 max-w-2xl text-base leading-relaxed opacity-70">
                  Connect the wallet holding your OnChainHoodies to enter the Passport.
                </p>
                <button type="button" onClick={connect} className="pixel-cta mt-8">
                  Connect wallet
                </button>
              </div>
            ) : !signedIn ? (
              <div className="grid border-l-2 border-t-2 border-black md:grid-cols-2">
                <div className="border-b-2 border-r-2 border-black p-8 md:p-12">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                    Connected wallet
                  </p>
                  <h2 className="mt-5 text-4xl leading-none md:text-6xl">
                    {shortWallet(address)}
                  </h2>
                </div>
                <div className="border-b-2 border-r-2 border-black p-8 md:p-12">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                    Verify ownership
                  </p>
                  <p className="mt-5 max-w-xl text-base leading-relaxed opacity-70">
                    Sign one message. This creates your Passport session and checks that the wallet currently owns a Hoodie.
                  </p>
                  <button
                    type="button"
                    onClick={() => void createPassportSession()}
                    disabled={Boolean(action)}
                    className="pixel-cta pixel-cta-dark mt-8 disabled:opacity-50"
                  >
                    Sign Passport
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid border-l-2 border-t-2 border-black sm:grid-cols-3">
                  <div className="border-b-2 border-r-2 border-black p-5">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">Wallet</p>
                    <p className="mt-3 text-lg">{shortWallet(account?.wallet || address)}</p>
                  </div>
                  <div className="border-b-2 border-r-2 border-black p-5">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">Hoodies</p>
                    <p className="mt-3 text-lg">{account?.hoodieBalance ?? 0}</p>
                  </div>
                  <div className="border-b-2 border-r-2 border-black p-5">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">X Account</p>
                    <p className="mt-3 text-lg">{xUsername ? `@${xUsername}` : "Not connected"}</p>
                  </div>
                </div>

                <div className="mt-10 flex flex-wrap border-2 border-black">
                  {(
                    [
                      ["submit", "Submit Post"],
                      ["pfp", "Verify PFP"],
                      ["posts", "My Posts"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPassportTab(id)}
                      className={`border-r-2 border-black px-5 py-3 text-[9px] uppercase tracking-[0.15em] last:border-r-0 ${
                        passportTab === id ? "bg-black text-[#ccff00]" : ""
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {passportTab === "submit" ? (
                  <div className="mt-8 grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
                    <div className="border-2 border-black p-7 md:p-9">
                      <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">X verification</p>
                      <h2 className="mt-5 text-4xl leading-none">
                        {xUsername ? `@${xUsername}` : "CONNECT X"}
                      </h2>
                      <p className="mt-5 text-sm leading-relaxed opacity-70">
                        One X account can be linked to one Passport wallet.
                      </p>
                      {!xUsername ? (
                        <button
                          type="button"
                          onClick={() => void connectX()}
                          className="pixel-cta pixel-cta-dark mt-7"
                        >
                          Connect X
                        </button>
                      ) : null}
                    </div>

                    <form onSubmit={submitPost} className="border-2 border-black p-7 md:p-9">
                      <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">Submit post</p>
                      <h2 className="mt-5 text-4xl leading-none">TRACK FOR 24H</h2>
                      <p className="mt-5 text-sm leading-relaxed opacity-70">
                        Paste the X post URL. The post must come from your connected account and mention @OnChainHoodies.
                      </p>
                      <input
                        type="url"
                        required
                        value={tweetUrl}
                        onChange={(event) => setTweetUrl(event.target.value)}
                        placeholder="https://x.com/username/status/..."
                        className="mt-7 w-full border-2 border-black bg-transparent px-4 py-4 text-sm outline-none placeholder:text-black/40"
                      />
                      <button
                        type="submit"
                        disabled={!xUsername || Boolean(action)}
                        className="pixel-cta pixel-cta-dark mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Submit post
                      </button>
                    </form>
                  </div>
                ) : null}

                {passportTab === "pfp" ? (
                  <form onSubmit={submitPfp} className="mt-8 border-2 border-black p-7 md:p-10">
                    <div className="grid gap-8 lg:grid-cols-2">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">Hood PFP</p>
                        <h2 className="mt-5 text-4xl leading-none md:text-5xl">VERIFY YOUR HOODIE</h2>
                        <p className="mt-6 max-w-xl text-sm leading-relaxed opacity-70">
                          Select an owned Hoodie that you are using as your X profile picture. Verification is reviewed by the Hood.
                        </p>
                        <p className="mt-6 text-[9px] uppercase tracking-[0.14em]">
                          Current status: {pfp?.status || "Not submitted"}
                        </p>
                      </div>

                      <div>
                        <label className="text-[9px] uppercase tracking-[0.15em] opacity-60">Owned Hoodie</label>
                        <select
                          value={selectedTokenId}
                          onChange={(event) => setSelectedTokenId(event.target.value)}
                          required
                          className="mt-3 w-full border-2 border-black bg-[#ccff00] px-4 py-4 text-sm outline-none"
                        >
                          <option value="">Choose Hoodie</option>
                          {hoodies.map((hoodie) => (
                            <option key={hoodie.tokenId} value={hoodie.tokenId}>
                              {hoodie.name || `OnChainHoodie #${hoodie.tokenId}`}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          disabled={!xUsername || !selectedTokenId || Boolean(action)}
                          className="pixel-cta pixel-cta-dark mt-5 w-full disabled:opacity-40"
                        >
                          Submit PFP
                        </button>
                      </div>
                    </div>
                  </form>
                ) : null}

                {passportTab === "posts" ? (
                  <div className="mt-8">
                    <div className="flex flex-wrap border-2 border-black">
                      {(
                        [
                          ["active", "Active"],
                          ["past", "Past"],
                          ["flagged", "Rejected"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setMyPostsTab(id)}
                          className={`border-r-2 border-black px-5 py-3 text-[9px] uppercase tracking-[0.15em] last:border-r-0 ${
                            myPostsTab === id ? "bg-black text-[#ccff00]" : ""
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {posts.length ? (
                      <>
                        <div className="mt-6 grid gap-4 md:mt-8 md:gap-6 lg:grid-cols-2">
                          {posts.map((post) => (
                            <PostCard key={postId(post)} post={post} admin={false} />
                          ))}
                        </div>

                        {postsHasMore ? (
                          <div className="mt-8 flex justify-center">
                            <button
                              type="button"
                              onClick={() =>
                                void loadPosts(myPostsTab, posts.length, true)
                              }
                              disabled={postsLoading}
                              className="pixel-cta pixel-cta-dark disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {postsLoading ? "Loading..." : "Load more"}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="mt-8 border-2 border-black p-10 text-center">
                        <p className="text-sm uppercase tracking-[0.14em] opacity-60">No {myPostsTab} posts</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : (
          <section className="py-12 md:py-16">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">Public community feed</p>
                <h2 className="mt-4 text-5xl leading-none tracking-[-0.05em] md:text-7xl">FROM THE HOOD</h2>
              </div>

              <div className="flex border-2 border-black">
                {(["active", "past"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFeedTab(item)}
                    className={`px-5 py-3 text-[9px] uppercase tracking-[0.15em] first:border-r-2 first:border-black ${
                      feedTab === item ? "bg-black text-[#ccff00]" : ""
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="mt-10 text-[9px] uppercase tracking-[0.15em] opacity-60">Loading Feed...</p>
            ) : feed.length ? (
              <>
                <div className="mt-8 grid gap-4 md:mt-10 md:gap-6 lg:grid-cols-2">
                  {feed.map((post) => (
                    <PostCard
                      key={postId(post)}
                      post={post}
                      admin={isAdmin}
                      onFlag={flagPost}
                    />
                  ))}
                </div>

                {feedHasMore ? (
                  <div className="mt-8 flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadFeed(feedTab, feed.length, true)}
                      disabled={feedLoadingMore}
                      className="pixel-cta pixel-cta-dark disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {feedLoadingMore ? "Loading..." : "Load more"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-10 border-2 border-black p-10 text-center">
                <p className="text-sm uppercase tracking-[0.14em] opacity-60">No {feedTab} posts yet</p>
              </div>
            )}
          </section>
        )}

        <div className="mt-8 flex flex-wrap gap-3 border-t-2 border-black pt-6">
          <Link href="/passport" className="pixel-cta">Back to Passport</Link>
          <Link href="/och" className="pixel-cta pixel-cta-dark">View $OCH</Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}