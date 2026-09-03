import { NextRequest, NextResponse } from "next/server";
import { Contract, JsonRpcProvider, getAddress, isAddress } from "ethers";

import { siteConfig } from "../../../../lib/config";
import trustedAssetRegistryJson from "../../../../lib/hoodwallet-assets.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const OPENSEA_API =
  "https://api.opensea.io/api/v2";

const ROBINHOOD_CHAIN =
  "robinhood";

const MAX_OPENSEA_IMAGE_FALLBACKS =
  8;


/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type TrustedRegistryEntry = {
  contract: string;
  name?: string;
  symbol?: string;
};

type TrustedAssetRegistry = {
  erc20?: TrustedRegistryEntry[];
  nfts?: TrustedRegistryEntry[];
};

type BlockscoutTokenBalancePayload =
  | BlockscoutTokenBalance[]
  | { items?: BlockscoutTokenBalance[] };

type BlockscoutTokenBalance = {
  value?: string;

  token?: {
    address?: string;
    hash?: string;
    address_hash?: string;
    contract_address?: string;

    name?: string;
    symbol?: string;
    decimals?: string | number;
    type?: string;
  };
};

type AssetResponse = {
  symbol: string;
  name: string;
  balanceRaw: string;
  balanceFormatted: string;
  contract?: string;
  decimals: number;
  kind: "erc20";
  trusted: boolean;
};

type AlchemyOwnedNft = {
  contract?: {
    address?: string;
    name?: string;
    symbol?: string;

    isSpam?: boolean;

    spamClassifications?: string[];
  };

  collection?: {
    name?: string;
    slug?: string;
  };

  tokenId?: string;

  tokenType?:
    | "ERC721"
    | "ERC1155"
    | string;

  name?: string;

  description?: string;

  balance?: string;

  image?: {
    cachedUrl?: string;
    thumbnailUrl?: string;
    pngUrl?: string;
    contentType?: string;
    size?: number;
    originalUrl?: string;
  };

  raw?: {
    metadata?: {
      name?: string;
      image?: string;
      image_url?: string;
      imageUrl?: string;
    };
  };
};

type AlchemyNftResponse = {
  ownedNfts?: AlchemyOwnedNft[];
  pageKey?: string;
  totalCount?: number;
};

type NftResponse = {
  contract: string;
  tokenId: string;

  name: string;
  collectionName: string;
  symbol?: string;

  image?: string;
  imageCandidates: string[];

  balance: string;

  kind:
    | "erc721"
    | "erc1155";

  trusted: boolean;

  spam: boolean;

  spamClassifications: string[];
};

/*//////////////////////////////////////////////////////////////
                        TRUSTED REGISTRY
//////////////////////////////////////////////////////////////*/

const trustedAssetRegistry =
  trustedAssetRegistryJson as TrustedAssetRegistry;

function normalizeContractAddress(
  value?: string,
) {
  if (!value) {
    return "";
  }

  const trimmed =
    value.trim();

  if (
    !isAddress(trimmed)
  ) {
    return "";
  }

  return trimmed.toLowerCase();
}

const trustedErc20Contracts =
  new Set(
    (
      trustedAssetRegistry.erc20 ??
      []
    )
      .map((item) =>
        normalizeContractAddress(
          item.contract,
        ),
      )
      .filter(Boolean),
  );

const trustedNftContracts =
  new Set(
    (
      trustedAssetRegistry.nfts ??
      []
    )
      .map((item) =>
        normalizeContractAddress(
          item.contract,
        ),
      )
      .filter(Boolean),
  );

function isTrustedErc20(
  contract?: string,
) {
  const normalized =
    normalizeContractAddress(
      contract,
    );

  return (
    normalized.length > 0 &&
    trustedErc20Contracts.has(
      normalized,
    )
  );
}

function isTrustedNft(
  contract?: string,
) {
  const normalized =
    normalizeContractAddress(
      contract,
    );

  return (
    normalized.length > 0 &&
    trustedNftContracts.has(
      normalized,
    )
  );
}

/*//////////////////////////////////////////////////////////////
                              HELPERS
//////////////////////////////////////////////////////////////*/

function formatTokenBalance(
  value: bigint,
  decimals = 18,
  maximumDecimals = 6,
) {
  const negative =
    value < BigInt(0);

  const absolute =
    negative
      ? -value
      : value;

  const base =
    BigInt(10) **
    BigInt(decimals);

  const whole =
    absolute / base;

  const remainder =
    absolute % base;

  if (
    remainder ===
      BigInt(0) ||
    maximumDecimals <=
      0
  ) {
    return `${
      negative ? "-" : ""
    }${whole.toString()}`;
  }

  const fraction =
    remainder
      .toString()
      .padStart(
        decimals,
        "0",
      )
      .slice(
        0,
        maximumDecimals,
      )
      .replace(
        /0+$/,
        "",
      );

  return fraction
    ? `${
        negative ? "-" : ""
      }${whole.toString()}.${fraction}`
    : `${
        negative ? "-" : ""
      }${whole.toString()}`;
}

function getBlockscoutContractAddress(
  item: BlockscoutTokenBalance,
) {
  const candidates = [
    item.token?.address,
    item.token?.hash,
    item.token?.address_hash,
    item.token?.contract_address,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      isAddress(
        candidate.trim(),
      )
    ) {
      return candidate.trim();
    }
  }

  return undefined;
}

function normalizeTokenBalances(
  payload: unknown,
): AssetResponse[] {
  const rawItems =
    Array.isArray(payload)
      ? payload
      : payload &&
          typeof payload === "object" &&
          Array.isArray(
            (payload as { items?: unknown[] }).items,
          )
        ? (payload as { items: unknown[] }).items
        : [];

  return (
    rawItems as BlockscoutTokenBalance[]
  )
    .filter((item) => {
      const tokenType =
        item.token?.type
          ?.trim()
          .toUpperCase()
          .replaceAll("-", "");

      return tokenType === "ERC20";
    })
    .map(
      (
        item,
      ): AssetResponse | null => {
        let balanceRaw: bigint;

        try {
          balanceRaw =
            BigInt(
              item.value ??
                "0",
            );
        } catch {
          return null;
        }

        if (
          balanceRaw <=
          BigInt(0)
        ) {
          return null;
        }

        const parsedDecimals =
          Number(
            item.token?.decimals ??
              18,
          );

        const decimals =
          Number.isInteger(
            parsedDecimals,
          ) &&
          parsedDecimals >=
            0 &&
          parsedDecimals <=
            255
            ? parsedDecimals
            : 18;

        const rawContract =
          getBlockscoutContractAddress(
            item,
          );

        let contract:
          | string
          | undefined;

        if (
          rawContract &&
          isAddress(
            rawContract,
          )
        ) {
          contract =
            getAddress(
              rawContract,
            );
        }

        return {
          symbol:
            item.token?.symbol?.trim() ||
            "TOKEN",

          name:
            item.token?.name?.trim() ||
            "ERC-20",

          balanceRaw:
            balanceRaw.toString(),

          balanceFormatted:
            formatTokenBalance(
              balanceRaw,
              decimals,
              6,
            ),

          contract,

          decimals,

          kind:
            "erc20",

          trusted:
            isTrustedErc20(
              rawContract,
            ),
        };
      },
    )
    .filter(
      (
        asset,
      ): asset is AssetResponse =>
        asset !== null,
    )
    .sort(
      (
        left,
        right,
      ) =>
        left.symbol.localeCompare(
          right.symbol,
        ),
    );
}

/*//////////////////////////////////////////////////////////////
                  DIRECT TRUSTED ERC-20 READS

  Blockscout is useful for discovery, but it must not be the
  source of truth for assets we explicitly trust. Explorer
  indexes can lag or temporarily omit balances. Every ERC-20 in
  hoodwallet-assets.json is therefore read directly from-chain
  and then merged with Blockscout discovery below.
//////////////////////////////////////////////////////////////*/

const ERC20_BALANCE_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;

async function fetchTrustedErc20Balances(
  walletAddress: string,
): Promise<AssetResponse[]> {
  if (!siteConfig.rpcUrl) {
    return [];
  }

  const provider = new JsonRpcProvider(
    siteConfig.rpcUrl,
    Number(siteConfig.chainId),
    { staticNetwork: true },
  );

  const entries =
    trustedAssetRegistry.erc20 ?? [];

  const results =
    await Promise.allSettled(
      entries.map(
        async (entry): Promise<AssetResponse | null> => {
          const normalized =
            normalizeContractAddress(entry.contract);

          if (!normalized) {
            return null;
          }

          const contractAddress =
            getAddress(normalized);

          const token =
            new Contract(
              contractAddress,
              ERC20_BALANCE_ABI,
              provider,
            );

          const [balanceResult, decimalsResult] =
            await Promise.all([
              token.balanceOf(walletAddress) as Promise<bigint>,
              token.decimals() as Promise<bigint | number>,
            ]);

          const balanceRaw =
            BigInt(balanceResult);

          if (balanceRaw <= BigInt(0)) {
            return null;
          }

          const decimals =
            Number(decimalsResult);

          return {
            symbol: entry.symbol?.trim() || "TOKEN",
            name: entry.name?.trim() || entry.symbol?.trim() || "ERC-20",
            balanceRaw: balanceRaw.toString(),
            balanceFormatted: formatTokenBalance(
              balanceRaw,
              Number.isInteger(decimals) && decimals >= 0 && decimals <= 255
                ? decimals
                : 18,
              6,
            ),
            contract: contractAddress,
            decimals:
              Number.isInteger(decimals) && decimals >= 0 && decimals <= 255
                ? decimals
                : 18,
            kind: "erc20",
            trusted: true,
          };
        },
      ),
    );

  return results
    .filter(
      (result): result is PromiseFulfilledResult<AssetResponse | null> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value)
    .filter((asset): asset is AssetResponse => asset !== null);
}

function mergeErc20Assets(
  discovered: AssetResponse[],
  trustedDirect: AssetResponse[],
) {
  const merged =
    new Map<string, AssetResponse>();

  for (const asset of discovered) {
    const key =
      asset.contract?.toLowerCase() ||
      `${asset.symbol}:${asset.name}`;

    merged.set(key, asset);
  }

  // Direct on-chain reads win for trusted contracts.
  for (const asset of trustedDirect) {
    const key =
      asset.contract?.toLowerCase() ||
      `${asset.symbol}:${asset.name}`;

    merged.set(key, asset);
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      left.symbol.localeCompare(right.symbol),
  );
}

/*//////////////////////////////////////////////////////////////
                         BLOCKSCOUT ERC-20
//////////////////////////////////////////////////////////////*/

async function fetchBlockscoutBalances(
  walletAddress: string,
) {
  const explorerBase =
    siteConfig.explorerUrl.replace(
      /\/$/,
      "",
    );

  if (
    !explorerBase
  ) {
    throw new Error(
      "Explorer URL is not configured.",
    );
  }

  const url =
    `${explorerBase}/api/v2/addresses/` +
    `${encodeURIComponent(
      walletAddress,
    )}/token-balances`;

  const response =
    await fetch(
      url,
      {
        headers: {
          accept:
            "application/json",
        },

        cache:
          "force-cache",
        next: {
          revalidate: 60,
        },
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Blockscout token balance request failed (${response.status}).`,
    );
  }

  return response.json() as Promise<unknown>;
}

/*//////////////////////////////////////////////////////////////
                     OPENSEA IMAGE FALLBACK
//////////////////////////////////////////////////////////////*/

function getOpenSeaApiKey() {
  return process.env
    .OPENSEA_API_KEY
    ?.trim() ||
    "";
}

async function fetchOpenSeaNftImage(
  contract: string,
  tokenId: string,
) {
  const apiKey =
    getOpenSeaApiKey();

  if (!apiKey) {
    return undefined;
  }

  try {
    const response =
      await fetch(
        `${OPENSEA_API}/chain/${ROBINHOOD_CHAIN}/contract/${encodeURIComponent(
          contract,
        )}/nfts/${encodeURIComponent(
          tokenId,
        )}`,
        {
          headers: {
            accept:
              "application/json",
            "x-api-key":
              apiKey,
          },
          cache:
            "no-store",
        },
      );

    if (!response.ok) {
      console.warn(
        `HoodWallet OpenSea image fallback failed (${response.status}) for ${contract}:${tokenId}.`,
      );
      return undefined;
    }

    const payload =
      (await response.json()) as {
        nft?: {
          display_image_url?: string;
          image_url?: string;
          original_image_url?: string;
          image?: string;
        };
      };

    const nft =
      payload.nft ||
      {};

    return (
      nft.display_image_url?.trim() ||
      nft.image_url?.trim() ||
      nft.original_image_url?.trim() ||
      nft.image?.trim() ||
      undefined
    );
  } catch (error) {
    console.warn(
      `HoodWallet OpenSea image fallback unavailable for ${contract}:${tokenId}.`,
      error,
    );
    return undefined;
  }
}

/*//////////////////////////////////////////////////////////////
                           ALCHEMY NFT
//////////////////////////////////////////////////////////////*/

function getAlchemyNftBaseUrl() {
  const rawBase =
    process.env
      .ALCHEMY_NFT_API_BASE_URL
      ?.trim();

  if (!rawBase) {
    throw new Error(
      "ALCHEMY_NFT_API_BASE_URL is not configured.",
    );
  }

  return rawBase.replace(
    /\/$/,
    "",
  );
}

function getAlchemyApiKey() {
  const key =
    process.env
      .ALCHEMY_API_KEY
      ?.trim();

  if (!key) {
    throw new Error(
      "ALCHEMY_API_KEY is not configured.",
    );
  }

  return key;
}

function buildAlchemyNftUrl(
  walletAddress: string,
  pageKey?: string,
) {
  const base =
    getAlchemyNftBaseUrl();

  const apiKey =
    getAlchemyApiKey();

  const params =
    new URLSearchParams({
      owner:
        walletAddress,

      withMetadata:
        "true",

      pageSize:
        "100",

      excludeFilters:
        "",
    });

  if (pageKey) {
    params.set(
      "pageKey",
      pageKey,
    );
  }

  return (
    `${base}/${apiKey}/getNFTsForOwner?` +
    params.toString()
  );
}

function looksLikeVideo(
  value?: string,
) {
  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  return (
    lower.includes(".mp4") ||
    lower.includes(".webm") ||
    lower.includes(".mov")
  );
}

function collectNftImageCandidates(
  nft: AlchemyOwnedNft,
) {
  /*
   * Never trust one Alchemy CDN URL as the only source. A cachedUrl may be
   * stale while pngUrl, thumbnailUrl, originalUrl or metadata.image still
   * works. Return the complete ordered list to the client so it can retry.
   *
   * Alchemy recommends its hosted/cached media first, then original/raw.
   */
  const candidates = [
    nft.image?.cachedUrl,
    nft.image?.pngUrl,
    nft.image?.thumbnailUrl,
    nft.image?.originalUrl,
    nft.raw?.metadata?.image,
    nft.raw?.metadata?.image_url,
    nft.raw?.metadata?.imageUrl,
  ];

  return Array.from(
    new Set(
      candidates
        .map((value) => value?.trim() || "")
        .filter(
          (value) =>
            value.length > 0 &&
            !looksLikeVideo(value),
        ),
    ),
  );
}

function pickNftImage(
  nft: AlchemyOwnedNft,
) {
  return collectNftImageCandidates(
    nft,
  )[0];
}

function mergeImageCandidates(
  nft: NftResponse,
  metadata: AlchemyOwnedNft,
) {
  const merged =
    Array.from(
      new Set([
        ...nft.imageCandidates,
        ...collectNftImageCandidates(
          metadata,
        ),
      ]),
    );

  nft.imageCandidates = merged;
  nft.image = merged[0];
}

function buildAlchemyMetadataBatchUrl() {
  const base =
    getAlchemyNftBaseUrl();

  const apiKey =
    getAlchemyApiKey();

  return `${base}/${apiKey}/getNFTMetadataBatch`;
}

function buildAlchemyMetadataUrl(
  contract: string,
  tokenId: string,
  refreshCache = false,
) {
  const base =
    getAlchemyNftBaseUrl();

  const apiKey =
    getAlchemyApiKey();

  const params =
    new URLSearchParams({
      contractAddress:
        contract,
      tokenId,
      tokenUriTimeoutInMs:
        "5000",
      refreshCache:
        refreshCache
          ? "true"
          : "false",
    });

  return (
    `${base}/${apiKey}/getNFTMetadata?` +
    params.toString()
  );
}

async function fetchAlchemyMetadataBatch(
  nfts: NftResponse[],
) {
  if (
    nfts.length === 0
  ) {
    return [] as AlchemyOwnedNft[];
  }

  const response =
    await fetch(
      buildAlchemyMetadataBatchUrl(),
      {
        method:
          "POST",

        headers: {
          accept:
            "application/json",
          "content-type":
            "application/json",
        },

        cache:
          "no-store",

        body:
          JSON.stringify({
            tokens:
              nfts.slice(0, 100).map(
                (nft) => ({
                  contractAddress:
                    nft.contract,
                  tokenId:
                    nft.tokenId,
                  tokenType:
                    nft.kind === "erc1155"
                      ? "ERC1155"
                      : "ERC721",
                }),
              ),
            tokenUriTimeoutInMs:
              5000,
            refreshCache:
              false,
          }),
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Alchemy NFT metadata batch request failed (${response.status}).`,
    );
  }

  const payload =
    (await response.json()) as unknown;

  return Array.isArray(payload)
    ? payload as AlchemyOwnedNft[]
    : [];
}

async function fetchAlchemyFreshMetadata(
  nft: NftResponse,
) {
  const response =
    await fetch(
      buildAlchemyMetadataUrl(
        nft.contract,
        nft.tokenId,
        true,
      ),
      {
        headers: {
          accept:
            "application/json",
        },
        cache:
          "no-store",
        signal:
          AbortSignal.timeout(
            2500,
          ),
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Alchemy fresh NFT metadata request failed (${response.status}).`,
    );
  }

  return (await response.json()) as AlchemyOwnedNft;
}

function normalizeAlchemyNft(
  nft: AlchemyOwnedNft,
): NftResponse | null {
  const rawContract =
    nft.contract?.address?.trim();

  if (
    !rawContract ||
    !isAddress(
      rawContract,
    )
  ) {
    return null;
  }

  const tokenId =
    nft.tokenId?.trim();

  if (
    !tokenId
  ) {
    return null;
  }

  const tokenType =
    nft.tokenType?.toUpperCase();

  const kind:
    | "erc721"
    | "erc1155" =
    tokenType ===
    "ERC1155"
      ? "erc1155"
      : "erc721";

  const collectionName =
    nft.collection?.name?.trim() ||
    nft.contract?.name?.trim() ||
    "NFT Collection";

  const name =
    nft.name?.trim() ||
    nft.raw?.metadata?.name?.trim() ||
    `${collectionName} #${tokenId}`;

  const balance =
    nft.balance?.trim() ||
    "1";

  const spam =
    nft.contract?.isSpam ===
      true ||
    (
      nft.contract
        ?.spamClassifications
        ?.length ??
      0
    ) > 0;

  return {
    contract:
      getAddress(
        rawContract,
      ),

    tokenId,

    name,

    collectionName,

    symbol:
      nft.contract?.symbol?.trim() ||
      undefined,

    image:
      pickNftImage(
        nft,
      ),

    imageCandidates:
      collectNftImageCandidates(
        nft,
      ),

    balance,

    kind,

    trusted:
      isTrustedNft(
        rawContract,
      ),

    spam,

    spamClassifications:
      nft.contract
        ?.spamClassifications ||
      [],
  };
}

async function fetchAlchemyNfts(
  walletAddress: string,
): Promise<NftResponse[]> {
  const collected:
    NftResponse[] =
    [];

  let pageKey:
    | string
    | undefined;

  let pages = 0;

  /*
   * Safety cap.
   *
   * This is plenty for normal
   * HoodWallet inventory while
   * preventing an accidental
   * endless pagination loop.
   */
  const MAX_PAGES =
    10;

  do {
    const url =
      buildAlchemyNftUrl(
        walletAddress,
        pageKey,
      );

    const response =
      await fetch(
        url,
        {
          headers: {
            accept:
              "application/json",
          },

          cache:
            "no-store",
        },
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Alchemy NFT request failed (${response.status}).`,
      );
    }

    const payload =
      (await response.json()) as AlchemyNftResponse;

    const ownedNfts =
      Array.isArray(
        payload.ownedNfts,
      )
        ? payload.ownedNfts
        : [];

    for (
      const nft of ownedNfts
    ) {
      const normalized =
        normalizeAlchemyNft(
          nft,
        );

      if (
        normalized
      ) {
        collected.push(
          normalized,
        );
      }
    }

    pageKey =
      payload.pageKey;

    pages += 1;
  } while (
    pageKey &&
    pages <
      MAX_PAGES
  );

  /*
   * Some ownership records arrive before their processed media.
   * Ask Alchemy's metadata service for those exact NFTs first.
   * We do one batch cache lookup, then a small number of fresh
   * metadata reads. OpenSea remains the final fallback only.
   */
  let missingImages =
    collected.filter(
      (nft) =>
        nft.imageCandidates.length === 0,
    );

  if (
    missingImages.length > 0
  ) {
    try {
      const metadata =
        await fetchAlchemyMetadataBatch(
          missingImages.slice(0, 100),
        );

      const byKey =
        new Map<string, AlchemyOwnedNft>();

      for (
        const item of metadata
      ) {
        const contract =
          item.contract?.address?.trim();
        const tokenId =
          item.tokenId?.trim();

        if (
          contract &&
          tokenId &&
          isAddress(contract)
        ) {
          byKey.set(
            `${contract.toLowerCase()}:${tokenId}`,
            item,
          );
        }
      }

      for (
        const nft of missingImages
      ) {
        const item =
          byKey.get(
            `${nft.contract.toLowerCase()}:${nft.tokenId}`,
          );

        if (item) {
          mergeImageCandidates(
            nft,
            item,
          );
        }
      }
    } catch (error) {
      console.warn(
        "HoodWallet Alchemy metadata batch fallback unavailable.",
        error,
      );
    }
  }

  missingImages =
    collected.filter(
      (nft) =>
        nft.imageCandidates.length === 0,
    );

  const MAX_ALCHEMY_REFRESH_FALLBACKS =
    12;

  if (
    missingImages.length > 0
  ) {
    const refreshed =
      await Promise.allSettled(
        missingImages
          .slice(
            0,
            MAX_ALCHEMY_REFRESH_FALLBACKS,
          )
          .map(
            async (nft) => ({
              nft,
              metadata:
                await fetchAlchemyFreshMetadata(
                  nft,
                ),
            }),
          ),
      );

    for (
      const result of refreshed
    ) {
      if (
        result.status !==
        "fulfilled"
      ) {
        continue;
      }

      mergeImageCandidates(
        result.value.nft,
        result.value.metadata,
      );
    }
  }

  missingImages =
    collected
      .filter(
        (nft) =>
          nft.imageCandidates.length === 0,
      )
      .slice(
        0,
        MAX_OPENSEA_IMAGE_FALLBACKS,
      );

  if (
    missingImages.length > 0
  ) {
    const refreshed =
      await Promise.all(
        missingImages.map(
          async (nft) => ({
            nft,
            image:
              await fetchOpenSeaNftImage(
                nft.contract,
                nft.tokenId,
              ),
          }),
        ),
      );

    for (
      const {
        nft,
        image,
      } of refreshed
    ) {
      if (image) {
        nft.imageCandidates =
          Array.from(
            new Set([
              ...nft.imageCandidates,
              image,
            ]),
          );
        nft.image =
          nft.imageCandidates[0];
      }
    }
  }

  /*
   * Deduplicate by
   * contract + token id.
   */
  return Array.from(
    new Map(
      collected.map(
        (nft) => [
          `${nft.contract.toLowerCase()}:${nft.tokenId}`,
          nft,
        ],
      ),
    ).values(),
  ).sort(
    (
      left,
      right,
    ) => {
      const collectionCompare =
        left.collectionName.localeCompare(
          right.collectionName,
        );

      if (
        collectionCompare !==
        0
      ) {
        return collectionCompare;
      }

      try {
        const leftId =
          BigInt(
            left.tokenId,
          );

        const rightId =
          BigInt(
            right.tokenId,
          );

        return leftId <
          rightId
          ? -1
          : leftId >
              rightId
            ? 1
            : 0;
      } catch {
        return left.tokenId.localeCompare(
          right.tokenId,
        );
      }
    },
  );
}

/*//////////////////////////////////////////////////////////////
                              ROUTE
//////////////////////////////////////////////////////////////*/

export async function GET(
  request: NextRequest,
) {
  const rawAddress =
    request.nextUrl.searchParams
      .get(
        "address",
      )
      ?.trim() ||
    "";

  if (
    !rawAddress ||
    !isAddress(
      rawAddress,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "A valid HoodWallet address is required.",

        assets:
          [],

        nfts:
          [],
      },
      {
        status:
          400,
      },
    );
  }

  const walletAddress =
    getAddress(
      rawAddress,
    );

  const [
    tokenResult,
    trustedTokenResult,
    nftResult,
  ] =
    await Promise.allSettled(
      [
        fetchBlockscoutBalances(
          walletAddress,
        ),

        fetchTrustedErc20Balances(
          walletAddress,
        ),

        fetchAlchemyNfts(
          walletAddress,
        ),
      ],
    );

  const warnings:
    string[] =
    [];

  let assets:
    AssetResponse[] =
    [];

  let nfts:
    NftResponse[] =
    [];

  const discoveredAssets =
    tokenResult.status === "fulfilled"
      ? normalizeTokenBalances(tokenResult.value)
      : [];

  const directTrustedAssets =
    trustedTokenResult.status === "fulfilled"
      ? trustedTokenResult.value
      : [];

  assets = mergeErc20Assets(
    discoveredAssets,
    directTrustedAssets,
  );

  if (tokenResult.status === "rejected") {
    console.error(
      `HoodWallet ERC-20 discovery failed for ${walletAddress}:`,
      tokenResult.reason,
    );

    // Do not blank verified tokens merely because Blockscout failed.
    warnings.push(
      "Explorer ERC-20 discovery is temporarily unavailable; verified token balances were read directly on-chain.",
    );
  }

  if (trustedTokenResult.status === "rejected") {
    console.error(
      `HoodWallet direct trusted ERC-20 reads failed for ${walletAddress}:`,
      trustedTokenResult.reason,
    );

    warnings.push(
      "Direct verified-token balance checks are temporarily unavailable.",
    );
  }

  if (
    nftResult.status ===
    "fulfilled"
  ) {
    nfts =
      nftResult.value;
  } else {
    console.error(
      `HoodWallet NFT discovery failed for ${walletAddress}:`,
      nftResult.reason,
    );

    warnings.push(
      nftResult.reason instanceof
        Error
        ? nftResult.reason.message
        : "NFT inventory is temporarily unavailable.",
    );
  }

  return NextResponse.json(
    {
      wallet:
        walletAddress,

      assets,

      nfts,

      /*
       * Keep this temporarily while
       * testing trusted matching.
       *
       * Remove it later if you do not
       * want the registry included in
       * the public API response.
       */
      trustedRegistry: {
        erc20:
          Array.from(
            trustedErc20Contracts,
          ),

        nfts:
          Array.from(
            trustedNftContracts,
          ),
      },

      ...(warnings.length >
      0
        ? {
            warning:
              warnings.join(
                " ",
              ),
          }
        : {}),
    },
    {
      status:
        200,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}