import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getAddress,
  isAddress,
} from "ethers";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

const OPENSEA_API_BASE =
  "https://api.opensea.io/api/v2";

const ROBINHOOD_CHAIN =
  "robinhood";

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type OpenSeaNft = {
  contract?: string;

  chain?: string;

  collection?: string;

  identifier?: string;

  name?: string;
};

type OpenSeaNftsResponse = {
  nfts?: OpenSeaNft[];
};

type OpenSeaCollectionResponse = {
  collection?: string;

  name?: string;

  slug?: string;

  contracts?: Array<{
    address?: string;

    chain?: string;
  }>;
};

type ParsedOpenSeaUrl =
  | {
      kind:
        "contract";

      contract:
        string;

      chain?:
        string;

      tokenId?:
        string;
    }
  | {
      kind:
        "collection";

      slug:
        string;
    };

/*//////////////////////////////////////////////////////////////
                            HELPERS
//////////////////////////////////////////////////////////////*/

function jsonError(
  message: string,
  status = 400,
) {
  return NextResponse.json(
    {
      ok:
        false,

      error:
        message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

function normalizeHost(
  hostname: string,
) {
  return hostname
    .toLowerCase()
    .replace(
      /^www\./,
      "",
    );
}

function normalizeChain(
  value?: string | null,
) {
  return (
    value
      ?.trim()
      .toLowerCase() ||
    ""
  );
}

function assertRobinhoodChain(
  chain?: string | null,
) {
  if (
    normalizeChain(
      chain,
    ) !==
    ROBINHOOD_CHAIN
  ) {
    throw new Error(
      "MintOS only supports Robinhood Chain collections.",
    );
  }
}

/*//////////////////////////////////////////////////////////////
                       PARSE OPENSEA URL
//////////////////////////////////////////////////////////////*/

function parseOpenSeaUrl(
  input: string,
): ParsedOpenSeaUrl {
  let url:
    URL;

  try {
    url =
      new URL(
        input,
      );
  } catch {
    throw new Error(
      "Enter a valid OpenSea URL.",
    );
  }

  if (
    normalizeHost(
      url.hostname,
    ) !==
    "opensea.io"
  ) {
    throw new Error(
      "MintOS currently accepts opensea.io URLs only.",
    );
  }

  const segments =
    url.pathname
      .split("/")
      .map(
        (
          segment,
        ) =>
          decodeURIComponent(
            segment.trim(),
          ),
      )
      .filter(
        Boolean,
      );

  /*
   * URLs containing an EVM address.
   *
   * Examples:
   *
   * /item/robinhood/0x.../123
   * /assets/robinhood/0x.../123
   */
  const addressSegment =
    segments.find(
      (
        segment,
      ) =>
        isAddress(
          segment,
        ),
    );

  if (
    addressSegment
  ) {
    const addressIndex =
      segments.indexOf(
        addressSegment,
      );

    /*
     * The segment directly before
     * the contract should be the chain.
     */
    const chain =
      addressIndex > 0
        ? segments[
            addressIndex -
              1
          ]
        : undefined;

    return {
      kind:
        "contract",

      contract:
        getAddress(
          addressSegment,
        ),

      chain,

      tokenId:
        addressIndex >= 0 &&
        segments[
          addressIndex +
            1
        ]
          ? segments[
              addressIndex +
                1
            ]
          : undefined,
    };
  }

  /*
   * Collection URL:
   *
   * /collection/the-tickerz
   */
  const collectionIndex =
    segments.findIndex(
      (
        segment,
      ) =>
        segment.toLowerCase() ===
        "collection",
    );

  if (
    collectionIndex >= 0
  ) {
    const slug =
      segments[
        collectionIndex +
          1
      ];

    if (!slug) {
      throw new Error(
        "The OpenSea collection URL is missing its collection slug.",
      );
    }

    return {
      kind:
        "collection",

      slug,
    };
  }

  throw new Error(
    "MintOS could not recognize this OpenSea URL. Use a Robinhood Chain collection or NFT URL.",
  );
}

/*//////////////////////////////////////////////////////////////
                         OPENSEA FETCH
//////////////////////////////////////////////////////////////*/

async function openSeaFetch(
  path: string,
) {
  const apiKey =
    process.env
      .OPENSEA_API_KEY
      ?.trim();

  if (!apiKey) {
    throw new Error(
      "Server configuration is missing OPENSEA_API_KEY.",
    );
  }

  const response =
    await fetch(
      `${OPENSEA_API_BASE}${path}`,
      {
        method:
          "GET",

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

  if (
    !response.ok
  ) {
    let detail =
      "";

    try {
      const body =
        (await response.json()) as {
          detail?: string;

          error?: string;

          message?: string;
        };

      detail =
        body.detail ||
        body.error ||
        body.message ||
        "";
    } catch {
      // Ignore non-JSON errors.
    }

    if (
      response.status ===
      404
    ) {
      throw new Error(
        "OpenSea could not find that collection.",
      );
    }

    if (
      response.status ===
        401 ||
      response.status ===
        403
    ) {
      throw new Error(
        "OpenSea rejected the API request. Check OPENSEA_API_KEY.",
      );
    }

    throw new Error(
      detail ||
        `OpenSea API request failed with status ${response.status}.`,
    );
  }

  return response.json() as
    Promise<unknown>;
}

/*//////////////////////////////////////////////////////////////
                    RESOLVE COLLECTION SLUG
//////////////////////////////////////////////////////////////*/

async function resolveCollectionSlug(
  slug: string,
) {
  const collectionPayload =
    (await openSeaFetch(
      `/collections/${encodeURIComponent(
        slug,
      )}`,
    )) as
      OpenSeaCollectionResponse;

  /*
   * IMPORTANT:
   *
   * Do NOT take the first collection contract.
   *
   * Explicitly find a Robinhood Chain contract.
   */
  const robinhoodContract =
    collectionPayload.contracts?.find(
      (
        entry,
      ) =>
        entry.address &&
        isAddress(
          entry.address,
        ) &&
        normalizeChain(
          entry.chain,
        ) ===
          ROBINHOOD_CHAIN,
    );

  if (
    robinhoodContract
      ?.address
  ) {
    return {
      contract:
        getAddress(
          robinhoodContract.address,
        ),

      chain:
        ROBINHOOD_CHAIN,

      slug,

      name:
        collectionPayload.name ||
        collectionPayload.collection ||
        slug,
    };
  }

  /*
   * If collection.contracts exists,
   * but none are Robinhood, reject immediately.
   */
  if (
    collectionPayload
      .contracts &&
    collectionPayload
      .contracts.length >
      0
  ) {
    throw new Error(
      "MintOS only supports Robinhood Chain collections.",
    );
  }

  /*
   * Fallback:
   *
   * Request one NFT from the collection.
   *
   * Then explicitly require that NFT to
   * identify itself as Robinhood.
   */
  const nftPayload =
    (await openSeaFetch(
      `/collection/${encodeURIComponent(
        slug,
      )}/nfts?limit=1`,
    )) as
      OpenSeaNftsResponse;

  const nft =
    nftPayload.nfts?.find(
      (
        item,
      ) =>
        item.contract &&
        isAddress(
          item.contract,
        ),
    );

  if (
    !nft?.contract
  ) {
    throw new Error(
      "OpenSea found the collection but MintOS could not resolve its NFT contract.",
    );
  }

  assertRobinhoodChain(
    nft.chain,
  );

  return {
    contract:
      getAddress(
        nft.contract,
      ),

    chain:
      ROBINHOOD_CHAIN,

    slug,

    name:
      collectionPayload.name ||
      collectionPayload.collection ||
      slug,
  };
}

/*//////////////////////////////////////////////////////////////
                              GET
//////////////////////////////////////////////////////////////*/

export async function GET(
  request: NextRequest,
) {
  try {
    const input =
      request.nextUrl
        .searchParams
        .get(
          "url",
        )
        ?.trim();

    if (!input) {
      return jsonError(
        "Missing OpenSea URL.",
      );
    }

    const parsed =
      parseOpenSeaUrl(
        input,
      );

    /*////////////////////////////////////////////////////////////
                     DIRECT NFT / CONTRACT URL
    ////////////////////////////////////////////////////////////*/

    if (
      parsed.kind ===
      "contract"
    ) {
      /*
       * For direct OpenSea asset URLs,
       * require an explicit Robinhood chain
       * segment.
       *
       * We intentionally reject ambiguous URLs.
       */
      assertRobinhoodChain(
        parsed.chain,
      );

      return NextResponse.json(
        {
          ok:
            true,

          source:
            "url",

          contract:
            parsed.contract,

          chain:
            ROBINHOOD_CHAIN,

          tokenId:
            parsed.tokenId ||
            null,

          slug:
            null,

          name:
            null,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    /*////////////////////////////////////////////////////////////
                       COLLECTION URL
    ////////////////////////////////////////////////////////////*/

    const resolved =
      await resolveCollectionSlug(
        parsed.slug,
      );

    /*
     * Final server-side invariant.
     */
    assertRobinhoodChain(
      resolved.chain,
    );

    return NextResponse.json(
      {
        ok:
          true,

        source:
          "opensea",

        contract:
          resolved.contract,

        chain:
          ROBINHOOD_CHAIN,

        tokenId:
          null,

        slug:
          resolved.slug,

        name:
          resolved.name,
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
      "MintOS OpenSea resolver failed:",
      error,
    );

    return jsonError(
      error instanceof
      Error
        ? error.message
        : "Unable to resolve this OpenSea URL.",
      400,
    );
  }
}