import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AlchemyNft = {
  contract?: {
    address?: string;
  };
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

type NetworkName = "mainnet" | "testnet";

type NetworkConfiguration = {
  apiKey: string;
  apiBaseUrl: string;
  contractAddress: string;
};

const MAX_PAGES = 100;
const PAGE_SIZE = 100;

const network: NetworkName =
  process.env.NEXT_PUBLIC_NETWORK?.trim().toLowerCase() === "mainnet"
    ? "mainnet"
    : "testnet";

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTokenId(value: string | undefined) {
  if (!value) return "";

  try {
    return BigInt(value).toString(10);
  } catch {
    return "";
  }
}

function getNetworkConfiguration(): NetworkConfiguration {
  const apiKey = process.env.ALCHEMY_API_KEY?.trim() || "";

  if (network === "mainnet") {
    return {
      apiKey,

      apiBaseUrl:
        process.env.ALCHEMY_NFT_API_BASE_URL_MAINNET?.trim() ||
        process.env.ALCHEMY_NFT_API_BASE_URL?.trim() ||
        "",

      contractAddress:
        process.env.NEXT_PUBLIC_COLLECTION_MAINNET_ADDRESS?.trim() ||
        process.env.NEXT_PUBLIC_COLLECTION_ADDRESS?.trim() ||
        "",
    };
  }

  return {
    apiKey,

    apiBaseUrl:
      process.env.ALCHEMY_NFT_API_BASE_URL_TESTNET?.trim() ||
      process.env.ALCHEMY_NFT_API_BASE_URL?.trim() ||
      "",

    contractAddress:
      process.env.NEXT_PUBLIC_COLLECTION_TESTNET_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_COLLECTION_ADDRESS?.trim() ||
      "",
  };
}

function buildAlchemyEndpoint(apiBaseUrl: string, apiKey: string) {
  let base = apiBaseUrl.trim().replace(/\/+$/, "");

  if (base.includes("{apiKey}")) {
    base = base.replace("{apiKey}", apiKey);
  } else if (/\/nft\/v3$/i.test(base)) {
    base = `${base}/${apiKey}`;
  }

  return new URL(`${base}/getNFTsForOwner`);
}

function hideApiKey(value: string, apiKey: string) {
  if (!apiKey) return value;

  return value.replaceAll(apiKey, "[HIDDEN]");
}

async function fetchAlchemyPage(
  endpointBase: URL,
  owner: string,
  contractAddress: string,
  pageKey: string | null,
  apiKey: string,
) {
  const endpoint = new URL(endpointBase.toString());

  endpoint.searchParams.set("owner", owner);
  endpoint.searchParams.set("withMetadata", "false");
  endpoint.searchParams.set("pageSize", String(PAGE_SIZE));
  endpoint.searchParams.append(
    "contractAddresses[]",
    contractAddress,
  );

  if (pageKey) {
    endpoint.searchParams.set("pageKey", pageKey);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json",
      "X-Alchemy-Token": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();

    console.error("Alchemy getNFTsForOwner failed", {
      network,
      status: response.status,
      contractAddress,
      endpoint: hideApiKey(endpoint.toString(), apiKey),
      body,
    });

    throw new Error(
      `Alchemy returned HTTP ${response.status}.`,
    );
  }

  return (await response.json()) as AlchemyResponse;
}

export async function GET(request: NextRequest) {
  const owner =
    request.nextUrl.searchParams.get("owner")?.trim() || "";

  const {
    apiKey,
    apiBaseUrl,
    contractAddress,
  } = getNetworkConfiguration();

  if (!isAddress(owner)) {
    return NextResponse.json(
      {
        error: "Invalid wallet address.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "ALCHEMY_API_KEY is not configured.",
        debug: {
          network,
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

  if (!apiBaseUrl) {
    return NextResponse.json(
      {
        error:
          network === "mainnet"
            ? "ALCHEMY_NFT_API_BASE_URL_MAINNET is not configured."
            : "ALCHEMY_NFT_API_BASE_URL_TESTNET is not configured.",
        debug: {
          network,
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

  if (!isAddress(contractAddress)) {
    return NextResponse.json(
      {
        error:
          network === "mainnet"
            ? "NEXT_PUBLIC_COLLECTION_MAINNET_ADDRESS is missing or invalid."
            : "NEXT_PUBLIC_COLLECTION_TESTNET_ADDRESS is missing or invalid.",
        debug: {
          network,
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

  try {
    const endpoint = buildAlchemyEndpoint(
      apiBaseUrl,
      apiKey,
    );

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
        apiKey,
      );

      pagesRead += 1;

      if (typeof data.totalCount === "number") {
        indexedTotal = data.totalCount;
      }

      for (const nft of data.ownedNfts || []) {
        const returnedContract =
          nft.contract?.address?.trim() || "";

        if (
          returnedContract &&
          normalizeAddress(returnedContract) !==
            normalizeAddress(contractAddress)
        ) {
          continue;
        }

        const tokenId = normalizeTokenId(nft.tokenId);

        if (!tokenId) {
          continue;
        }

        if (nft.balance !== undefined) {
          try {
            if (BigInt(nft.balance) <= BigInt(0)) {
              continue;
            }
          } catch {
            // Keep the NFT if Alchemy returns an unusual balance format.
          }
        }

        byTokenId.set(tokenId, {
          tokenId,
          name: `OnChainHoodies #${tokenId}`,
          image: `/api/hoodies/image?tokenId=${encodeURIComponent(
            tokenId,
          )}`,
        });
      }

      pageKey = data.pageKey || null;

      if (pagesRead >= MAX_PAGES && pageKey) {
        throw new Error(
          "Ownership pagination exceeded the safety limit.",
        );
      }
    } while (pageKey);

    const items = Array.from(byTokenId.values()).sort(
      (left, right) => {
        const leftId = BigInt(left.tokenId);
        const rightId = BigInt(right.tokenId);

        if (leftId < rightId) return -1;
        if (leftId > rightId) return 1;

        return 0;
      },
    );

    return NextResponse.json(
      {
        items,
        count: items.length,
        indexedTotal,
        pagesRead,

        debug: {
          network,
          owner,
          contractAddress,
          apiEndpoint: hideApiKey(
            endpoint.toString(),
            apiKey,
          ),
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("Unable to load Hoodie ownership", {
      network,
      owner,
      contractAddress,
      error,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the NFT indexer.",

        debug: {
          network,
          owner,
          contractAddress,
          apiBaseUrl: hideApiKey(
            apiBaseUrl,
            apiKey,
          ),
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