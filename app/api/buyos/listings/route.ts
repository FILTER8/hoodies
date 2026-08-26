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
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function parseSlug(
  input: string,
) {
  const value =
    input.trim();

  if (!value) {
    return "";
  }

  if (
    !value.includes("/")
  ) {
    return value;
  }

  try {
    const url =
      new URL(value);

    if (
      url.hostname !== "opensea.io" &&
      !url.hostname.endsWith(".opensea.io")
    ) {
      return "";
    }

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    const index =
      parts.findIndex(
        (
          part,
        ) =>
          part.toLowerCase() ===
          "collection",
      );

    if (
      index >= 0 &&
      parts[index + 1]
    ) {
      return decodeURIComponent(
        parts[index + 1],
      );
    }

    return "";
  } catch {
    return "";
  }
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
    Object.keys(current)
      .length > 0
  ) {
    return current;
  }

  return price;
}

/*
 * Display like OpenSea rather than exposing
 * excessive precision.
 *
 * Examples:
 *
 * 0.000788 -> 0.0008
 * 0.021179 -> 0.0212
 * 1.234567 -> 1.2346
 *
 * Tiny values keep additional precision.
 *
 * IMPORTANT:
 * This is display only.
 * priceWei remains untouched.
 */
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

    const rounded =
      numeric.toFixed(
        maximumDecimals,
      );

    return rounded.replace(
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

async function openSeaFetch(
  path: string,
) {
  const apiKey =
    process.env
      .OPENSEA_API_KEY;

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
      asRecord(payload);

    if (
      response.status ===
      401
    ) {
      throw new Error(
        "OpenSea API authentication failed.",
      );
    }

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
                           COLLECTION
//////////////////////////////////////////////////////////////*/

async function loadCollection(
  slug: string,
) {
  const payload =
    await openSeaFetch(
      `/collections/${encodeURIComponent(
        slug,
      )}`,
    );

  const collection =
    asRecord(payload);

  const contracts =
    Array.isArray(
      collection.contracts,
    )
      ? collection.contracts
      : [];

  /*
   * If OpenSea gives us contract chain metadata,
   * enforce Robinhood here too.
   */
  if (
    contracts.length > 0
  ) {
    const hasRobinhood =
      contracts.some(
        (
          raw,
        ) => {
          const contract =
            asRecord(raw);

          return (
            asString(
              contract.chain,
            ).toLowerCase() ===
            ROBINHOOD_CHAIN
          );
        },
      );

    if (!hasRobinhood) {
      throw new Error(
        "BuyOS only supports Robinhood Chain collections.",
      );
    }
  }

  return {
    name:
      asString(
        collection.name,
      ) ||
      slug,

    image:
      asString(
        collection.image_url,
      ) ||
      asString(
        collection.image,
      ) ||
      null,

    description:
      asString(
        collection.description,
      ),

    openseaUrl:
      `https://opensea.io/collection/${encodeURIComponent(
        slug,
      )}`,
  };
}

/*//////////////////////////////////////////////////////////////
                           NFT META
//////////////////////////////////////////////////////////////*/

async function loadNftMetadata(
  contract: string,
  tokenId: string,
) {
  try {
    const payload =
      await openSeaFetch(
        `/chain/${ROBINHOOD_CHAIN}/contract/${encodeURIComponent(
          contract,
        )}/nfts/${encodeURIComponent(
          tokenId,
        )}`,
      );

    const root =
      asRecord(payload);

    const nft =
      asRecord(
        root.nft ||
        payload,
      );

    /*
     * Prefer OpenSea's display image.
     *
     * It is often safer for animated/video NFTs
     * because OpenSea may supply a rendered preview.
     */
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
        ),

      image,
    };
  } catch (
    error
  ) {
    console.warn(
      "BuyOS NFT metadata unavailable:",
      contract,
      tokenId,
      error,
    );

    return {
      name:
        "",
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

    const input =
      searchParams.get(
        "url",
      ) ||
      searchParams.get(
        "slug",
      ) ||
      "";

    const cursor =
      searchParams.get(
        "cursor",
      ) ||
      "";

    const slug =
      parseSlug(
        input,
      );

    if (!slug) {
      return NextResponse.json(
        {
          error:
            "Enter a valid OpenSea collection URL or slug.",
        },
        {
          status:
            400,
        },
      );
    }

    const collection =
      await loadCollection(
        slug,
      );

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
      /*
       * This endpoint uses next.value
       * in OpenSea's marketplace API family.
       */
      params.set(
        "next.value",
        cursor,
      );
    }

    const payload =
      await openSeaFetch(
        `/listings/collection/${encodeURIComponent(
          slug,
        )}/best?${params.toString()}`,
      );

    const root =
      asRecord(payload);

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
        asRecord(raw);

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

      /*
       * HARD CHAIN LOCK.
       */
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

      if (
        !contract ||
        !tokenId ||
        !orderHash ||
        !protocolAddress
      ) {
        continue;
      }

      const unique =
        `${contract.toLowerCase()}:${tokenId}`;

      /*
       * The best-listing endpoint may include more
       * than one order for a token.
       *
       * It is price sorted, so keep the first.
       */
      if (
        seen.has(unique)
      ) {
        continue;
      }

      seen.add(unique);

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
       * BuyOS V1:
       *
       * native ETH only.
       */
      if (
        currency !== "ETH"
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

      const metadata =
        await loadNftMetadata(
          contract,
          tokenId,
        );

      results.push({
        orderHash,

        chain:
          ROBINHOOD_CHAIN,

        protocolAddress,

        contract,

        tokenId,

        name:
          metadata.name ||
          `NFT #${tokenId}`,

        image:
          metadata.image,

        priceWei,

        /*
         * Keep both exact + display versions.
         */
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
          `https://opensea.io/item/${ROBINHOOD_CHAIN}/${contract}/${encodeURIComponent(
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
            "No active Robinhood Chain ETH listings found.",
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

        slug,

        collection,

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
      "BuyOS listings:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load listings.",
      },
      {
        status:
          500,
      },
    );
  }
}