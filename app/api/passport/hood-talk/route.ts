import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RPC_URL =
  process.env.ROBINHOOD_MAINNET_RPC_URL ||
  process.env.ROBINHOOD_RPC_URL ||
  process.env.ALCHEMY_RPC_URL ||
  "";

const COLLECTION_ADDRESS = (
  process.env.OCH_COLLECTION_ADDRESS ||
  process.env.OPENSEA_CONTRACT ||
  process.env.NEXT_PUBLIC_COLLECTION_ADDRESS ||
  "0x9ec6c5b9F572A9B02138E553bc5F5882Da735F45"
).toLowerCase();

const TOKEN_URI_SELECTOR = "c87b56dd";
const MAX_TOKEN_IDS = 250;
const CONCURRENCY = 8;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_COST = 1_000;
const MAX_METADATA_BYTES = 512 * 1024;

type RateEntry = {
  cost: number;
  resetAt: number;
};

const ipRateLimit = new Map<string, RateEntry>();

type MetadataAttribute = {
  trait_type?: string;
  traitType?: string;
  name?: string;
  value?: unknown;
};

type HoodTalkMetadata = {
  quote?: unknown;
  count?: unknown;
  total?: unknown;
  history?: unknown[];
};

type TokenMetadata = {
  hoodTalkCount?: unknown;
  hood_talk_count?: unknown;
  talkCount?: unknown;
  quoteCount?: unknown;
  attributes?: MetadataAttribute[];
  metadata?: TokenMetadata;
  token?: TokenMetadata;

  // Previous/custom API format.
  hoodTalk?: HoodTalkMetadata;

  // New rarity-stable renderer format.
  hood_talk?: HoodTalkMetadata;
};

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function pruneRateLimit(now: number) {
  for (const [key, entry] of ipRateLimit) {
    if (entry.resetAt <= now) {
      ipRateLimit.delete(key);
    }
  }
}

function consumeWeightedRateLimit(
  key: string,
  requestCost: number,
  now: number,
) {
  const safeCost = Math.max(1, requestCost);
  const current = ipRateLimit.get(key);

  if (!current || current.resetAt <= now) {
    ipRateLimit.set(key, {
      cost: safeCost,
      resetAt: now + RATE_WINDOW_MS,
    });

    return {
      allowed: safeCost <= RATE_MAX_COST,
      retryAfterSeconds: 0,
    };
  }

  if (current.cost + safeCost > RATE_MAX_COST) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.resetAt - now) / 1000),
      ),
    };
  }

  current.cost += safeCost;
  ipRateLimit.set(key, current);

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

function isPrivateIpv4(hostname: string) {
  const match = hostname.match(
    /^(?:(\d{1,3})\.){3}(\d{1,3})$/,
  );

  if (!match) return false;

  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isUnsafeMetadataHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }

  if (isPrivateIpv4(normalized)) {
    return true;
  }

  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  ) {
    return true;
  }

  return false;
}

async function fetchRemoteMetadata(urlValue: string): Promise<TokenMetadata> {
  const url = new URL(urlValue);

  if (url.protocol !== "https:") {
    throw new Error("Remote metadata must use HTTPS.");
  }

  if (isUnsafeMetadataHost(url.hostname)) {
    throw new Error("Remote metadata host is not allowed.");
  }

  const response = await fetch(url, {
    cache: "no-store",
    redirect: "manual",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Metadata redirect is invalid.");
    }

    const redirected = new URL(location, url);
    if (
      redirected.protocol !== "https:" ||
      isUnsafeMetadataHost(redirected.hostname)
    ) {
      throw new Error("Metadata redirect is not allowed.");
    }

    const redirectedResponse = await fetch(redirected, {
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
      },
    });

    if (!redirectedResponse.ok) {
      throw new Error(
        `Metadata returned ${redirectedResponse.status}.`,
      );
    }

    const contentLength = Number(
      redirectedResponse.headers.get("content-length") || 0,
    );
    if (contentLength > MAX_METADATA_BYTES) {
      throw new Error("Metadata response is too large.");
    }

    const raw = await redirectedResponse.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_METADATA_BYTES) {
      throw new Error("Metadata response is too large.");
    }

    return JSON.parse(raw) as TokenMetadata;
  }

  if (!response.ok) {
    throw new Error(`Metadata returned ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_METADATA_BYTES) {
    throw new Error("Metadata response is too large.");
  }

  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_METADATA_BYTES) {
    throw new Error("Metadata response is too large.");
  }

  return JSON.parse(raw) as TokenMetadata;
}

function asNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return null;
}

function normalizeLabel(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function extractHoodTalkCount(payload: TokenMetadata): number {
  const candidates: unknown[] = [
    payload.hoodTalkCount,
    payload.hood_talk_count,
    payload.talkCount,
    payload.quoteCount,

    // Previous/custom API format.
    payload.hoodTalk?.count,
    payload.hoodTalk?.total,

    // New rarity-stable renderer format.
    payload.hood_talk?.count,
    payload.hood_talk?.total,
  ];

  for (const candidate of candidates) {
    const count = asNonNegativeInteger(candidate);
    if (count !== null) return count;
  }

  if (Array.isArray(payload.hoodTalk?.history)) {
    return payload.hoodTalk.history.length;
  }

  if (Array.isArray(payload.hood_talk?.history)) {
    return payload.hood_talk.history.length;
  }

  // Backward compatibility with the old renderer where Hood Talk Count
  // was included inside the OpenSea attributes array.
  for (const attribute of payload.attributes || []) {
    const label = normalizeLabel(
      attribute.trait_type || attribute.traitType || attribute.name
    );

    if (
      label === "hoodtalkcount" ||
      label === "hoodtalks" ||
      label === "quotecount" ||
      label === "quotes"
    ) {
      const count = asNonNegativeInteger(attribute.value);
      if (count !== null) return count;
    }
  }

  if (payload.metadata) {
    return extractHoodTalkCount(payload.metadata);
  }

  if (payload.token) {
    return extractHoodTalkCount(payload.token);
  }

  return 0;
}

function normalizeTokenIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();

  for (const item of value) {
    const tokenId = String(item ?? "").trim();
    if (!/^\d+$/.test(tokenId)) continue;

    unique.add(BigInt(tokenId).toString());

    if (unique.size >= MAX_TOKEN_IDS) break;
  }

  return [...unique];
}

function encodeTokenUriCall(tokenId: string) {
  return `0x${TOKEN_URI_SELECTOR}${BigInt(tokenId)
    .toString(16)
    .padStart(64, "0")}`;
}

function decodeAbiString(result: string) {
  const hex = result.startsWith("0x") ? result.slice(2) : result;

  if (hex.length < 128) {
    throw new Error("Invalid tokenURI response.");
  }

  const offset = Number.parseInt(hex.slice(0, 64), 16) * 2;
  const length = Number.parseInt(hex.slice(offset, offset + 64), 16) * 2;
  const valueHex = hex.slice(offset + 64, offset + 64 + length);

  return Buffer.from(valueHex, "hex").toString("utf8");
}

async function rpcCall(method: string, params: unknown[]) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`RPC returned ${response.status}.`);
  }

  const payload = (await response.json()) as {
    result?: string;
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message || "RPC call failed.");
  }

  if (typeof payload.result !== "string") {
    throw new Error("RPC returned no result.");
  }

  return payload.result;
}

async function readMetadataUri(uri: string): Promise<TokenMetadata> {
  if (uri.startsWith("data:application/json;base64,")) {
    const encoded = uri.slice("data:application/json;base64,".length);

    if (encoded.length > MAX_METADATA_BYTES * 2) {
      throw new Error("Metadata response is too large.");
    }

    const raw = Buffer.from(encoded, "base64").toString("utf8");

    if (Buffer.byteLength(raw, "utf8") > MAX_METADATA_BYTES) {
      throw new Error("Metadata response is too large.");
    }

    return JSON.parse(raw) as TokenMetadata;
  }

  if (uri.startsWith("data:application/json;utf8,")) {
    const raw = decodeURIComponent(
      uri.slice("data:application/json;utf8,".length),
    );

    if (Buffer.byteLength(raw, "utf8") > MAX_METADATA_BYTES) {
      throw new Error("Metadata response is too large.");
    }

    return JSON.parse(raw) as TokenMetadata;
  }

  if (uri.startsWith("data:application/json,")) {
    const raw = decodeURIComponent(
      uri.slice("data:application/json,".length),
    );

    if (Buffer.byteLength(raw, "utf8") > MAX_METADATA_BYTES) {
      throw new Error("Metadata response is too large.");
    }

    return JSON.parse(raw) as TokenMetadata;
  }

  return fetchRemoteMetadata(uri);
}

async function fetchTokenCount(tokenId: string) {
  const result = await rpcCall("eth_call", [
    {
      to: COLLECTION_ADDRESS,
      data: encodeTokenUriCall(tokenId),
    },
    "latest",
  ]);

  const tokenUri = decodeAbiString(result);
  const metadata = await readMetadataUri(tokenUri);

  return extractHoodTalkCount(metadata);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;

      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index]),
        };
      } catch (reason) {
        results[index] = {
          status: "rejected",
          reason,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker())
  );

  return results;
}

export async function POST(request: NextRequest) {
  try {
    if (!RPC_URL) {
      console.error("Passport Hood Talk RPC unavailable: RPC URL missing.");
      return NextResponse.json(
        { error: "Passport Hood Talk data is temporarily unavailable." },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        },
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") || 0,
    );

    if (contentLength > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request is too large." },
        {
          status: 413,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        },
      );
    }

    const rawBody = await request.text();

    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request is too large." },
        {
          status: 413,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        },
      );
    }

    let body: { tokenIds?: unknown };

    try {
      body = JSON.parse(rawBody) as { tokenIds?: unknown };
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        {
          status: 400,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        },
      );
    }

    const tokenIds = normalizeTokenIds(body.tokenIds);

    const now = Date.now();
    pruneRateLimit(now);

    const ip = getClientIp(request);
    const rate = consumeWeightedRateLimit(
      ip,
      Math.max(1, tokenIds.length),
      now,
    );

    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many Passport Hood Talk requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
            "Retry-After": String(rate.retryAfterSeconds),
          },
        },
      );
    }

    if (tokenIds.length === 0) {
      return NextResponse.json({
        hoodTalkCounts: {},
        failedTokenIds: [],
      });
    }

    const settled = await mapWithConcurrency(
      tokenIds,
      CONCURRENCY,
      fetchTokenCount
    );

    const hoodTalkCounts: Record<string, number> = {};
    const failedTokenIds: string[] = [];

    settled.forEach((result, index) => {
      const tokenId = tokenIds[index];

      if (result.status === "fulfilled") {
        hoodTalkCounts[tokenId] = result.value;
      } else {
        hoodTalkCounts[tokenId] = 0;
        failedTokenIds.push(tokenId);
      }
    });

    return NextResponse.json(
      {
        hoodTalkCounts,
        failedTokenIds,
        source: "Robinhood mainnet RPC / live tokenURI",
        collection: COLLECTION_ADDRESS,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Passport Hood Talk RPC route failed:", error);

    return NextResponse.json(
      { error: "Unable to load live Hood Talk counts." },
      { status: 500 }
    );
  }
}