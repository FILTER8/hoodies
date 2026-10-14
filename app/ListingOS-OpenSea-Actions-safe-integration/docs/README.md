# ListingOS — OpenSea Actions API integration (safety-first candidate)

## What changed

Instead of creating OpenSea fees/zone/conduit by guessing, `prepare` now calls the documented `POST /api/v2/listings/actions` using `OPENSEA_API_KEY` (server-side only) and the selected active Hoodie-bound HoodWallet as seller.

It requires the API response to include recognizable Seaport `OrderComponents` EIP-712 signing data and checks the chain, offerer, selected NFT, fixed ETH total, signed-zone restriction, marketplace fee, counter, native payment recipients and correct conduit operator. Unknown response shapes fail closed without signing or transacting. The owner signs as EOA, with on-chain ERC-1271 verification; NFT approval goes through HoodWallet.execute when necessary. Submission uses `POST /api/v2/orders/robinhood/seaport/listings`, then independently checks whether it appears ACTIVE.

## Merge these files into `web/` (do not delete the parent folders)

- `app/hoodos/listingos/page.tsx`
- `app/api/listingos/prepare/route.ts`
- `app/api/listingos/check-signature/route.ts`
- `app/api/listingos/submit/route.ts`
- `app/api/listingos/cancel-prepare/route.ts`
- `lib/listingos.ts`
- `lib/listingos-actions.ts` (NEW)

Keep `lib/listingos-signing.ts`, `lib/config.ts`, API `orders/route.ts`, BuyOS and HoodWallet unchanged. `OPENSEA_API_KEY` must remain server-only.

## Validation before production

The supplied code has passed TypeScript **syntax** checks only. There is no local Next.js project/dependency tree or OPENSEA_API_KEY to perform a full build, a live actions call, or a live Robinhood-chain sale. The public OpenSea reference specifies the request field names but does not show a fully populated example `steps` response; the strict action adapter might require changes after observing a genuine response. Accordingly, this ZIP is **not certified production-ready**. Do not deploy to mainnet as an unattended sale process until you complete the steps below.

1. Back up your current ListingOS files. Install these changes into your existing project.
2. Run `npm run build` and fix any type or lint failures.
3. Choose a lower-value test NFT you own. Click *Prepare listing* first: this only performs API + onchain reads. If it reports 'no recognizable Seaport OrderComponents', copy the redacted JSON shape from a local server debug session so adapter can be tailored to the actual OpenSea actions response. Never log or expose OPENSEA_API_KEY.
4. Review `sellerWei`, combined fees and recipient addresses. Ensure the requested price currency is ETH; Robinhood collections can default to USDG.
5. Confirm NFT approval (if required), EOA signature, ERC-1271 check and OpenSea acceptance. Validate an actual purchase on a test item from a separate account; some ERC721C collections may reject transfer due to operator restrictions.
6. Check and cancel your old Seaport-validated order separately. These code changes do **not** cancel earlier orders.

## Remaining caveats

- OpenSea `listings/actions` might use a different shape for `price` or sign actions; the preparation API returns exact errors safely before sending any transaction. The live response is needed to confirm.
- Duration: the official actions request used here exposes no expiry field in publicly visible documented body. OpenSea chooses endTime. The UI's `days` field is used only to validate the selection, not to force the expiry. Review the returned `parameters.endTime`.
- Only ERC721 / 1 token / fixed native ETH is supported. No bulk listings, ERC1155, private takers, or arbitrary transaction execution.
- It requires the EIP712 domain version Seaport 1.6, matching existing project signing code, and refuses a different version.
- Existing saved backups created by old versions might lack `seaport`. Preserve them and cancel by consulting the original corresponding contract address; do not invent one.
- Server API `prepare` and `submit` should be rate-limited/authenticated at the edge before general public launch to protect the OpenSea API quota.
