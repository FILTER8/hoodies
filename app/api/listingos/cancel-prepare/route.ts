import { NextRequest, NextResponse } from 'next/server';
import { Contract, getAddress } from 'ethers';
import {
  CHAIN, OPENSEA_API, SEAPORT_ABI, checkOrder, cleanParams,
  components, hoodInfo, jsonError, requireOpenSeaKey, seaportIface, seaportAddress,
} from '../../../../lib/listingos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Dict = Record<string, unknown>;
const isObj = (v: unknown): v is Dict => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const hex32 = (v: unknown): v is string => typeof v === 'string' && /^0x[\da-fA-F]{64}$/.test(v);
function normalizeAddress(v: unknown, label = 'address'): string {
  if (isObj(v)) return normalizeAddress(v.value, label);
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing ${label}`);
  try { return getAddress(v); } catch { throw new Error(`Invalid ${label}`); }
}
function orderProtocol(record: Dict, fallback: unknown): string {
  // OpenSea's account-listings response often omits protocol_address.
  // The contract is still verified by getOrderHash before any transaction.
  return normalizeAddress(record.protocol_address ?? fallback ?? seaportAddress(), 'Seaport protocol address');
}
function getHash(v: Dict): string {
  return String(v.order_hash ?? v.orderHash ?? '');
}
function extractListing(body: unknown): Dict | null {
  if (!isObj(body)) return null;
  if (isObj(body.order)) return body.order;
  if (isObj(body.listing)) return body.listing;
  if (Array.isArray(body.orders) && isObj(body.orders[0])) return body.orders[0];
  return body;
}

/** Cancel from an active OpenSea order hash, or the old saved JSON backup.
 * The server independently fetches marketplace order parameters, recomputes
 * the Seaport hash and verifies that the NFT is offered by this HoodWallet.
 */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!isObj(body)) throw new Error('Invalid request');
    const hoodieId = String(body.hoodieId ?? '');
    if (!/^\d+$/.test(hoodieId)) throw new Error('Invalid Hoodie ID');
    if (!hex32(body.orderHash)) throw new Error('Missing valid order hash');
    const hash = body.orderHash;
    const { wallet, p } = await hoodInfo(hoodieId);
    let record: Dict;

    if (body.parameters) {
      // Preserve backwards compatibility with imported order backups.
      record = body;
    } else {
      // The order must currently belong to this exact HoodWallet account.
      const query = new URLSearchParams({limit: '50', sort_by:'START_TIME',sort_direction:'desc'});
      const res = await fetch(`${OPENSEA_API}/account/${encodeURIComponent(wallet)}/listings?${query}`, {
        headers: {'x-api-key': requireOpenSeaKey(), accept:'application/json'},
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`OpenSea account listings failed (HTTP ${res.status}): ${raw.slice(0,240)}`);
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { throw new Error('OpenSea account listings returned invalid JSON'); }
      const listings = isObj(payload) && Array.isArray(payload.listings) ? payload.listings : [];
      const match = listings.find((v: unknown) => isObj(v) && getHash(v).toLowerCase() === hash.toLowerCase());
      if (!isObj(match)) throw new Error('Order is not in the first 50 active OpenSea listings for this HoodWallet. Refresh or use an order backup.');
      if (String(match.chain).toLowerCase() !== CHAIN) throw new Error('Order is not on Robinhood Chain');
      if (match.maker && normalizeAddress(match.maker) !== wallet) throw new Error('OpenSea maker does not match HoodWallet');
      record = match;

      const existing = isObj(record.protocol_data) ? record.protocol_data : null;
      if (!existing || !isObj(existing.parameters)) {
        const protocol = orderProtocol(record, body.seaport);
        const detailUrl = `${OPENSEA_API}/orders/chain/${CHAIN}/protocol/${protocol}/${hash}`;
        const detail = await fetch(detailUrl, {
          headers: {'x-api-key': requireOpenSeaKey(), accept:'application/json'},
          cache:'no-store', signal: AbortSignal.timeout(15000),
        });
        const detailRaw = await detail.text();
        if (!detail.ok) throw new Error(`OpenSea order lookup failed (HTTP ${detail.status}): ${detailRaw.slice(0,240)}`);
        let info: unknown;
        try { info = JSON.parse(detailRaw); } catch { throw new Error('OpenSea order lookup returned invalid JSON'); }
        const parsed = extractListing(info);
        if (!parsed || getHash(parsed).toLowerCase() !== hash.toLowerCase()) throw new Error('OpenSea order lookup returned a different order');
        record = {...match, ...parsed};
      }
    }

    const protocolData = isObj(record.protocol_data) ? record.protocol_data : null;
    const rawParams = body.parameters ?? protocolData?.parameters;
    if (!isObj(rawParams)) throw new Error('OpenSea did not provide order parameters needed to cancel');
    const params = cleanParams({
      ...rawParams,
      totalOriginalConsiderationItems: rawParams.totalOriginalConsiderationItems ??
        (Array.isArray(rawParams.consideration) ? rawParams.consideration.length : 0),
    });
    const offer = params.offer[0];
    if (!offer || offer.itemType !== 2) throw new Error('Cancellation only supports ERC-721 listings');
    checkOrder(params, wallet, offer.token, offer.identifierOrCriteria);
    const seaportContract = orderProtocol(record, body.seaport);
    const counter = String(body.counter ?? protocolData?.counter ?? record.counter ?? '');
    // Some OpenSea order results omit counter even though Seaport commits to it.
    const seaport = new Contract(seaportContract, SEAPORT_ABI, p);
    const effectiveCounter = /^\d+$/.test(counter) ? counter : String(await seaport.getCounter(wallet));
    const order = components(params, effectiveCounter);
    const computedHash: string = await seaport.getOrderHash(order);
    if (computedHash.toLowerCase() !== hash.toLowerCase()) throw new Error('Seaport order hash mismatch. Cannot safely cancel this listing.');
    const status = await seaport.getOrderStatus(computedHash);
    if (status.isCancelled) throw new Error('Listing already cancelled');
    if (BigInt(status.totalFilled) > BigInt(0)) throw new Error('Listing already filled or partially filled');
    return NextResponse.json({
      ok: true, orderHash: computedHash,
      execution: {
        target: seaportContract, value: '0',
        data: seaportIface.encodeFunctionData('cancel', [[order]]),
      },
    });
  } catch (error) {
    return NextResponse.json({ok:false,error:jsonError(error)}, {status:400});
  }
}
