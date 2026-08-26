import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "ethers";

import { siteConfig } from "../../../../lib/config";
import trustedAssetRegistryJson from "../../../../lib/hoodwallet-assets.json";

export const dynamic = "force-dynamic";
export const revalidate = 300;
export const runtime = "nodejs";

const HOODWALLET_ASSET_CACHE_SECONDS = 300;
const HOODWALLET_ASSET_STALE_SECONDS = 3600;


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

    isSpam?: boolean;

    spamClassifications?: string[];
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
   * Preserve the image sources that are already
   * rendering correctly in HoodWallet.
   */
  const staticCandidates = [
    nft.image?.cachedUrl,
    nft.image?.pngUrl,
    nft.image?.thumbnailUrl,
    nft.raw?.metadata?.image,
    nft.raw?.metadata?.image_url,
    nft.raw?.metadata?.imageUrl,
  ];

  /*
   * If Alchemy tells us the original asset is a
   * video, prefer that source through our tiny
   * image proxy. This gives OpenSea/SeaDN media
   * a still frame instead of trying to render MP4
   * in an <img>.
   */
  const original =
    nft.image?.originalUrl;

  if (
    original &&
    looksLikeVideo(
      original,
    )
  ) {
    return (
      "/api/hoodwallet/image?url=" +
      encodeURIComponent(
        original,
      )
    );
  }

  for (
    const candidate of
    staticCandidates
  ) {
    if (
      candidate &&
      !looksLikeVideo(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  return original;
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
            "force-cache",
          next: {
            revalidate:
              HOODWALLET_ASSET_CACHE_SECONDS,
          },
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
          `public, max-age=60, s-maxage=${HOODWALLET_ASSET_CACHE_SECONDS}, stale-while-revalidate=${HOODWALLET_ASSET_STALE_SECONDS}`,
        "X-HoodWallet-Cache-TTL":
          String(HOODWALLET_ASSET_CACHE_SECONDS),
      },
    },
  );
}