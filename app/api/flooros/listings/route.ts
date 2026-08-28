import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  formatUnits,
} from "ethers";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

const OPENSEA_API =
  "https://api.opensea.io/api/v2";

const ROBINHOOD_CHAIN =
  "robinhood";

const HOODIES_ADDRESS =
  "0x9Ec6C5b9f572A9B02138E553BC5F5882Da735F45";

/*
 * Override with:
 *
 * OPENSEA_HOODIES_SLUG=...
 *
 * if the OpenSea slug ever changes.
 */
const HOODIES_SLUG =
  process.env.OPENSEA_HOODIES_SLUG ||
  "onchainhoodies-";

const PAGE_SIZE =
  10;

const FETCH_SIZE =
  30;

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type UnknownRecord =
  Record<string, unknown>;

type NormalizedListing = {
  orderHash: string;

  chain: string;

  protocolAddress: string;

  contract: string;

  tokenId: string;

  name: string;

  image: string | null;

  priceWei: string;

  priceExact: string;

  priceDisplay: string;

  currency: string;

  decimals: number;

  remainingQuantity: number;

  openseaUrl: string;
};

/*//////////////////////////////////////////////////////////////
                            HELPERS
//////////////////////////////////////////////////////////////*/

function asRecord(
  value: unknown,
): UnknownRecord {
  if (
    typeof value === "object" &&
    value !== null
  ) {
    return value as UnknownRecord;
  }

  return {};
}

function asString(
  value: unknown,
  fallback = "",
) {
  if (
    typeof value === "string"
  ) {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return fallback;
}

function asNumber(
  value: unknown,
  fallback = 0,
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function sameAddress(
  a?: string | null,
  b?: string | null,
) {
  return (
    !!a &&
    !!b &&
    a.toLowerCase() ===
      b.toLowerCase()
  );
}

function getPriceObject(
  listing: UnknownRecord,
) {
  const price =
    asRecord(
      listing.price,
    );

  const current =
    asRecord(
      price.current,
    );

  if (
    Object.keys(
      current,
    ).length > 0
  ) {
    return current;
  }

  return price;
}

function displayPrice(
  raw: string,
  decimals: number,
) {
  try {
    const exact =
      formatUnits(
        BigInt(raw),
        decimals,
      );

    const numeric =
      Number(exact);

    if (
      !Number.isFinite(
        numeric,
      )
    ) {
      return exact;
    }

    if (
      numeric === 0
    ) {
      return "0";
    }

    let maximumDecimals =
      4;

    if (
      numeric < 0.0001
    ) {
      maximumDecimals =
        6;
    }

    return numeric
      .toFixed(
        maximumDecimals,
      )
      .replace(
        /\.?0+$/,
        "",
      );
  } catch {
    return raw;
  }
}

function exactPrice(
  raw: string,
  decimals: number,
) {
  try {
    return formatUnits(
      BigInt(raw),
      decimals,
    );
  } catch {
    return raw;
  }
}

/*//////////////////////////////////////////////////////////////
                          OPENSEA FETCH
//////////////////////////////////////////////////////////////*/

async function openSeaFetch(
  path: string,
) {
  const apiKey =
    process.env.OPENSEA_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENSEA_API_KEY is not configured.",
    );
  }

  const response =
    await fetch(
      `${OPENSEA_API}${path}`,
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

  const text =
    await response.text();

  let payload:
    unknown = {};

  try {
    payload =
      text
        ? JSON.parse(text)
        : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const record =
      asRecord(
        payload,
      );

    throw new Error(
      asString(
        record.detail,
      ) ||
      asString(
        record.error,
      ) ||
      asString(
        record.message,
      ) ||
      `OpenSea request failed (${response.status}).`,
    );
  }

  return payload;
}

/*//////////////////////////////////////////////////////////////
                           NFT META
//////////////////////////////////////////////////////////////*/

async function loadNftMetadata(
  tokenId: string,
) {
  try {
    const payload =
      await openSeaFetch(
        `/chain/${ROBINHOOD_CHAIN}/contract/${HOODIES_ADDRESS}/nfts/${encodeURIComponent(
          tokenId,
        )}`,
      );

    const root =
      asRecord(
        payload,
      );

    const nft =
      asRecord(
        root.nft ||
        payload,
      );

    const image =
      asString(
        nft.display_image_url,
      ) ||
      asString(
        nft.image_url,
      ) ||
      asString(
        nft.original_image_url,
      ) ||
      asString(
        nft.image,
      ) ||
      null;

    return {
      name:
        asString(
          nft.name,
        ) ||
        `OnChainHoodie #${tokenId}`,

      image,
    };
  } catch (
    error
  ) {
    console.warn(
      "FloorOS metadata unavailable:",
      tokenId,
      error,
    );

    return {
      name:
        `OnChainHoodie #${tokenId}`,

      image:
        null,
    };
  }
}

/*//////////////////////////////////////////////////////////////
                              GET
//////////////////////////////////////////////////////////////*/

export async function GET(
  request: NextRequest,
) {
  try {
    const {
      searchParams,
    } =
      new URL(
        request.url,
      );

    const cursor =
      searchParams.get(
        "cursor",
      ) ||
      "";

    const params =
      new URLSearchParams();

    params.set(
      "limit",
      String(
        FETCH_SIZE,
      ),
    );

    params.set(
      "include_private_listings",
      "false",
    );

    if (cursor) {
      params.set(
        "next.value",
        cursor,
      );
    }

    const payload =
      await openSeaFetch(
        `/listings/collection/${encodeURIComponent(
          HOODIES_SLUG,
        )}/best?${params.toString()}`,
      );

    const root =
      asRecord(
        payload,
      );

    const rawListings =
      Array.isArray(
        root.listings,
      )
        ? root.listings
        : [];

    const results:
      NormalizedListing[] =
      [];

    const seen =
      new Set<string>();

    for (
      const raw of
      rawListings
    ) {
      if (
        results.length >=
        PAGE_SIZE
      ) {
        break;
      }

      const listing =
        asRecord(
          raw,
        );

      const status =
        asString(
          listing.status,
        ).toUpperCase();

      if (
        status &&
        status !== "ACTIVE"
      ) {
        continue;
      }

      const chain =
        asString(
          listing.chain,
        ).toLowerCase();

      if (
        chain !==
        ROBINHOOD_CHAIN
      ) {
        continue;
      }

      const asset =
        asRecord(
          listing.asset,
        );

      const contract =
        asString(
          asset.contract,
        );

      const tokenId =
        asString(
          asset.identifier,
        );

      const orderHash =
        asString(
          listing.order_hash,
        );

      const protocolAddress =
        asString(
          listing.protocol_address,
        );

      /*
       * FloorOS is permanently locked
       * to the OnChainHoodies collection.
       */
      if (
        !sameAddress(
          contract,
          HOODIES_ADDRESS,
        )
      ) {
        continue;
      }

      if (
        !tokenId ||
        !orderHash ||
        !protocolAddress
      ) {
        continue;
      }

      const unique =
        `${contract.toLowerCase()}:${tokenId}`;

      if (
        seen.has(
          unique,
        )
      ) {
        continue;
      }

      seen.add(
        unique,
      );

      const price =
        getPriceObject(
          listing,
        );

      const currency =
        asString(
          price.currency,
          "ETH",
        ).toUpperCase();

      /*
       * FloorOS purchases native ETH
       * listings only.
       */
      if (
        currency !==
        "ETH"
      ) {
        continue;
      }

      const decimals =
        asNumber(
          price.decimals,
          18,
        );

      const priceWei =
        asString(
          price.value,
          "0",
        );

      let parsedPrice:
        bigint;

      try {
        parsedPrice =
          BigInt(
            priceWei,
          );
      } catch {
        continue;
      }

      if (
        parsedPrice <=
        BigInt(0)
      ) {
        continue;
      }

      const metadata =
        await loadNftMetadata(
          tokenId,
        );

      results.push({
        orderHash,

        chain:
          ROBINHOOD_CHAIN,

        protocolAddress,

        contract:
          HOODIES_ADDRESS,

        tokenId,

        name:
          metadata.name,

        image:
          metadata.image,

        priceWei,

        priceExact:
          exactPrice(
            priceWei,
            decimals,
          ),

        priceDisplay:
          displayPrice(
            priceWei,
            decimals,
          ),

        currency:
          "ETH",

        decimals,

        remainingQuantity:
          asNumber(
            listing.remaining_quantity,
            1,
          ),

        openseaUrl:
          `https://opensea.io/item/${ROBINHOOD_CHAIN}/${HOODIES_ADDRESS}/${encodeURIComponent(
            tokenId,
          )}`,
      });
    }

    if (
      results.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "No active OnChainHoodies ETH listings found.",
        },
        {
          status:
            404,
        },
      );
    }

    return NextResponse.json(
      {
        ok:
          true,

        chain:
          ROBINHOOD_CHAIN,

        slug:
          HOODIES_SLUG,

        collection: {
          name:
            "OnChainHoodies",

          openseaUrl:
            `https://opensea.io/collection/${encodeURIComponent(
              HOODIES_SLUG,
            )}`,
        },

        listings:
          results,

        next:
          asString(
            root.next,
          ) ||
          null,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      "FloorOS listings:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Hoodie floor.",
      },
      {
        status:
          500,
      },
    );
  }
}