import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: string;
  error?: {
    code?: number;
    message?: string;
  };
};

type TokenMetadata = {
  name?: string;
  image?: unknown;
  image_url?: unknown;
  image_data?: unknown;
  imageURI?: unknown;
  imageUri?: unknown;
  animation_url?: unknown;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

type CachedArtwork = {
  body: Buffer;
  contentType: string;
  etag: string;
};

type TestnetConfiguration = {
  rpcUrl: string;
  contractAddress: string;
};

const TOKEN_URI_SELECTOR = "c87b56dd";
const MAX_REMOTE_BYTES = 15 * 1024 * 1024;
const MAX_MEMORY_ENTRIES = 750;

/**
 * Keeps resolved artwork in memory while the current server instance is warm.
 * Simultaneous requests for the same token share the same Promise.
 */
const artworkPromiseCache = new Map<
  string,
  Promise<CachedArtwork>
>();

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeTokenId(value: string) {
  try {
    const tokenId = BigInt(value);

    return tokenId >= BigInt(0)
      ? tokenId
      : null;
  } catch {
    return null;
  }
}

function getTestnetConfiguration(): TestnetConfiguration {
  return {
    rpcUrl:
      process.env.ROBINHOOD_TESTNET_RPC_URL?.trim() ||
      process.env.ALCHEMY_RPC_URL_TESTNET?.trim() ||
      process.env.RPC_URL_TESTNET?.trim() ||
      "",

    contractAddress:
      process.env.NEXT_PUBLIC_COLLECTION_TESTNET_ADDRESS?.trim() ||
      "",
  };
}

function cacheSeconds() {
  const configured = Number(
    process.env.HOODIE_ART_CACHE_SECONDS || "86400",
  );

  if (
    !Number.isFinite(configured) ||
    configured < 0
  ) {
    return 86400;
  }

  return Math.floor(configured);
}

function encodeTokenUriCall(tokenId: bigint) {
  return `0x${TOKEN_URI_SELECTOR}${tokenId
    .toString(16)
    .padStart(64, "0")}`;
}

function decodeAbiString(value: string) {
  if (
    !/^0x[0-9a-fA-F]*$/.test(value) ||
    value.length < 130
  ) {
    throw new Error(
      "The contract returned an invalid tokenURI response.",
    );
  }

  const hex = value.slice(2);

  const offsetBytes = Number.parseInt(
    hex.slice(0, 64),
    16,
  );

  if (!Number.isSafeInteger(offsetBytes)) {
    throw new Error(
      "The tokenURI offset could not be decoded.",
    );
  }

  const lengthPosition = offsetBytes * 2;

  const lengthBytes = Number.parseInt(
    hex.slice(
      lengthPosition,
      lengthPosition + 64,
    ),
    16,
  );

  const dataStart = lengthPosition + 64;
  const dataEnd = dataStart + lengthBytes * 2;

  if (
    !Number.isSafeInteger(lengthBytes) ||
    dataEnd > hex.length
  ) {
    throw new Error(
      "The tokenURI string could not be decoded.",
    );
  }

  return Buffer.from(
    hex.slice(dataStart, dataEnd),
    "hex",
  ).toString("utf8");
}

function normalizeIpfs(value: string) {
  if (value.startsWith("ipfs://ipfs/")) {
    return `https://ipfs.io/ipfs/${value.slice(
      "ipfs://ipfs/".length,
    )}`;
  }

  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.slice(
      "ipfs://".length,
    )}`;
  }

  return value;
}

function decodeDataUri(uri: string) {
  const comma = uri.indexOf(",");

  if (comma === -1) {
    throw new Error("Malformed data URI.");
  }

  const header = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  const parts = header.split(";");

  const mediaType =
    parts[0] ||
    "text/plain;charset=US-ASCII";

  const isBase64 =
    parts.includes("base64");

  const body = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(
        decodeURIComponent(payload),
        "utf8",
      );

  return {
    mediaType,
    body,
  };
}

async function fetchRemote(
  urlValue: string,
  accept: string,
) {
  const normalized = normalizeIpfs(urlValue);
  const url = new URL(normalized);

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new Error(
      "Unsupported remote URI protocol.",
    );
  }

  const response = await fetch(url, {
    headers: {
      accept,
    },
    redirect: "follow",
    cache: "force-cache",
    next: {
      revalidate: cacheSeconds(),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Remote content returned HTTP ${response.status}.`,
    );
  }

  const declaredLength = Number(
    response.headers.get("content-length") || 0,
  );

  if (declaredLength > MAX_REMOTE_BYTES) {
    throw new Error(
      "Remote artwork is too large.",
    );
  }

  const body = Buffer.from(
    await response.arrayBuffer(),
  );

  if (body.byteLength > MAX_REMOTE_BYTES) {
    throw new Error(
      "Remote artwork is too large.",
    );
  }

  return {
    body,
    contentType:
      response.headers.get("content-type") || "",
  };
}

async function readTokenUri(
  rpcUrl: string,
  contractAddress: string,
  tokenId: bigint,
) {
  const response = await fetch(rpcUrl, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        {
          to: contractAddress,
          data: encodeTokenUriCall(tokenId),
        },
        "latest",
      ],
    }),

    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Testnet RPC returned HTTP ${response.status}.`,
    );
  }

  const data =
    (await response.json()) as JsonRpcResponse;

  if (data.error) {
    throw new Error(
      data.error.message ||
        "The testnet tokenURI call failed.",
    );
  }

  if (
    !data.result ||
    data.result === "0x"
  ) {
    throw new Error(
      "tokenURI returned no data. The token may not exist on the testnet collection.",
    );
  }

  return decodeAbiString(data.result);
}

function isSvgMarkup(value: string) {
  const trimmed = value.trimStart();

  return (
    trimmed.startsWith("<svg") ||
    trimmed.startsWith("<?xml")
  );
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : "";
}

function svgMarkupToDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg,
  )}`;
}

async function readMetadata(
  tokenUri: string,
): Promise<TokenMetadata> {
  if (isSvgMarkup(tokenUri)) {
    return {
      image_data: tokenUri,
    };
  }

  if (tokenUri.startsWith("data:")) {
    const {
      mediaType,
      body,
    } = decodeDataUri(tokenUri);

    const decoded =
      body.toString("utf8");

    if (
      mediaType
        .toLowerCase()
        .includes("svg") ||
      isSvgMarkup(decoded)
    ) {
      return {
        image_data: decoded,
      };
    }

    return JSON.parse(
      decoded,
    ) as TokenMetadata;
  }

  const remote = await fetchRemote(
    tokenUri,
    "application/json, image/svg+xml;q=0.9, */*;q=0.8",
  );

  const decoded =
    remote.body.toString("utf8");

  if (
    remote.contentType
      .toLowerCase()
      .includes("svg") ||
    isSvgMarkup(decoded)
  ) {
    return {
      image_data: decoded,
    };
  }

  return JSON.parse(
    decoded,
  ) as TokenMetadata;
}

function isImageLikeUri(value: string) {
  const lower = value.toLowerCase();

  return (
    isSvgMarkup(value) ||
    lower.startsWith("data:image/") ||
    lower.startsWith("ipfs://") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://")
  );
}

function resolveImageUri(
  metadata: TokenMetadata,
) {
  const directImage =
    asNonEmptyString(metadata.image) ||
    asNonEmptyString(metadata.image_url) ||
    asNonEmptyString(metadata.image_data) ||
    asNonEmptyString(metadata.imageURI) ||
    asNonEmptyString(metadata.imageUri);

  if (directImage) {
    return isSvgMarkup(directImage)
      ? svgMarkupToDataUri(directImage)
      : directImage;
  }

  const properties = metadata.properties;

  if (
    properties &&
    typeof properties === "object"
  ) {
    const nestedImage =
      asNonEmptyString(properties.image) ||
      asNonEmptyString(
        properties.image_url,
      ) ||
      asNonEmptyString(
        properties.image_data,
      ) ||
      asNonEmptyString(
        properties.imageURI,
      ) ||
      asNonEmptyString(
        properties.imageUri,
      );

    if (nestedImage) {
      return isSvgMarkup(nestedImage)
        ? svgMarkupToDataUri(nestedImage)
        : nestedImage;
    }
  }

  const animationUrl =
    asNonEmptyString(
      metadata.animation_url,
    );

  if (
    animationUrl &&
    isImageLikeUri(animationUrl)
  ) {
    return isSvgMarkup(animationUrl)
      ? svgMarkupToDataUri(animationUrl)
      : animationUrl;
  }

  return "";
}

async function readArtwork(
  imageUri: string,
) {
  if (imageUri.startsWith("data:")) {
    const decoded =
      decodeDataUri(imageUri);

    return {
      body: decoded.body,
      contentType:
        decoded.mediaType ||
        "image/svg+xml",
    };
  }

  const remote = await fetchRemote(
    imageUri,
    "image/*",
  );

  return {
    body: remote.body,
    contentType:
      remote.contentType ||
      "image/svg+xml",
  };
}

function createEtag(body: Buffer) {
  const digest = createHash("sha256")
    .update(body)
    .digest("base64url");

  return `"${digest}"`;
}

function trimMemoryCache() {
  while (
    artworkPromiseCache.size >
    MAX_MEMORY_ENTRIES
  ) {
    const oldestKey =
      artworkPromiseCache
        .keys()
        .next().value as
        | string
        | undefined;

    if (!oldestKey) {
      return;
    }

    artworkPromiseCache.delete(
      oldestKey,
    );
  }
}

async function resolveArtwork(
  rpcUrl: string,
  contractAddress: string,
  tokenId: bigint,
): Promise<CachedArtwork> {
  const tokenUri = await readTokenUri(
    rpcUrl,
    contractAddress,
    tokenId,
  );

  const metadata =
    await readMetadata(tokenUri);

  const imageUri =
    resolveImageUri(metadata);

  if (!imageUri) {
    const metadataKeys = Object.keys(
      metadata,
    )
      .slice(0, 12)
      .join(", ");

    throw new Error(
      metadataKeys
        ? `The token metadata does not contain a supported image field. Found: ${metadataKeys}.`
        : "The token metadata does not contain a supported image field.",
    );
  }

  const artwork =
    await readArtwork(imageUri);

  return {
    body: artwork.body,
    contentType:
      artwork.contentType,
    etag: createEtag(
      artwork.body,
    ),
  };
}

function getArtworkPromise(
  cacheKey: string,
  rpcUrl: string,
  contractAddress: string,
  tokenId: bigint,
) {
  const cached =
    artworkPromiseCache.get(cacheKey);

  if (cached) {
    artworkPromiseCache.delete(
      cacheKey,
    );

    artworkPromiseCache.set(
      cacheKey,
      cached,
    );

    return {
      promise: cached,
      memoryHit: true,
    };
  }

  const promise = resolveArtwork(
    rpcUrl,
    contractAddress,
    tokenId,
  ).catch((error) => {
    artworkPromiseCache.delete(
      cacheKey,
    );

    throw error;
  });

  artworkPromiseCache.set(
    cacheKey,
    promise,
  );

  trimMemoryCache();

  return {
    promise,
    memoryHit: false,
  };
}

function safelyGetRpcHost(
  rpcUrl: string,
) {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-url";
  }
}

export async function GET(
  request: NextRequest,
) {
  const tokenIdValue =
    request.nextUrl.searchParams
      .get("tokenId")
      ?.trim() || "";

  const tokenId =
    normalizeTokenId(tokenIdValue);

  const {
    rpcUrl,
    contractAddress,
  } = getTestnetConfiguration();

  if (tokenId === null) {
    return NextResponse.json(
      {
        error: "Invalid token ID.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (!rpcUrl) {
    return NextResponse.json(
      {
        error:
          "ROBINHOOD_TESTNET_RPC_URL is not configured.",
        debug: {
          network: "testnet",
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (!isAddress(contractAddress)) {
    return NextResponse.json(
      {
        error:
          "NEXT_PUBLIC_COLLECTION_TESTNET_ADDRESS is missing or invalid.",
        debug: {
          network: "testnet",
          contractAddress,
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const cacheKey = [
    "testnet",
    contractAddress.toLowerCase(),
    tokenId.toString(),
  ].join(":");

  try {
    const {
      promise,
      memoryHit,
    } = getArtworkPromise(
      cacheKey,
      rpcUrl,
      contractAddress,
      tokenId,
    );

    const artwork = await promise;

    const requestEtag =
      request.headers.get(
        "if-none-match",
      );

    const cacheControl =
      `public, max-age=${cacheSeconds()}, ` +
      `s-maxage=${cacheSeconds()}, ` +
      "stale-while-revalidate=604800";

    if (
      requestEtag === artwork.etag
    ) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: artwork.etag,
          "Cache-Control":
            cacheControl,
          "X-Hoodie-Cache":
            memoryHit
              ? "MEMORY-HIT"
              : "MISS",
          "X-Hoodie-Network":
            "testnet",
        },
      });
    }

    const responseBody =
      new Uint8Array(
        artwork.body.byteLength,
      );

    responseBody.set(
      artwork.body,
    );

    return new NextResponse(
      responseBody,
      {
        status: 200,

        headers: {
          "Content-Type":
            artwork.contentType,

          "Content-Length":
            String(
              artwork.body.byteLength,
            ),

          "Cache-Control":
            cacheControl,

          ETag: artwork.etag,

          "X-Content-Type-Options":
            "nosniff",

          "X-Hoodie-Cache":
            memoryHit
              ? "MEMORY-HIT"
              : "MISS",

          "X-Hoodie-Network":
            "testnet",
        },
      },
    );
  } catch (error) {
    console.error(
      `Unable to render testnet Hoodie #${tokenId.toString()}`,
      {
        network: "testnet",
        contractAddress,
        rpcHost:
          safelyGetRpcHost(rpcUrl),
        error,
      },
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read testnet token artwork.",

        debug: {
          network: "testnet",
          tokenId:
            tokenId.toString(),
          contractAddress,
          rpcHost:
            safelyGetRpcHost(rpcUrl),
        },
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}