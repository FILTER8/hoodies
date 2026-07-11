import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AlchemyNft = {
  contract?: { address?: string };
  tokenId?: string;
  balance?: string;
};

type AlchemyResponse = {
  ownedNfts?: AlchemyNft[];
  pageKey?: string | null;
  totalCount?: number;
};

type Hoodie = {
  tokenId: string;
  name: string;
  image: string;
};

const MAX_PAGES = 100;
const PAGE_SIZE = 100;

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeTokenId(value: string | undefined) {
  if (!value) return "";

  try {
    return BigInt(value).toString(10);
  } catch {
    return "";
  }
}

function buildAlchemyEndpoint(apiBaseUrl: string, apiKey: string) {
  let base = apiBaseUrl.trim().replace(/\/$/, "");

  if (base.includes("{apiKey}")) {
    base = base.replace("{apiKey}", apiKey);
  } else if (/\/nft\/v3$/i.test(base)) {
    base = `${base}/${apiKey}`;
  }

  // Also supports a complete value such as:
  // https://network.g.alchemy.com/nft/v3/API_KEY
  return new URL(`${base}/getNFTsForOwner`);
}

async function fetchAlchemyPage(
  endpointBase: URL,
  owner: string,
  contractAddress: string,
  pageKey: string | null,
  apiKey: string
) {
  const endpoint = new URL(endpointBase.toString());
  endpoint.searchParams.set("owner", owner);
  endpoint.searchParams.set("withMetadata", "false");
  endpoint.searchParams.set("pageSize", String(PAGE_SIZE));
  endpoint.searchParams.append("contractAddresses[]", contractAddress);

  if (pageKey) endpoint.searchParams.set("pageKey", pageKey);

  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json",
      // Harmless when the key is already in the URL and useful for older setups.
      "X-Alchemy-Token": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Alchemy getNFTsForOwner failed", response.status, body);
    throw new Error(`Alchemy returned HTTP ${response.status}.`);
  }

  return (await response.json()) as AlchemyResponse;
}

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner")?.trim() || "";
  const apiKey = process.env.ALCHEMY_API_KEY?.trim() || "";
  const apiBaseUrl = process.env.ALCHEMY_NFT_API_BASE_URL?.trim() || "";
  const contractAddress =
    process.env.NEXT_PUBLIC_COLLECTION_ADDRESS?.trim() || "";

  if (!isAddress(owner)) {
    return NextResponse.json(
      { error: "Invalid wallet address." },
      { status: 400 }
    );
  }

  if (!apiKey || !apiBaseUrl || !isAddress(contractAddress)) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid ALCHEMY_API_KEY, ALCHEMY_NFT_API_BASE_URL, or NEXT_PUBLIC_COLLECTION_ADDRESS.",
      },
      { status: 500 }
    );
  }

  try {
    const endpoint = buildAlchemyEndpoint(apiBaseUrl, apiKey);
    const byTokenId = new Map<string, Hoodie>();

    let pageKey: string | null = null;
    let indexedTotal: number | null = null;
    let pagesRead = 0;

    do {
      const data = await fetchAlchemyPage(
        endpoint,
        owner,
        contractAddress,
        pageKey,
        apiKey
      );

      pagesRead += 1;
      if (typeof data.totalCount === "number") indexedTotal = data.totalCount;

      for (const nft of data.ownedNfts || []) {
        const tokenId = normalizeTokenId(nft.tokenId);
        if (!tokenId) continue;

        // ERC-721 balances are normally 1. This also keeps the route safe if
        // the indexer ever returns a zero-balance record.
        if (nft.balance !== undefined) {
          try {
            if (BigInt(nft.balance) <= BigInt(0)) continue;
          } catch {
            // Keep the token when an indexer omits or formats balance oddly.
          }
        }

        byTokenId.set(tokenId, {
          tokenId,
          name: `OnChainHoodies #${tokenId}`,
          image: `/api/hoodies/image?tokenId=${encodeURIComponent(tokenId)}`,
        });
      }

      pageKey = data.pageKey || null;

      if (pagesRead >= MAX_PAGES && pageKey) {
        throw new Error("Ownership pagination exceeded the safety limit.");
      }
    } while (pageKey);

    const items = Array.from(byTokenId.values()).sort((a, b) => {
      const left = BigInt(a.tokenId);
      const right = BigInt(b.tokenId);
      return left < right ? -1 : left > right ? 1 : 0;
    });

    return NextResponse.json(
      {
        items,
        count: items.length,
        indexedTotal,
        pagesRead,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Unable to load Hoodie ownership", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the NFT indexer.",
      },
      { status: 502 }
    );
  }
}
