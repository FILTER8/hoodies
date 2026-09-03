import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  Contract,
  JsonRpcProvider,
  getAddress,
  isAddress,
} from "ethers";

import { siteConfig } from "../../../../lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6500;

const ERC721_METADATA_ABI = [
  "function tokenURI(uint256 tokenId) view returns (string)",
] as const;

type MetadataLike = {
  image?: unknown;
  image_url?: unknown;
  imageUrl?: unknown;
  image_data?: unknown;
  imageData?: unknown;
  animation_url?: unknown;
};

type AlchemyMetadataResponse = {
  image?: {
    cachedUrl?: string;
    pngUrl?: string;
    thumbnailUrl?: string;
    originalUrl?: string;
  };
  raw?: {
    metadata?: MetadataLike;
  };
};

function getAlchemyNftBaseUrl() {
  const value =
    process.env.ALCHEMY_NFT_API_BASE_URL?.trim();

  if (!value) {
    throw new Error(
      "ALCHEMY_NFT_API_BASE_URL is not configured.",
    );
  }

  return value.replace(/\/$/, "");
}

function getAlchemyApiKey() {
  const value =
    process.env.ALCHEMY_API_KEY?.trim();

  if (!value) {
    throw new Error(
      "ALCHEMY_API_KEY is not configured.",
    );
  }

  return value;
}

function normalizeDecentralizedUrl(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("ipfs://")) {
    let path = trimmed.slice("ipfs://".length);
    if (path.startsWith("ipfs/")) {
      path = path.slice("ipfs/".length);
    }
    return `https://ipfs.io/ipfs/${path}`;
  }

  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice("ar://".length)}`;
  }

  return trimmed;
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .filter(
          (value): value is string =>
            typeof value === "string",
        )
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function decodeBase64Utf8(value: string) {
  return Buffer.from(value, "base64").toString("utf8");
}

function decodeJsonDataUri(uri: string) {
  const comma = uri.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid metadata data URI.");
  }

  const header = uri.slice(0, comma);
  const body = uri.slice(comma + 1);

  return header.includes(";base64")
    ? decodeBase64Utf8(body)
    : decodeURIComponent(body);
}

function dataImageResponse(raw: string) {
  const comma = raw.indexOf(",");
  if (comma <= 0) {
    throw new Error("Invalid data image.");
  }

  const header = raw.slice(5, comma);
  const payload = raw.slice(comma + 1);
  const parts = header.split(";");
  const contentType = parts[0]?.trim() || "image/svg+xml";
  const base64 = parts.some(
    (part) => part.toLowerCase() === "base64",
  );

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Data URI is not an image.");
  }

  const body = base64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  if (body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("NFT image is too large.");
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function looksLikeSvg(buffer: ArrayBuffer) {
  try {
    const sample = new Uint8Array(
      buffer,
      0,
      Math.min(buffer.byteLength, 2048),
    );
    const text = new TextDecoder("utf-8", {
      fatal: false,
    })
      .decode(sample)
      .trimStart()
      .toLowerCase();

    return (
      text.startsWith("<svg") ||
      (text.startsWith("<?xml") && text.includes("<svg"))
    );
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS,
  );

  try {
    return await fetch(url, {
      headers: {
        accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (compatible; OnChainHoodies-HoodWallet/1.0)",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function remoteImageResponse(rawUrl: string) {
  const normalized = normalizeDecentralizedUrl(rawUrl);

  if (normalized.toLowerCase().startsWith("data:image/")) {
    return dataImageResponse(normalized);
  }

  const source = new URL(normalized);
  if (source.protocol !== "https:") {
    throw new Error("Only HTTPS NFT images are supported.");
  }

  const response = await fetchWithTimeout(source.toString());
  if (!response.ok) {
    throw new Error(`NFT image request failed (${response.status}).`);
  }

  const declared = Number(
    response.headers.get("content-length") || "0",
  );
  if (
    Number.isFinite(declared) &&
    declared > MAX_IMAGE_BYTES
  ) {
    throw new Error("NFT image is too large.");
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("NFT image is too large.");
  }

  let contentType =
    response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() || "";

  if (
    !contentType.startsWith("image/") &&
    looksLikeSvg(body)
  ) {
    contentType = "image/svg+xml";
  }

  if (!contentType.startsWith("image/")) {
    throw new Error(
      `NFT media is not an image (${contentType || "unknown"}).`,
    );
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function fetchAlchemyMetadata(
  contract: string,
  tokenId: string,
) {
  const base = getAlchemyNftBaseUrl();
  const key = getAlchemyApiKey();
  const params = new URLSearchParams({
    contractAddress: contract,
    tokenId,
    refreshCache: "false",
  });

  const response = await fetch(
    `${base}/${key}/getNFTMetadata?${params.toString()}`,
    {
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Alchemy NFT metadata request failed (${response.status}).`,
    );
  }

  return (await response.json()) as AlchemyMetadataResponse;
}

function metadataImageCandidates(metadata: MetadataLike | undefined) {
  if (!metadata) return [];

  return uniqueStrings([
    metadata.image_data,
    metadata.imageData,
    metadata.image,
    metadata.image_url,
    metadata.imageUrl,
  ]);
}

async function readTokenUriImageCandidates(
  contractAddress: string,
  tokenId: string,
) {
  if (!siteConfig.rpcUrl) return [];

  const provider = new JsonRpcProvider(
    siteConfig.rpcUrl,
    Number(siteConfig.chainId),
    { staticNetwork: true },
  );

  const contract = new Contract(
    contractAddress,
    ERC721_METADATA_ABI,
    provider,
  );

  const tokenUri = String(
    await contract.tokenURI(BigInt(tokenId)),
  ).trim();

  let metadata: MetadataLike;

  if (tokenUri.startsWith("data:application/json")) {
    metadata = JSON.parse(
      decodeJsonDataUri(tokenUri),
    ) as MetadataLike;
  } else {
    const normalized = normalizeDecentralizedUrl(tokenUri);
    const response = await fetch(normalized, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `Token metadata request failed (${response.status}).`,
      );
    }

    metadata = (await response.json()) as MetadataLike;
  }

  return metadataImageCandidates(metadata);
}

export async function GET(request: NextRequest) {
  const rawContract =
    request.nextUrl.searchParams.get("contract")?.trim() || "";
  const tokenId =
    request.nextUrl.searchParams.get("tokenId")?.trim() || "";

  if (!isAddress(rawContract) || !tokenId) {
    return NextResponse.json(
      { error: "Valid contract and tokenId are required." },
      { status: 400 },
    );
  }

  const contract = getAddress(rawContract);
  const candidates: string[] = [];

  try {
    const metadata = await fetchAlchemyMetadata(
      contract,
      tokenId,
    );

    candidates.push(
      ...uniqueStrings([
        metadata.image?.cachedUrl,
        metadata.image?.pngUrl,
        metadata.image?.thumbnailUrl,
        metadata.image?.originalUrl,
        ...metadataImageCandidates(metadata.raw?.metadata),
      ]),
    );
  } catch (error) {
    console.debug(
      `HoodWallet export Alchemy metadata unavailable for ${contract}:${tokenId}.`,
      error,
    );
  }

  try {
    candidates.push(
      ...(await readTokenUriImageCandidates(
        contract,
        tokenId,
      )),
    );
  } catch (error) {
    console.debug(
      `HoodWallet export tokenURI fallback unavailable for ${contract}:${tokenId}.`,
      error,
    );
  }

  const uniqueCandidates = uniqueStrings(candidates);
  let lastError: unknown = null;

  for (const candidate of uniqueCandidates) {
    try {
      return await remoteImageResponse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  console.warn(
    `HoodWallet export image unavailable for ${contract}:${tokenId}.`,
    lastError,
  );

  return NextResponse.json(
    { error: "NFT artwork unavailable." },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
