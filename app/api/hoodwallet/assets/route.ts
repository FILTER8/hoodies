import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "ethers";

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
  if (
    !Array.isArray(
      payload,
    )
  ) {
    return [];
  }

  return (
    payload as BlockscoutTokenBalance[]
  )
    .filter(
      (item) =>
        item.token?.type ===
        "ERC-20",
    )
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

function pickNftImage(
  nft: AlchemyOwnedNft,
) {
  /*
   * Wallet UI priority:
   *
   * 1. Alchemy cached/processed media.
   * 2. Alchemy PNG conversion.
   * 3. Alchemy thumbnail.
   * 4. Original token media.
   * 5. Raw metadata image fields.
   *
   * The cached Alchemy URLs are dramatically more reliable for
   * heterogeneous wallet inventories than drawing arbitrary IPFS,
   * gateway and collection-hosted URLs directly in the browser.
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

  for (
    const candidate of
    candidates
  ) {
    const value =
      candidate?.trim();

    if (
      value &&
      !looksLikeVideo(
        value,
      )
    ) {
      return value;
    }
  }

  return undefined;
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
        !nft.image ||
        nft.image.trim() === "",
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

        const image =
          item
            ? pickNftImage(item)
            : undefined;

        if (image) {
          nft.image =
            image;
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
        !nft.image ||
        nft.image.trim() === "",
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

      const image =
        pickNftImage(
          result.value.metadata,
        );

      if (image) {
        result.value.nft.image =
          image;
      }
    }
  }

  missingImages =
    collected
      .filter(
        (nft) =>
          !nft.image ||
          nft.image.trim() === "",
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
        nft.image =
          image;
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
    nftResult,
  ] =
    await Promise.allSettled(
      [
        fetchBlockscoutBalances(
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

  if (
    tokenResult.status ===
    "fulfilled"
  ) {
    assets =
      normalizeTokenBalances(
        tokenResult.value,
      );
  } else {
    console.error(
      `HoodWallet ERC-20 discovery failed for ${walletAddress}:`,
      tokenResult.reason,
    );

    warnings.push(
      tokenResult.reason instanceof
        Error
        ? tokenResult.reason.message
        : "ERC-20 balances are temporarily unavailable.",
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