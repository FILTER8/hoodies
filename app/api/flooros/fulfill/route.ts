import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Interface,
  getAddress,
  isAddress,
} from "ethers";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

const OPENSEA_API =
  "https://api.opensea.io/api/v2";

const ROBINHOOD_CHAIN =
  "robinhood";

const ROBINHOOD_CHAIN_ID =
  4663;

const HOODIES_ADDRESS =
  "0x9Ec6C5b9f572A9B02138E553BC5F5882Da735F45";

const HOODIE_FLOOR_ADDRESS =
  "0x2602ef74497799D148093C3F1238193E72b22fD8";

const TREASURY_ADDRESS =
  "0xB4C949eF42a39BB1F37e81661Ddf95f08d5965EC";

const SEAPORT_ADDRESS =
  "0x0000000000000068F116a894984e2DB1123eB395";

const HOODIES_SLUG =
  process.env.OPENSEA_HOODIES_SLUG ||
  "onchainhoodies-";

const FULFILL_ADVANCED_ORDER_SELECTOR =
  "0xe7acab24";

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type UnknownRecord =
  Record<string, unknown>;

type FloorFulfillRequest = {
  orderHash?: string;

  protocolAddress?: string;

  tokenId?: string;
};

/*//////////////////////////////////////////////////////////////
                        SEAPORT ABI
//////////////////////////////////////////////////////////////*/

const SEAPORT_INTERFACE =
  new Interface([
    `function fulfillAdvancedOrder(
      (
        (
          address offerer,
          address zone,
          (
            uint8 itemType,
            address token,
            uint256 identifierOrCriteria,
            uint256 startAmount,
            uint256 endAmount
          )[] offer,
          (
            uint8 itemType,
            address token,
            uint256 identifierOrCriteria,
            uint256 startAmount,
            uint256 endAmount,
            address recipient
          )[] consideration,
          uint8 orderType,
          uint256 startTime,
          uint256 endTime,
          bytes32 zoneHash,
          uint256 salt,
          bytes32 conduitKey,
          uint256 totalOriginalConsiderationItems
        ) parameters,
        uint120 numerator,
        uint120 denominator,
        bytes signature,
        bytes extraData
      ) advancedOrder,
      (
        uint256 orderIndex,
        uint8 side,
        uint256 index,
        uint256 identifier,
        bytes32[] criteriaProof
      )[] criteriaResolvers,
      bytes32 fulfillerConduitKey,
      address recipient
    ) payable returns (bool fulfilled)`,
  ]);

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

function errorFromPayload(
  payload: unknown,
  fallback: string,
) {
  const record =
    asRecord(
      payload,
    );

  return (
    asString(
      record.detail,
    ) ||
    asString(
      record.error,
    ) ||
    asString(
      record.message,
    ) ||
    fallback
  );
}

function appendCalldataSuffix(
  calldata: string,
  suffix: string,
) {
  if (!suffix) {
    return calldata;
  }

  if (
    !calldata.startsWith(
      "0x",
    ) ||
    !suffix.startsWith(
      "0x",
    )
  ) {
    throw new Error(
      "Invalid OpenSea calldata suffix.",
    );
  }

  return (
    calldata +
    suffix.slice(
      2,
    )
  );
}

/*//////////////////////////////////////////////////////////////
                    NORMALIZE SEAPORT OBJECTS
//////////////////////////////////////////////////////////////*/

function normalizeOfferItem(
  value: unknown,
) {
  const item =
    asRecord(
      value,
    );

  return {
    itemType:
      asNumber(
        item.itemType,
      ),

    token:
      getAddress(
        asString(
          item.token,
        ),
      ),

    identifierOrCriteria:
      asString(
        item.identifierOrCriteria,
        "0",
      ),

    startAmount:
      asString(
        item.startAmount,
        "0",
      ),

    endAmount:
      asString(
        item.endAmount,
        "0",
      ),
  };
}

function normalizeConsiderationItem(
  value: unknown,
) {
  const item =
    asRecord(
      value,
    );

  return {
    itemType:
      asNumber(
        item.itemType,
      ),

    token:
      getAddress(
        asString(
          item.token,
        ),
      ),

    identifierOrCriteria:
      asString(
        item.identifierOrCriteria,
        "0",
      ),

    startAmount:
      asString(
        item.startAmount,
        "0",
      ),

    endAmount:
      asString(
        item.endAmount,
        "0",
      ),

    recipient:
      getAddress(
        asString(
          item.recipient,
        ),
      ),
  };
}

function normalizeOrderParameters(
  value: unknown,
) {
  const parameters =
    asRecord(
      value,
    );

  const rawOffer =
    Array.isArray(
      parameters.offer,
    )
      ? parameters.offer
      : [];

  const rawConsideration =
    Array.isArray(
      parameters.consideration,
    )
      ? parameters.consideration
      : [];

  return {
    offerer:
      getAddress(
        asString(
          parameters.offerer,
        ),
      ),

    zone:
      getAddress(
        asString(
          parameters.zone,
        ),
      ),

    offer:
      rawOffer.map(
        normalizeOfferItem,
      ),

    consideration:
      rawConsideration.map(
        normalizeConsiderationItem,
      ),

    orderType:
      asNumber(
        parameters.orderType,
      ),

    startTime:
      asString(
        parameters.startTime,
        "0",
      ),

    endTime:
      asString(
        parameters.endTime,
        "0",
      ),

    zoneHash:
      asString(
        parameters.zoneHash,
      ),

    salt:
      asString(
        parameters.salt,
        "0",
      ),

    conduitKey:
      asString(
        parameters.conduitKey,
      ),

    totalOriginalConsiderationItems:
      asString(
        parameters.totalOriginalConsiderationItems,
        String(
          rawConsideration.length,
        ),
      ),
  };
}

function normalizeAdvancedOrder(
  value: unknown,
) {
  const advancedOrder =
    asRecord(
      value,
    );

  return {
    parameters:
      normalizeOrderParameters(
        advancedOrder.parameters,
      ),

    numerator:
      asString(
        advancedOrder.numerator,
        "1",
      ),

    denominator:
      asString(
        advancedOrder.denominator,
        "1",
      ),

    signature:
      asString(
        advancedOrder.signature,
      ),

    extraData:
      asString(
        advancedOrder.extraData,
        "0x",
      ),
  };
}

function normalizeCriteriaResolver(
  value: unknown,
) {
  const resolver =
    asRecord(
      value,
    );

  const proof =
    Array.isArray(
      resolver.criteriaProof,
    )
      ? resolver.criteriaProof.map(
          (
            entry,
          ) =>
            asString(
              entry,
            ),
        )
      : [];

  return {
    orderIndex:
      asString(
        resolver.orderIndex,
        "0",
      ),

    side:
      asNumber(
        resolver.side,
      ),

    index:
      asString(
        resolver.index,
        "0",
      ),

    identifier:
      asString(
        resolver.identifier,
        "0",
      ),

    criteriaProof:
      proof,
  };
}

/*//////////////////////////////////////////////////////////////
                  ENCODE OPENSEA TRANSACTION
//////////////////////////////////////////////////////////////*/

function encodeOpenSeaTransaction(
  fulfillmentPayload:
    unknown,
) {
  const root =
    asRecord(
      fulfillmentPayload,
    );

  const fulfillmentData =
    asRecord(
      root.fulfillment_data,
    );

  const transaction =
    asRecord(
      fulfillmentData.transaction,
    );

  if (
    Object.keys(
      transaction,
    ).length ===
    0
  ) {
    throw new Error(
      "OpenSea fulfillment did not contain a transaction.",
    );
  }

  const target =
    asString(
      transaction.to,
    );

  const value =
    asString(
      transaction.value,
      "0",
    );

  const chainId =
    asNumber(
      transaction.chain,
    );

  const functionSignature =
    asString(
      transaction.function,
    );

  const calldataSuffix =
    asString(
      transaction.calldata_suffix,
    );

  if (
    chainId !==
    ROBINHOOD_CHAIN_ID
  ) {
    throw new Error(
      `OpenSea returned chain ${chainId}, not Robinhood Chain ${ROBINHOOD_CHAIN_ID}.`,
    );
  }

  if (
    !target ||
    !isAddress(
      target,
    ) ||
    !sameAddress(
      target,
      SEAPORT_ADDRESS,
    )
  ) {
    throw new Error(
      "OpenSea returned the wrong Seaport target.",
    );
  }

  /*
   * OpenSea may return already encoded calldata.
   */
  const directData =
    asString(
      transaction.data,
    );

  if (
    directData.startsWith(
      "0x",
    ) &&
    directData.length >=
      10
  ) {
    const finalData =
      appendCalldataSuffix(
        directData,
        calldataSuffix,
      );

    if (
      finalData
        .slice(
          0,
          10,
        )
        .toLowerCase() !==
      FULFILL_ADVANCED_ORDER_SELECTOR
    ) {
      throw new Error(
        "OpenSea returned an unsupported Seaport function.",
      );
    }

    return {
      target:
        getAddress(
          target,
        ),

      value,

      data:
        finalData,
    };
  }

  if (
    !functionSignature.startsWith(
      "fulfillAdvancedOrder(",
    )
  ) {
    throw new Error(
      `Unsupported OpenSea fulfillment function: ${
        functionSignature ||
        "unknown"
      }.`,
    );
  }

  const inputData =
    asRecord(
      transaction.input_data,
    );

  const advancedOrder =
    normalizeAdvancedOrder(
      inputData.advancedOrder,
    );

  const rawResolvers =
    Array.isArray(
      inputData.criteriaResolvers,
    )
      ? inputData.criteriaResolvers
      : [];

  const criteriaResolvers =
    rawResolvers.map(
      normalizeCriteriaResolver,
    );

  const fulfillerConduitKey =
    asString(
      inputData.fulfillerConduitKey,
    );

  const recipient =
    asString(
      inputData.recipient,
    );

  if (
    !fulfillerConduitKey ||
    !fulfillerConduitKey.startsWith(
      "0x",
    )
  ) {
    throw new Error(
      "OpenSea returned an invalid fulfiller conduit key.",
    );
  }

  if (
    !recipient ||
    !isAddress(
      recipient,
    ) ||
    !sameAddress(
      recipient,
      TREASURY_ADDRESS,
    )
  ) {
    throw new Error(
      "OpenSea fulfillment recipient is not the Treasury.",
    );
  }

  const encoded =
    SEAPORT_INTERFACE.encodeFunctionData(
      "fulfillAdvancedOrder",
      [
        advancedOrder,

        criteriaResolvers,

        fulfillerConduitKey,

        getAddress(
          recipient,
        ),
      ],
    );

  const data =
    appendCalldataSuffix(
      encoded,
      calldataSuffix,
    );

  if (
    data
      .slice(
        0,
        10,
      )
      .toLowerCase() !==
    FULFILL_ADVANCED_ORDER_SELECTOR
  ) {
    throw new Error(
      "Encoded Seaport selector is invalid.",
    );
  }

  return {
    target:
      getAddress(
        target,
      ),

    value,

    data,
  };
}

/*//////////////////////////////////////////////////////////////
                          OPENSEA GET
//////////////////////////////////////////////////////////////*/

async function openSeaGet(
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

  const text =
    await response.text();

  let payload:
    unknown = {};

  try {
    payload =
      text
        ? JSON.parse(
            text,
          )
        : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(
      errorFromPayload(
        payload,
        `OpenSea request failed (${response.status}).`,
      ),
    );
  }

  return payload;
}

/*//////////////////////////////////////////////////////////////
                              POST
//////////////////////////////////////////////////////////////*/

export async function POST(
  request: NextRequest,
) {
  try {
    const apiKey =
      process.env.OPENSEA_API_KEY;

    if (!apiKey) {
      throw new Error(
        "OPENSEA_API_KEY is not configured.",
      );
    }

    const body =
      (await request.json()) as
        FloorFulfillRequest;

    /*
     * orderHash is accepted from the frontend
     * for reference/debugging, but we intentionally
     * do NOT require the refreshed best order to
     * have the same hash.
     *
     * OpenSea can rotate/reorder best listings
     * between page load and execution.
     */
    const requestedOrderHash =
      body.orderHash?.trim() ||
      "";

    const protocolAddress =
      body.protocolAddress?.trim() ||
      "";

    const tokenId =
      body.tokenId?.trim() ||
      "";

    if (
      !protocolAddress ||
      !tokenId
    ) {
      return NextResponse.json(
        {
          error:
            "Missing FloorOS listing information.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      !isAddress(
        protocolAddress,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid OpenSea protocol address.",
        },
        {
          status:
            400,
        },
      );
    }

    const normalizedProtocol =
      getAddress(
        protocolAddress,
      );

    /*////////////////////////////////////////////////////////////
                     REFRESH CURRENT BEST LISTING
    ////////////////////////////////////////////////////////////*/

    const bestPayload =
      await openSeaGet(
        `/listings/collection/${encodeURIComponent(
          HOODIES_SLUG,
        )}/nfts/${encodeURIComponent(
          tokenId,
        )}/best?include_private_listings=false`,
      );

    const best =
      asRecord(
        bestPayload,
      );

    const freshHash =
      asString(
        best.order_hash,
      );

    const freshChain =
      asString(
        best.chain,
      ).toLowerCase();

    const freshProtocol =
      asString(
        best.protocol_address,
      );

    const freshAsset =
      asRecord(
        best.asset,
      );

    const freshContract =
      asString(
        freshAsset.contract,
      );

    const freshTokenId =
      asString(
        freshAsset.identifier,
      );

    if (!freshHash) {
      return NextResponse.json(
        {
          error:
            "This Hoodie is no longer listed.",
        },
        {
          status:
            409,
        },
      );
    }

    /*
     * The stale frontend hash is deliberately
     * NOT enforced.
     *
     * We use freshHash from this point onward.
     */
    if (
      requestedOrderHash &&
      requestedOrderHash.toLowerCase() !==
        freshHash.toLowerCase()
    ) {
      console.info(
        "FloorOS listing hash refreshed:",
        {
          tokenId,
          requestedOrderHash,
          freshHash,
        },
      );
    }

    if (
      freshChain !==
      ROBINHOOD_CHAIN
    ) {
      return NextResponse.json(
        {
          error:
            "The refreshed listing is not on Robinhood Chain.",
        },
        {
          status:
            409,
        },
      );
    }

    if (
      !sameAddress(
        freshContract,
        HOODIES_ADDRESS,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The refreshed listing is not an OnChainHoodie.",
        },
        {
          status:
            409,
        },
      );
    }

    if (
      freshTokenId !==
      tokenId
    ) {
      return NextResponse.json(
        {
          error:
            "Hoodie token ID changed.",
        },
        {
          status:
            409,
        },
      );
    }

    /*
     * Keep protocol stable.
     *
     * The listing hash may change, but we do not
     * silently move to a different marketplace
     * protocol.
     */
    if (
      freshProtocol &&
      !sameAddress(
        freshProtocol,
        normalizedProtocol,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The OpenSea protocol changed. Refresh FloorOS.",
        },
        {
          status:
            409,
        },
      );
    }

    const fulfillmentProtocol =
      freshProtocol &&
      isAddress(
        freshProtocol,
      )
        ? getAddress(
            freshProtocol,
          )
        : normalizedProtocol;

    /*////////////////////////////////////////////////////////////
                     GENERATE FRESH FULFILLMENT
    ////////////////////////////////////////////////////////////*/

    const fulfillmentResponse =
      await fetch(
        `${OPENSEA_API}/listings/fulfillment_data`,
        {
          method:
            "POST",

          headers: {
            accept:
              "application/json",

            "content-type":
              "application/json",

            "x-api-key":
              apiKey,
          },

          body:
            JSON.stringify({
              listing: {
                /*
                 * Always use the fresh best order.
                 */
                hash:
                  freshHash,

                chain:
                  ROBINHOOD_CHAIN,

                protocol_address:
                  fulfillmentProtocol,
              },

              /*
               * HoodieFloor is the actual
               * Seaport caller and ETH payer.
               */
              fulfiller: {
                address:
                  HOODIE_FLOOR_ADDRESS,
              },

              /*
               * Purchased Hoodie goes directly
               * to the protocol Treasury.
               */
              recipient:
                TREASURY_ADDRESS,

              units_to_fill:
                1,

              include_optional_creator_fees:
                false,
            }),

          cache:
            "no-store",
        },
      );

    const text =
      await fulfillmentResponse.text();

    let fulfillmentPayload:
      unknown = {};

    try {
      fulfillmentPayload =
        text
          ? JSON.parse(
              text,
            )
          : {};
    } catch {
      fulfillmentPayload = {};
    }

    if (
      !fulfillmentResponse.ok
    ) {
      return NextResponse.json(
        {
          error:
            errorFromPayload(
              fulfillmentPayload,
              `OpenSea fulfillment failed (${fulfillmentResponse.status}).`,
            ),
        },
        {
          status:
            fulfillmentResponse.status,
        },
      );
    }

    /*////////////////////////////////////////////////////////////
                      ENCODE TRANSACTION
    ////////////////////////////////////////////////////////////*/

    const execution =
      encodeOpenSeaTransaction(
        fulfillmentPayload,
      );

    /*////////////////////////////////////////////////////////////
                       FINAL VALUE CHECK
    ////////////////////////////////////////////////////////////*/

    let value:
      bigint;

    try {
      value =
        BigInt(
          execution.value,
        );
    } catch {
      return NextResponse.json(
        {
          error:
            "OpenSea returned an invalid ETH value.",
        },
        {
          status:
            502,
        },
      );
    }

    if (
      value <=
      BigInt(0)
    ) {
      return NextResponse.json(
        {
          error:
            "OpenSea returned a zero-value purchase.",
        },
        {
          status:
            502,
        },
      );
    }

    /*////////////////////////////////////////////////////////////
                             SUCCESS
    ////////////////////////////////////////////////////////////*/

    return NextResponse.json(
      {
        ok:
          true,

        chain:
          ROBINHOOD_CHAIN,

        chainId:
          ROBINHOOD_CHAIN_ID,

        /*
         * Return the fresh order hash so the
         * frontend/debug logs can see which
         * order was actually prepared.
         */
        orderHash:
          freshHash,

        previousOrderHash:
          requestedOrderHash ||
          null,

        orderChanged:
          Boolean(
            requestedOrderHash &&
            requestedOrderHash.toLowerCase() !==
              freshHash.toLowerCase(),
          ),

        nft: {
          contract:
            HOODIES_ADDRESS,

          tokenId,
        },

        fulfillment: {
          fulfiller:
            HOODIE_FLOOR_ADDRESS,

          recipient:
            TREASURY_ADDRESS,
        },

        execution: {
          target:
            execution.target,

          value:
            execution.value,

          data:
            execution.data,
        },
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
      "FloorOS fulfill:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare FloorOS purchase.",
      },
      {
        status:
          500,
      },
    );
  }
}