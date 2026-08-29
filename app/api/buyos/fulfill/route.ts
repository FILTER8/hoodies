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

    `function fulfillBasicOrder_efficient_6GL6yc(
      (
        address considerationToken,
        uint256 considerationIdentifier,
        uint256 considerationAmount,
        address offerer,
        address zone,
        address offerToken,
        uint256 offerIdentifier,
        uint256 offerAmount,
        uint8 basicOrderType,
        uint256 startTime,
        uint256 endTime,
        bytes32 zoneHash,
        uint256 salt,
        bytes32 offererConduitKey,
        bytes32 fulfillerConduitKey,
        uint256 totalOriginalAdditionalRecipients,
        (
          uint256 amount,
          address recipient
        )[] additionalRecipients,
        bytes signature
      ) parameters
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


function normalizeAdditionalRecipient(
  value: unknown,
) {
  const item =
    asRecord(value);

  return {
    amount:
      asString(
        item.amount,
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

function normalizeBasicOrderParameters(
  value: unknown,
) {
  const parameters =
    asRecord(value);

  const rawAdditionalRecipients =
    Array.isArray(
      parameters.additionalRecipients,
    )
      ? parameters.additionalRecipients
      : [];

  return {
    considerationToken:
      getAddress(
        asString(
          parameters.considerationToken,
        ),
      ),

    considerationIdentifier:
      asString(
        parameters.considerationIdentifier,
        "0",
      ),

    considerationAmount:
      asString(
        parameters.considerationAmount,
        "0",
      ),

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

    offerToken:
      getAddress(
        asString(
          parameters.offerToken,
        ),
      ),

    offerIdentifier:
      asString(
        parameters.offerIdentifier,
        "0",
      ),

    offerAmount:
      asString(
        parameters.offerAmount,
        "0",
      ),

    basicOrderType:
      asNumber(
        parameters.basicOrderType,
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

    offererConduitKey:
      asString(
        parameters.offererConduitKey,
      ),

    fulfillerConduitKey:
      asString(
        parameters.fulfillerConduitKey,
      ),

    totalOriginalAdditionalRecipients:
      asString(
        parameters.totalOriginalAdditionalRecipients,
        String(
          rawAdditionalRecipients.length,
        ),
      ),

    additionalRecipients:
      rawAdditionalRecipients.map(
        normalizeAdditionalRecipient,
      ),

    signature:
      asString(
        parameters.signature,
      ),
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

  const directData =
    asString(
      transaction.data,
    );

  if (
    directData.startsWith(
      "0x",
    ) &&
    directData.length >= 10
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

      fulfillmentType:
        "direct" as const,
    };
  }

  const inputData =
    asRecord(
      transaction.input_data,
    );

  if (
    functionSignature.startsWith(
      "fulfillBasicOrder_efficient_6GL6yc(",
    )
  ) {
    const parametersRecord =
      asRecord(
        inputData.parameters,
      );

    const basicOrderParametersRecord =
      asRecord(
        inputData.basicOrderParameters,
      );

    const rawParameters =
      Object.keys(
        parametersRecord,
      ).length > 0
        ? parametersRecord
        : Object.keys(
            basicOrderParametersRecord,
          ).length > 0
          ? basicOrderParametersRecord
          : inputData;

    const parameters =
      normalizeBasicOrderParameters(
        rawParameters,
      );

    const encoded =
      SEAPORT_INTERFACE.encodeFunctionData(
        "fulfillBasicOrder_efficient_6GL6yc",
        [
          parameters,
        ],
      );

    return {
      target:
        getAddress(
          target,
        ),

      value,

      data:
        appendCalldataSuffix(
          encoded,
          calldataSuffix,
        ),

      fulfillmentType:
        "basic" as const,

      offeredToken:
        parameters.offerToken,

      offeredIdentifier:
        parameters.offerIdentifier,
    };
  }

  if (
    functionSignature.startsWith(
      "fulfillAdvancedOrder(",
    )
  ) {
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

    const normalizedRecipient =
      getAddress(
        recipient,
      );

    const encoded =
      SEAPORT_INTERFACE.encodeFunctionData(
        "fulfillAdvancedOrder",
        [
          advancedOrder,
          criteriaResolvers,
          fulfillerConduitKey,
          normalizedRecipient,
        ],
      );

    return {
      target:
        getAddress(
          target,
        ),

      value,

      data:
        appendCalldataSuffix(
          encoded,
          calldataSuffix,
        ),

      fulfillmentType:
        "advanced" as const,

      recipient:
        normalizedRecipient,
    };
  }

  throw new Error(
    `Unsupported OpenSea fulfillment function: ${
      functionSignature ||
      "unknown"
    }.`,
  );
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

    /*
     * Refresh the exact order selected by the user.
     *
     * This is more reliable than asking OpenSea for the
     * current best listing for the NFT, because the collection
     * listing endpoint already gave BuyOS the exact order hash.
     */
    const orderPayload =
      await openSeaGet(
        `/orders/chain/${encodeURIComponent(
          ROBINHOOD_CHAIN,
        )}/protocol/${encodeURIComponent(
          normalizedProtocol,
        )}/${encodeURIComponent(
          orderHash,
        )}`,
      );

    const orderRoot =
      asRecord(
        orderPayload,
      );

    const nestedOrder =
      asRecord(
        orderRoot.order,
      );

    const freshOrder =
      Object.keys(
        nestedOrder,
      ).length > 0
        ? nestedOrder
        : orderRoot;

    const freshHash =
      asString(
        freshOrder.order_hash,
      ) ||
      asString(
        freshOrder.orderHash,
      ) ||
      orderHash;

    const freshChain =
      asString(
        freshOrder.chain,
        ROBINHOOD_CHAIN,
      ).toLowerCase();

    const freshProtocol =
      asString(
        freshOrder.protocol_address,
      ) ||
      normalizedProtocol;

    const freshStatus =
      asString(
        freshOrder.status,
      ).toUpperCase();

    const freshAsset =
      asRecord(
        freshOrder.asset,
      );

    const freshContract =
      asString(
        freshAsset.contract,
      );

    const freshTokenId =
      asString(
        freshAsset.identifier,
      );

    /*
     * OpenSea order responses do not always expose the asset
     * in the same convenience shape as listing responses.
     * Fall back to the Seaport order parameters when present.
     */
    const orderParameters =
      asRecord(
        freshOrder.parameters,
      );

    const rawOffer =
      Array.isArray(
        orderParameters.offer,
      )
        ? orderParameters.offer
        : [];

    const firstOffer =
      rawOffer.length > 0
        ? asRecord(
            rawOffer[0],
          )
        : {};

    const refreshedContract =
      freshContract ||
      asString(
        firstOffer.token,
      );

    const refreshedTokenId =
      freshTokenId ||
      asString(
        firstOffer.identifierOrCriteria,
      );

    if (
      freshStatus &&
      freshStatus !==
        "ACTIVE"
    ) {
      return NextResponse.json(
        {
          error:
            "This OpenSea listing is no longer active.",
        },
        {
          status:
            409,
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
            "OpenSea returned a different listing order.",
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
      refreshedContract &&
      refreshedContract.toLowerCase() !==
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
      refreshedTokenId &&
      refreshedTokenId !==
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

    if (
      execution.fulfillmentType ===
      "advanced"
    ) {
      if (
        !execution.recipient ||
        execution.recipient !==
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
    }

    if (
      execution.fulfillmentType ===
      "basic"
    ) {
      if (
        execution.offeredToken.toLowerCase() !==
          normalizedContract.toLowerCase() ||
        execution.offeredIdentifier !==
          tokenId
      ) {
        return NextResponse.json(
          {
            error:
              "OpenSea basic-order NFT does not match the selected listing.",
          },
          {
            status:
              502,
          },
        );
      }
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