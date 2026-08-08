import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "ethers";
import { siteConfig } from "../../../../lib/config";

export const dynamic = "force-dynamic";

type BlockscoutTokenBalance = {
  value?: string;
  token?: {
    address?: string;
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
};

function formatTokenBalance(
  value: bigint,
  decimals = 18,
  maximumDecimals = 6,
) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;

  const base =
    BigInt(10) ** BigInt(decimals);

  const whole =
    absolute / base;

  const remainder =
    absolute % base;

  if (
    remainder === BigInt(0) ||
    maximumDecimals <= 0
  ) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }

  const fraction = remainder
    .toString()
    .padStart(decimals, "0")
    .slice(0, maximumDecimals)
    .replace(/0+$/, "");

  return fraction
    ? `${negative ? "-" : ""}${whole.toString()}.${fraction}`
    : `${negative ? "-" : ""}${whole.toString()}`;
}

function normalizeTokenBalances(
  payload: unknown,
): AssetResponse[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return (payload as BlockscoutTokenBalance[])
    .filter(
      (item) =>
        item.token?.type === "ERC-20",
    )
    .map(
      (
        item,
      ): AssetResponse | null => {
        let balanceRaw: bigint;

        try {
          balanceRaw = BigInt(
            item.value ?? "0",
          );
        } catch {
          return null;
        }

        if (
          balanceRaw <= BigInt(0)
        ) {
          return null;
        }

        const parsedDecimals =
          Number(
            item.token?.decimals ?? 18,
          );

        const decimals =
          Number.isInteger(
            parsedDecimals,
          ) &&
          parsedDecimals >= 0 &&
          parsedDecimals <= 255
            ? parsedDecimals
            : 18;

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

          contract:
            item.token?.address,

          decimals,

          kind:
            "erc20",
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
      (left, right) =>
        left.symbol.localeCompare(
          right.symbol,
        ),
    );
}

async function fetchBlockscoutBalances(
  walletAddress: string,
) {
  const explorerBase =
    siteConfig.explorerUrl.replace(
      /\/$/,
      "",
    );

  if (!explorerBase) {
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
    await fetch(url, {
      headers: {
        accept:
          "application/json",
      },

      /*
       * Cache each HoodWallet's token
       * balances for 5 minutes.
       *
       * This dramatically reduces
       * repeated Blockscout traffic for
       * large collectors.
       */
      next: {
        revalidate: 300,
      },
    });

  if (!response.ok) {
    throw new Error(
      `Blockscout token balance request failed (${response.status}).`,
    );
  }

  return response.json() as Promise<unknown>;
}

export async function GET(
  request: NextRequest,
) {
  const rawAddress =
    request.nextUrl.searchParams
      .get("address")
      ?.trim() || "";

  if (
    !rawAddress ||
    !isAddress(rawAddress)
  ) {
    return NextResponse.json(
      {
        error:
          "A valid HoodWallet address is required.",

        assets: [],
      },
      {
        status: 400,
      },
    );
  }

  const walletAddress =
    getAddress(rawAddress);

  try {
    const payload =
      await fetchBlockscoutBalances(
        walletAddress,
      );

    const assets =
      normalizeTokenBalances(
        payload,
      );

    return NextResponse.json(
      {
        wallet:
          walletAddress,

        assets,
      },
      {
        headers: {
          /*
           * Cache this API response
           * downstream for 5 minutes.
           *
           * Stale data may be served for
           * up to 10 additional minutes
           * while refreshing.
           */
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    console.error(
      `HoodWallet asset discovery failed for ${walletAddress}:`,
      error,
    );

    /*
     * ERC-20 discovery is supplementary.
     *
     * A temporary Blockscout failure
     * should never prevent the HoodWallet
     * page itself from loading.
     */
    return NextResponse.json(
      {
        wallet:
          walletAddress,

        assets: [],

        warning:
          error instanceof Error
            ? error.message
            : "Token balances are temporarily unavailable.",
      },
      {
        status: 200,

        headers: {
          /*
           * Do not cache failed lookups.
           *
           * The next request should be
           * allowed to retry immediately.
           */
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}