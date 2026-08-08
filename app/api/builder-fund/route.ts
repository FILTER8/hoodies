import { NextResponse } from "next/server";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type RpcResponse<T> = {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: {
    code?: number;
    message?: string;
  };
};

type BlockscoutAddress = {
  hash?: string;
};

type BlockscoutToken = {
  address?: string;
  address_hash?: string;
  type?: string;
};

type BlockscoutTransfer = {
  from?: BlockscoutAddress;
  to?: BlockscoutAddress;
  token?: BlockscoutToken;
  transaction_hash?: string;
  log_index?: number | string;
};

type BlockscoutTransfersResponse = {
  items?: BlockscoutTransfer[];
  next_page_params?: Record<string, string | number | boolean | null> | null;
};

function normalizeAddress(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function hexToNumber(value: string) {
  if (!value || value === "0x") return 0;

  const parsed = Number.parseInt(value, 16);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid RPC number: ${value}`);
  }

  return parsed;
}

async function rpcRequest<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),

    // We handle caching at the API response level.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP error ${response.status}`);
  }

  const payload = (await response.json()) as RpcResponse<T>;

  if (payload.error) {
    throw new Error(
      payload.error.message ||
        `RPC error ${payload.error.code ?? "unknown"}`,
    );
  }

  if (typeof payload.result === "undefined") {
    throw new Error(`${method} returned no RPC result`);
  }

  return payload.result;
}

/**
 * ERC-721:
 *
 * balanceOf(address)
 *
 * Function selector:
 * 0x70a08231
 */
async function getBuilderFundBalance(
  rpcUrl: string,
  collectionAddress: string,
  builderFundAddress: string,
) {
  const encodedAddress = normalizeAddress(builderFundAddress)
    .replace(/^0x/, "")
    .padStart(64, "0");

  const data = `0x70a08231${encodedAddress}`;

  const result = await rpcRequest<string>(rpcUrl, "eth_call", [
    {
      to: collectionAddress,
      data,
    },
    "latest",
  ]);

  return hexToNumber(result);
}

/**
 * Convert the explorer URL from siteConfig into its Blockscout API base.
 *
 * Example:
 *
 * https://robinhoodchain.blockscout.com
 *
 * becomes:
 *
 * https://robinhoodchain.blockscout.com/api/v2
 */
function getBlockscoutApiBase() {
  const explorerUrl = siteConfig.explorerUrl?.replace(/\/$/, "");

  if (!explorerUrl) {
    throw new Error("Explorer URL is not configured");
  }

  return `${explorerUrl}/api/v2`;
}

function appendPaginationParams(
  url: URL,
  params: Record<string, string | number | boolean | null>,
) {
  for (const [key, value] of Object.entries(params)) {
    if (value === null || typeof value === "undefined") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

/**
 * Count all OCH ERC-721 transfers FROM the Builder Fund wallet.
 *
 * Important:
 *
 * This does NOT scan blocks.
 *
 * We ask Blockscout's indexed API specifically for:
 *
 * - this wallet
 * - outgoing transfers only
 * - ERC-721 only
 * - this OCH collection only
 */
async function getBuilderHoodiesSentOut(
  builderFundAddress: string,
  collectionAddress: string,
) {
  const apiBase = getBlockscoutApiBase();

  const normalizedBuilder = normalizeAddress(builderFundAddress);
  const normalizedCollection = normalizeAddress(collectionAddress);

  let sentOut = 0;

  let nextPage:
    | Record<string, string | number | boolean | null>
    | null
    | undefined = undefined;

  /*
   * Safety guard.
   *
   * This is pagination over this wallet's indexed transfer history,
   * NOT blockchain block scanning.
   */
  const MAX_PAGES = 100;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(
      `${apiBase}/addresses/${builderFundAddress}/token-transfers`,
    );

    url.searchParams.set("type", "ERC-721");
    url.searchParams.set("filter", "from");
    url.searchParams.set("token", collectionAddress);

    if (nextPage) {
      appendPaginationParams(url, nextPage);
    }

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },

      /*
       * Transfer history changes only when the fund sends something,
       * so it does not need second-by-second freshness.
       */
      next: {
        revalidate: 60,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Blockscout transfer API error ${response.status}`,
      );
    }

    const payload =
      (await response.json()) as BlockscoutTransfersResponse;

    const items = Array.isArray(payload.items)
      ? payload.items
      : [];

    /*
     * Blockscout should already have applied our filters.
     *
     * We still verify the wallet + collection ourselves so the counter
     * cannot accidentally include another NFT collection.
     */
    for (const transfer of items) {
      const from = normalizeAddress(transfer.from?.hash);

      const tokenAddress = normalizeAddress(
        transfer.token?.address_hash ??
          transfer.token?.address,
      );

      if (
        from === normalizedBuilder &&
        tokenAddress === normalizedCollection
      ) {
        sentOut += 1;
      }
    }

    nextPage = payload.next_page_params;

    if (
      !nextPage ||
      Object.keys(nextPage).length === 0
    ) {
      break;
    }
  }

  return sentOut;
}

export async function GET() {
  try {
    const rpcUrl = siteConfig.rpcUrl;
    const collectionAddress = siteConfig.collectionAddress;
    const builderFundAddress = siteConfig.builderFundAddress;
    const explorerUrl = siteConfig.explorerUrl;

    if (
      !rpcUrl ||
      !collectionAddress ||
      !builderFundAddress ||
      !explorerUrl
    ) {
      return NextResponse.json(
        {
          error: "Builder Fund configuration is incomplete",
          config: {
            hasRpcUrl: Boolean(rpcUrl),
            hasCollectionAddress: Boolean(collectionAddress),
            hasBuilderFundAddress: Boolean(builderFundAddress),
            hasExplorerUrl: Boolean(explorerUrl),
          },
        },
        {
          status: 500,
        },
      );
    }

    /*
     * Run the two independent reads in parallel:
     *
     * 1. Current balance -> RPC
     * 2. Historical outgoing OCH transfers -> Blockscout index
     */
    const [balance, sentOut] = await Promise.all([
      getBuilderFundBalance(
        rpcUrl,
        collectionAddress,
        builderFundAddress,
      ),

      getBuilderHoodiesSentOut(
        builderFundAddress,
        collectionAddress,
      ),
    ]);

    const explorerBase = explorerUrl.replace(/\/$/, "");

    return NextResponse.json(
      {
        balance,
        sentOut,
        wallet: builderFundAddress,
        explorerUrl: `${explorerBase}/address/${builderFundAddress}`,
      },
      {
        headers: {
          /*
           * CDN/Vercel cache:
           *
           * fresh for 60 seconds
           * stale response may be served while refreshing for 5 minutes
           */
          "Cache-Control":
            "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Builder Fund API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Builder Fund data",
      },
      {
        status: 500,
      },
    );
  }
}