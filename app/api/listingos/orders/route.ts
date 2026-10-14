import { NextRequest, NextResponse } from "next/server";
import {
  OPENSEA_API,
  hoodInfo,
  jsonError,
  requireOpenSeaKey,
} from "../../../../lib/listingos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenSeaListing = {
  chain?: string;
  maker?: string;
  status?: string;
  order_hash?: string;
  [key: string]: unknown;
};

type OpenSeaListingsResponse = {
  listings?: OpenSeaListing[];
  next?: string | null;
  errors?: unknown;
  [key: string]: unknown;
};

/**
 * GET /api/listingos/orders?hoodieId=336
 *
 * Returns active Robinhood Chain OpenSea listings created by the selected
 * HoodWallet. Read-only: never submits, signs, or cancels a Seaport order.
 *
 * Response keeps the original ListingOS frontend contract:
 *   { ok: true, wallet: string, orders: { listings: [], next: null } }
 */
export async function GET(req: NextRequest) {
  try {
    const hoodieId = req.nextUrl.searchParams.get("hoodieId")?.trim();
    if (!hoodieId || !/^\d+$/.test(hoodieId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid or missing hoodieId" },
        { status: 400 },
      );
    }

    const { wallet } = await hoodInfo(hoodieId);
    const query = new URLSearchParams({
      limit: "50",
      sort_by: "START_TIME",
      sort_direction: "desc",
    });

    const response = await fetch(
      `${OPENSEA_API}/account/${encodeURIComponent(wallet)}/listings?${query}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": requireOpenSeaKey(),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );

    const raw = await response.text();
    let data: OpenSeaListingsResponse;
    try {
      data = JSON.parse(raw) as OpenSeaListingsResponse;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: `OpenSea returned a non-JSON response (HTTP ${response.status})`,
          details: raw.slice(0, 500),
        },
        { status: 502 },
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `OpenSea account listings request failed (HTTP ${response.status})`,
          details: data,
        },
        { status: 502 },
      );
    }

    if (!Array.isArray(data.listings)) {
      return NextResponse.json(
        { ok: false, error: "OpenSea returned an unexpected listings response" },
        { status: 502 },
      );
    }

    const robinhoodListings = data.listings.filter(
      (listing) =>
        listing &&
        typeof listing === "object" &&
        String(listing.chain ?? "").toLowerCase() === "robinhood" &&
        (!listing.maker ||
          listing.maker.toLowerCase() === wallet.toLowerCase()),
    );

    return NextResponse.json({
      ok: true,
      wallet,
      orders: {
        listings: robinhoodListings,
        next: data.next ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: jsonError(error) },
      { status: 400 },
    );
  }
}
