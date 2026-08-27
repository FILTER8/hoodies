import {
  AbiCoder,
  Contract,
  Interface,
  JsonRpcProvider,
  getAddress,
  isAddress,
  parseUnits,
} from "ethers";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  siteConfig,
} from "../../../../lib/config";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

const ROBINHOOD_CHAIN_ID =
  4663;

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";

/*
 * Official Uniswap deployments on Robinhood Chain.
 */
const V4_QUOTER =
  "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";

const UNIVERSAL_ROUTER =
  "0x8876789976decbfcbbbe364623c63652db8c0904";

const SWAP_PROXY =
  "0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9";

/*
 * Official hookless OCH / native ETH pool.
 */
const POOL_FEE =
  3000;

const TICK_SPACING =
  60;

const HOOKS =
  ZERO_ADDRESS;

/*
 * Universal Router commands.
 */
const COMMAND_V4_SWAP =
  "0x10";

const COMMAND_SWEEP =
  "0x04";

/*
 * V4 actions.
 *
 * 0x06 = SWAP_EXACT_IN_SINGLE
 * 0x08 = SWAP_EXACT_OUT_SINGLE
 * 0x0b = SETTLE
 * 0x0e = TAKE
 */
const V4_ACTIONS_EXACT_INPUT =
  "0x060b0e";

const V4_ACTIONS_EXACT_OUTPUT =
  "0x080b0e";

/*
 * ActionConstants.OPEN_DELTA == 0.
 *
 * For exact-output swaps this lets SETTLE pay only the
 * actual input debt instead of the full maximum input.
 */
const OPEN_DELTA =
  BigInt(0);

const DEFAULT_SLIPPAGE_BPS =
  100;

const MAX_SLIPPAGE_BPS =
  500;

const QUOTE_TTL_SECONDS =
  120;

/*//////////////////////////////////////////////////////////////
                              ABIS
//////////////////////////////////////////////////////////////*/

const V4_QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",

  "function quoteExactOutputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountIn,uint256 gasEstimate)",
] as const;

const UNIVERSAL_ROUTER_INTERFACE =
  new Interface([
    "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
  ]);

const SWAP_PROXY_INTERFACE =
  new Interface([
    "function execute(address router,address token,uint256 amount,bytes commands,bytes[] inputs,uint256 deadline)",
  ]);

const coder =
  AbiCoder.defaultAbiCoder();

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type SwapDirection =
  | "ETH_TO_OCH"
  | "OCH_TO_ETH";

type SwapMode =
  | "EXACT_INPUT"
  | "EXACT_OUTPUT";

type SwapRequest = {
  direction?: string;

  mode?: string;

  amount?: string;

  recipient?: string;

  slippageBps?:
    number;
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

function normalizeDirection(
  value?: string,
): SwapDirection | null {
  if (
    value ===
      "ETH_TO_OCH" ||
    value ===
      "OCH_TO_ETH"
  ) {
    return value;
  }

  return null;
}

function normalizeMode(
  value?: string,
): SwapMode | null {
  if (
    value ===
      undefined ||
    value ===
      "" ||
    value ===
      "EXACT_INPUT"
  ) {
    return "EXACT_INPUT";
  }

  if (
    value ===
    "EXACT_OUTPUT"
  ) {
    return "EXACT_OUTPUT";
  }

  return null;
}

function normalizeSlippage(
  value:
    number | undefined,
) {
  if (
    value ===
    undefined
  ) {
    return DEFAULT_SLIPPAGE_BPS;
  }

  if (
    !Number.isInteger(
      value,
    ) ||
    value < 1 ||
    value >
      MAX_SLIPPAGE_BPS
  ) {
    throw new Error(
      `Slippage must be between 1 and ${MAX_SLIPPAGE_BPS} bps.`,
    );
  }

  return value;
}

function format18(
  raw: bigint,
) {
  const base =
    BigInt(10) **
    BigInt(18);

  const whole =
    raw /
    base;

  const fraction =
    (
      raw %
      base
    )
      .toString()
      .padStart(
        18,
        "0",
      )
      .slice(
        0,
        8,
      )
      .replace(
        /0+$/,
        "",
      );

  return fraction
    ? `${whole.toString()}.${fraction}`
    : whole.toString();
}

function poolKey(
  och: string,
) {
  return {
    currency0:
      ZERO_ADDRESS,

    currency1:
      och,

    fee:
      POOL_FEE,

    tickSpacing:
      TICK_SPACING,

    hooks:
      HOOKS,
  };
}

/*//////////////////////////////////////////////////////////////
                    EXACT INPUT ENCODING
//////////////////////////////////////////////////////////////*/

function encodeExactInputV4({
  och,
  zeroForOne,
  amountIn,
  amountOutMinimum,
  recipient,
}: {
  och: string;

  zeroForOne:
    boolean;

  amountIn:
    bigint;

  amountOutMinimum:
    bigint;

  recipient:
    string;
}) {
  const swapParams =
    coder.encode(
      [
        "tuple(tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)",
      ],
      [
        {
          poolKey:
            poolKey(
              och,
            ),

          zeroForOne,

          amountIn,

          amountOutMinimum,

          minHopPriceX36:
            BigInt(0),

          hookData:
            "0x",
        },
      ],
    );

  const currencyIn =
    zeroForOne
      ? ZERO_ADDRESS
      : och;

  const currencyOut =
    zeroForOne
      ? och
      : ZERO_ADDRESS;

  const settleParams =
    coder.encode(
      [
        "address",
        "uint256",
        "bool",
      ],
      [
        currencyIn,
        amountIn,
        false,
      ],
    );

  const takeParams =
    coder.encode(
      [
        "address",
        "address",
        "uint256",
      ],
      [
        currencyOut,
        recipient,
        OPEN_DELTA,
      ],
    );

  return coder.encode(
    [
      "bytes",
      "bytes[]",
    ],
    [
      V4_ACTIONS_EXACT_INPUT,
      [
        swapParams,
        settleParams,
        takeParams,
      ],
    ],
  );
}

/*//////////////////////////////////////////////////////////////
                    EXACT OUTPUT ENCODING
//////////////////////////////////////////////////////////////*/

function encodeExactOutputEthToOch({
  och,
  amountOut,
  amountInMaximum,
  recipient,
}: {
  och: string;

  amountOut:
    bigint;

  amountInMaximum:
    bigint;

  recipient:
    string;
}) {
  const swapParams =
    coder.encode(
      [
        "tuple(tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountOut,uint128 amountInMaximum,uint256 minHopPriceX36,bytes hookData)",
      ],
      [
        {
          poolKey:
            poolKey(
              och,
            ),

          /*
           * Native ETH is currency0,
           * OCH is currency1.
           */
          zeroForOne:
            true,

          amountOut,

          amountInMaximum,

          minHopPriceX36:
            BigInt(0),

          hookData:
            "0x",
        },
      ],
    );

  /*
   * Exact output discovers the actual input debt during
   * the swap. OPEN_DELTA makes SETTLE pay that debt only.
   */
  const settleParams =
    coder.encode(
      [
        "address",
        "uint256",
        "bool",
      ],
      [
        ZERO_ADDRESS,
        OPEN_DELTA,
        false,
      ],
    );

  /*
   * Take the complete OCH credit to the connected owner.
   */
  const takeParams =
    coder.encode(
      [
        "address",
        "address",
        "uint256",
      ],
      [
        och,
        recipient,
        OPEN_DELTA,
      ],
    );

  return coder.encode(
    [
      "bytes",
      "bytes[]",
    ],
    [
      V4_ACTIONS_EXACT_OUTPUT,
      [
        swapParams,
        settleParams,
        takeParams,
      ],
    ],
  );
}

/*//////////////////////////////////////////////////////////////
                              POST
//////////////////////////////////////////////////////////////*/

export async function POST(
  request:
    NextRequest,
) {
  try {
    if (
      Number(
        siteConfig.chainId,
      ) !==
      ROBINHOOD_CHAIN_ID
    ) {
      return jsonError(
        "OCH swapping is enabled on Robinhood Chain mainnet only.",
      );
    }

    if (
      !siteConfig.rpcUrl
    ) {
      return jsonError(
        "Robinhood RPC is not configured.",
        500,
      );
    }

    if (
      !siteConfig.ochAddress ||
      !isAddress(
        siteConfig.ochAddress,
      )
    ) {
      return jsonError(
        "OCH contract is not configured.",
        500,
      );
    }

    const body =
      (await request.json()) as
        SwapRequest;

    const direction =
      normalizeDirection(
        body.direction,
      );

    if (!direction) {
      return jsonError(
        "Invalid swap direction.",
      );
    }

    const mode =
      normalizeMode(
        body.mode,
      );

    if (!mode) {
      return jsonError(
        "Invalid swap mode.",
      );
    }

    /*
     * HoodWallet activation uses exact-output ETH -> OCH.
     * Token-input exact-output is intentionally not exposed
     * by this API yet.
     */
    if (
      mode ===
        "EXACT_OUTPUT" &&
      direction !==
        "ETH_TO_OCH"
    ) {
      return jsonError(
        "Exact-output mode currently supports ETH to OCH only.",
      );
    }

    const recipient =
      body.recipient
        ?.trim() ||
      "";

    if (
      !isAddress(
        recipient,
      )
    ) {
      return jsonError(
        "A valid recipient address is required.",
      );
    }

    const amountText =
      body.amount
        ?.trim() ||
      "";

    if (!amountText) {
      return jsonError(
        "Enter an amount.",
      );
    }

    let requestedAmount:
      bigint;

    try {
      requestedAmount =
        parseUnits(
          amountText,
          18,
        );
    } catch {
      return jsonError(
        "Invalid amount.",
      );
    }

    if (
      requestedAmount <=
      BigInt(0)
    ) {
      return jsonError(
        "Amount must be greater than zero.",
      );
    }

    const slippageBps =
      normalizeSlippage(
        body.slippageBps,
      );

    const och =
      getAddress(
        siteConfig.ochAddress,
      );

    const normalizedRecipient =
      getAddress(
        recipient,
      );

    const provider =
      new JsonRpcProvider(
        siteConfig.rpcUrl,
        ROBINHOOD_CHAIN_ID,
        {
          staticNetwork:
            true,
        },
      );

    const quoter =
      new Contract(
        V4_QUOTER,
        V4_QUOTER_ABI,
        provider,
      );

    const deadline =
      Math.floor(
        Date.now() /
          1000,
      ) +
      QUOTE_TTL_SECONDS;

    /*////////////////////////////////////////////////////////////
                         EXACT OUTPUT
    ////////////////////////////////////////////////////////////*/

    if (
      mode ===
      "EXACT_OUTPUT"
    ) {
      const amountOut =
        requestedAmount;

      const quoteResult =
        await quoter
          .quoteExactOutputSingle
          .staticCall({
            poolKey:
              poolKey(
                och,
              ),

            zeroForOne:
              true,

            exactAmount:
              amountOut,

            hookData:
              "0x",
          });

      const quotedAmountIn =
        BigInt(
          quoteResult[0],
        );

      if (
        quotedAmountIn <=
        BigInt(0)
      ) {
        return jsonError(
          "Uniswap returned an empty quote.",
          502,
        );
      }

      /*
       * Round upward by one wei after applying slippage so the
       * maximum cannot accidentally round below the protection.
       */
      const numerator =
        quotedAmountIn *
        BigInt(
          10_000 +
            slippageBps,
        );

      const amountInMaximum =
        (
          numerator +
          BigInt(9_999)
        ) /
        BigInt(10_000);

      const v4Input =
        encodeExactOutputEthToOch({
          och,
          amountOut,
          amountInMaximum,
          recipient:
            normalizedRecipient,
        });

      /*
       * Exact-output sends max ETH as msg.value. The V4 action
       * settles only the real input debt. SWEEP then returns any
       * unused native ETH to the user in the same transaction.
       */
      const sweepInput =
        coder.encode(
          [
            "address",
            "address",
            "uint256",
          ],
          [
            ZERO_ADDRESS,
            normalizedRecipient,
            BigInt(0),
          ],
        );

      const commands =
        `${COMMAND_V4_SWAP}${COMMAND_SWEEP.slice(2)}`;

      const routerData =
        UNIVERSAL_ROUTER_INTERFACE
          .encodeFunctionData(
            "execute",
            [
              commands,
              [
                v4Input,
                sweepInput,
              ],
              deadline,
            ],
          );

      return NextResponse.json(
        {
          ok:
            true,

          chainId:
            ROBINHOOD_CHAIN_ID,

          mode,

          direction,

          amountOut:
            amountOut.toString(),

          amountOutFormatted:
            format18(
              amountOut,
            ),

          quotedAmountIn:
            quotedAmountIn.toString(),

          quotedAmountInFormatted:
            format18(
              quotedAmountIn,
            ),

          amountInMaximum:
            amountInMaximum.toString(),

          amountInMaximumFormatted:
            format18(
              amountInMaximum,
            ),

          slippageBps,

          expiresAt:
            deadline,

          pool: {
            fee:
              POOL_FEE,

            tickSpacing:
              TICK_SPACING,

            hooks:
              HOOKS,
          },

          approval: {
            required:
              false,

            token:
              null,

            spender:
              null,
          },

          execution: {
            to:
              UNIVERSAL_ROUTER,

            data:
              routerData,

            value:
              amountInMaximum.toString(),
          },
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
                          EXACT INPUT
    ////////////////////////////////////////////////////////////*/

    const amountIn =
      requestedAmount;

    const zeroForOne =
      direction ===
      "ETH_TO_OCH";

    const quoteResult =
      await quoter
        .quoteExactInputSingle
        .staticCall({
          poolKey:
            poolKey(
              och,
            ),

          zeroForOne,

          exactAmount:
            amountIn,

          hookData:
            "0x",
        });

    const amountOut =
      BigInt(
        quoteResult[0],
      );

    if (
      amountOut <=
      BigInt(0)
    ) {
      return jsonError(
        "Uniswap returned an empty quote.",
        502,
      );
    }

    const amountOutMinimum =
      (
        amountOut *
        BigInt(
          10_000 -
            slippageBps,
        )
      ) /
      BigInt(10_000);

    const v4Input =
      encodeExactInputV4({
        och,
        zeroForOne,
        amountIn,
        amountOutMinimum,
        recipient:
          normalizedRecipient,
      });

    const routerData =
      UNIVERSAL_ROUTER_INTERFACE
        .encodeFunctionData(
          "execute",
          [
            COMMAND_V4_SWAP,
            [
              v4Input,
            ],
            deadline,
          ],
        );

    const common = {
      ok:
        true,

      chainId:
        ROBINHOOD_CHAIN_ID,

      mode,

      direction,

      amountIn:
        amountIn.toString(),

      amountInFormatted:
        format18(
          amountIn,
        ),

      amountOut:
        amountOut.toString(),

      amountOutFormatted:
        format18(
          amountOut,
        ),

      amountOutMinimum:
        amountOutMinimum.toString(),

      amountOutMinimumFormatted:
        format18(
          amountOutMinimum,
        ),

      slippageBps,

      expiresAt:
        deadline,

      pool: {
        fee:
          POOL_FEE,

        tickSpacing:
          TICK_SPACING,

        hooks:
          HOOKS,
      },
    };

    if (
      direction ===
      "ETH_TO_OCH"
    ) {
      return NextResponse.json(
        {
          ...common,

          approval: {
            required:
              false,

            token:
              null,

            spender:
              null,
          },

          execution: {
            to:
              UNIVERSAL_ROUTER,

            data:
              routerData,

            value:
              amountIn.toString(),
          },
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    const proxyData =
      SWAP_PROXY_INTERFACE
        .encodeFunctionData(
          "execute",
          [
            UNIVERSAL_ROUTER,
            och,
            amountIn,
            COMMAND_V4_SWAP,
            [
              v4Input,
            ],
            deadline,
          ],
        );

    return NextResponse.json(
      {
        ...common,

        approval: {
          required:
            true,

          token:
            och,

          spender:
            SWAP_PROXY,
        },

        execution: {
          to:
            SWAP_PROXY,

          data:
            proxyData,

          value:
            "0",
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
      "OCH swap quote failed:",
      error,
    );

    return jsonError(
      error instanceof
      Error
        ? error.message
        : "Unable to prepare OCH swap.",
      500,
    );
  }
}
