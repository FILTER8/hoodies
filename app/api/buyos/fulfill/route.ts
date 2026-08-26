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

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type UnknownRecord =
  Record<string, unknown>;

type FulfillRequest = {
  slug?: string;

  orderHash?: string;

  chain?: string;

  protocolAddress?: string;

  contract?: string;

  tokenId?: string;

  hoodWallet?: string;
};

/*//////////////////////////////////////////////////////////////
                        SEAPORT ABI
//////////////////////////////////////////////////////////////*/

/*
 * Exact Seaport 1.6 function returned by
 * OpenSea on Robinhood Chain.
 *
 * AdvancedOrder:
 *
 * (
 *   OrderParameters parameters,
 *   uint120 numerator,
 *   uint120 denominator,
 *   bytes signature,
 *   bytes extraData
 * )
 *
 * OrderParameters:
 *
 * (
 *   address offerer,
 *   address zone,
 *   OfferItem[] offer,
 *   ConsiderationItem[] consideration,
 *   uint8 orderType,
 *   uint256 startTime,
 *   uint256 endTime,
 *   bytes32 zoneHash,
 *   uint256 salt,
 *   bytes32 conduitKey,
 *   uint256 totalOriginalConsiderationItems
 * )
 *
 * CriteriaResolver:
 *
 * (
 *   uint256 orderIndex,
 *   uint8 side,
 *   uint256 index,
 *   uint256 identifier,
 *   bytes32[] criteriaProof
 * )
 */

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

function errorFromPayload(
  payload: unknown,
  fallback: string,
) {
  const record =
    asRecord(payload);

  return (
    asString(record.detail) ||
    asString(record.error) ||
    asString(record.message) ||
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
    !calldata.startsWith("0x") ||
    !suffix.startsWith("0x")
  ) {
    throw new Error(
      "Invalid calldata suffix returned by OpenSea.",
    );
  }

  /*
   * Append without adding a second 0x.
   *
   * 0xAAAA + 0xBBBB
   * becomes
   * 0xAAAABBBB
   */
  return (
    calldata +
    suffix.slice(2)
  );
}

/*//////////////////////////////////////////////////////////////
                    NORMALIZE SEAPORT OBJECTS
//////////////////////////////////////////////////////////////*/

function normalizeOfferItem(
  value: unknown,
) {
  const item =
    asRecord(value);

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
    asRecord(value);

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
    asRecord(value);

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
    asRecord(value);

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
    asRecord(value);

  const proof =
    Array.isArray(
      resolver.criteriaProof,
    )
      ? resolver.criteriaProof.map(
          (
            entry,
          ) =>
            asString(entry),
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
    ).length === 0
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
    !isAddress(target)
  ) {
    throw new Error(
      "OpenSea returned an invalid Seaport target.",
    );
  }

  /*
   * Some OpenSea responses may eventually provide
   * pre-encoded calldata.
   *
   * Support that first.
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
    return {
      target:
        getAddress(
          target,
        ),

      value,

      data:
        appendCalldataSuffix(
          directData,
          calldataSuffix,
        ),
    };
  }

  /*
   * Robinhood response currently gives:
   *
   * function:
   * fulfillAdvancedOrder(...)
   *
   * input_data:
   * {
   *   advancedOrder,
   *   criteriaResolvers,
   *   fulfillerConduitKey,
   *   recipient
   * }
   */
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

  const rawCriteriaResolvers =
    Array.isArray(
      inputData.criteriaResolvers,
    )
      ? inputData.criteriaResolvers
      : [];

  const criteriaResolvers =
    rawCriteriaResolvers.map(
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
    )
  ) {
    throw new Error(
      "OpenSea returned an invalid NFT recipient.",
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
        ? JSON.parse(text)
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
      process.env
        .OPENSEA_API_KEY;

    if (!apiKey) {
      throw new Error(
        "OPENSEA_API_KEY is not configured.",
      );
    }

    const body =
      (await request.json()) as
        FulfillRequest;

    const slug =
      body.slug?.trim() ||
      "";

    const orderHash =
      body.orderHash?.trim() ||
      "";

    const chain =
      body.chain
        ?.trim()
        .toLowerCase() ||
      "";

    const protocolAddress =
      body.protocolAddress?.trim() ||
      "";

    const contract =
      body.contract?.trim() ||
      "";

    const tokenId =
      body.tokenId?.trim() ||
      "";

    const hoodWallet =
      body.hoodWallet?.trim() ||
      "";

    /*////////////////////////////////////////////////////////////
                         BASIC VALIDATION
    ////////////////////////////////////////////////////////////*/

    if (
      !slug ||
      !orderHash ||
      !chain ||
      !protocolAddress ||
      !contract ||
      !tokenId ||
      !hoodWallet
    ) {
      return NextResponse.json(
        {
          error:
            "Missing BuyOS listing information.",
        },
        {
          status:
            400,
        },
      );
    }

    /*
     * HARD ROBINHOOD CHAIN LOCK.
     */
    if (
      chain !==
      ROBINHOOD_CHAIN
    ) {
      return NextResponse.json(
        {
          error:
            "BuyOS only supports Robinhood Chain.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      !isAddress(
        hoodWallet,
      ) ||
      !isAddress(
        contract,
      ) ||
      !isAddress(
        protocolAddress,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid BuyOS address.",
        },
        {
          status:
            400,
        },
      );
    }

    const normalizedWallet =
      getAddress(
        hoodWallet,
      );

    const normalizedContract =
      getAddress(
        contract,
      );

    const normalizedProtocol =
      getAddress(
        protocolAddress,
      );

    /*////////////////////////////////////////////////////////////
                     REFRESH EXACT LISTING
    ////////////////////////////////////////////////////////////*/

    const bestPayload =
      await openSeaGet(
        `/listings/collection/${encodeURIComponent(
          slug,
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
            "This NFT is no longer listed.",
        },
        {
          status:
            409,
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
            400,
        },
      );
    }

    if (
      freshHash.toLowerCase() !==
      orderHash.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            "The OpenSea listing changed. Reload the floor before buying.",
        },
        {
          status:
            409,
        },
      );
    }

    if (
      freshProtocol &&
      freshProtocol.toLowerCase() !==
        normalizedProtocol.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            "The OpenSea protocol changed. Reload the listing.",
        },
        {
          status:
            409,
        },
      );
    }

    if (
      freshContract &&
      freshContract.toLowerCase() !==
        normalizedContract.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            "NFT contract mismatch.",
        },
        {
          status:
            409,
        },
      );
    }

    if (
      freshTokenId &&
      freshTokenId !==
        tokenId
    ) {
      return NextResponse.json(
        {
          error:
            "NFT token ID mismatch.",
        },
        {
          status:
            409,
        },
      );
    }

    /*////////////////////////////////////////////////////////////
                     GENERATE FULFILLMENT
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
                hash:
                  freshHash,

                chain:
                  ROBINHOOD_CHAIN,

                protocol_address:
                  normalizedProtocol,
              },

              /*
               * CRITICAL:
               *
               * HoodWallet is the fulfiller.
               */
              fulfiller: {
                address:
                  normalizedWallet,
              },

              /*
               * NFT also goes directly to
               * HoodWallet.
               */
              recipient:
                normalizedWallet,

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
          ? JSON.parse(text)
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
                    FINAL SECURITY CHECKS
    ////////////////////////////////////////////////////////////*/

    /*
     * HoodWallet must be the exact recipient
     * OpenSea generated fulfillment for.
     */
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

    const inputData =
      asRecord(
        transaction.input_data,
      );

    const returnedRecipient =
      asString(
        inputData.recipient,
      );

    if (
      !returnedRecipient ||
      !isAddress(
        returnedRecipient,
      ) ||
      getAddress(
        returnedRecipient,
      ) !==
        normalizedWallet
    ) {
      return NextResponse.json(
        {
          error:
            "OpenSea fulfillment recipient is not the selected HoodWallet.",
        },
        {
          status:
            502,
        },
      );
    }

    /*
     * Verify transaction chain again.
     */
    const returnedChain =
      asNumber(
        transaction.chain,
      );

    if (
      returnedChain !==
      ROBINHOOD_CHAIN_ID
    ) {
      return NextResponse.json(
        {
          error:
            "OpenSea fulfillment is not for Robinhood Chain.",
        },
        {
          status:
            502,
        },
      );
    }

    /*
     * Validate native ETH value.
     */
    try {
      const parsedValue =
        BigInt(
          execution.value,
        );

      if (
        parsedValue <
        BigInt(0)
      ) {
        throw new Error();
      }
    } catch {
      return NextResponse.json(
        {
          error:
            "OpenSea returned an invalid native purchase value.",
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

        protocol:
          asString(
            root.protocol,
          ),

        orderHash:
          freshHash,

        nft: {
          contract:
            normalizedContract,

          tokenId,
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
      "BuyOS fulfill:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare OpenSea purchase.",
      },
      {
        status:
          500,
      },
    );
  }
}