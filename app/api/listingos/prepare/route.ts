import { NextRequest,NextResponse } from 'next/server';
import { getAddress } from 'ethers';
import { CHAIN, OPENSEA_API, getNftOwner, hoodInfo, jsonError, parsePrice, requireOpenSeaKey } from '../../../../lib/listingos';
import { interpretActions } from '../../../../lib/listingos-actions';
export const runtime='nodejs';

export async function POST(req:NextRequest){
 try{
  const b=await req.json();
  const hoodieId=String(b.hoodieId),tokenId=String(b.tokenId),contract=getAddress(String(b.contract));
  if(!/^\d+$/.test(hoodieId)||!/^\d+$/.test(tokenId))throw Error('Invalid Hoodie/NFT token ID');
  const priceEth=String(b.priceEth).trim();
  const price=parsePrice(priceEth);
  const days=Number(b.days||7);
  if(!Number.isInteger(days)||days<1||days>30)throw Error('Duration must be 1-30 days');
  const {wallet,p}=await hoodInfo(hoodieId);
  if(getAddress(await getNftOwner(p,contract,tokenId))!==wallet)throw Error('NFT not owned by the selected HoodWallet');
  // Documented API schema: seller address + list of chain/contract/token_id/quantity/price items.
  // On Robinhood we explicitly ask for ETH (not the chain's default USDG).
  // The Actions endpoint interprets price.amount in ETH units, not wei.
  // Keep price (wei) for exact validation of the returned Seaport order.
  // Never convert the decimal ETH amount to wei before sending to OpenSea.
  const input={address:wallet,items:[{
    chain:CHAIN,contract,token_id:tokenId,quantity:1,
    price:{currency:'0x0000000000000000000000000000000000000000',amount:priceEth}
  }],use_creator_fee:true};
  const response=await fetch(`${OPENSEA_API.replace(/\/$/,'')}/listings/actions`,{method:'POST',headers:{'x-api-key':requireOpenSeaKey(),'content-type':'application/json',accept:'application/json'},body:JSON.stringify(input),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const raw=await response.text();let data:unknown;
  try{data=JSON.parse(raw);}catch{data={raw:raw.slice(0,1200)};}
  if(!response.ok)return NextResponse.json({ok:false,error:`OpenSea listing actions returned HTTP ${response.status}`,details:data},{status:422});
  const result=await interpretActions(data,{wallet,contract,tokenId,price,provider:p});
  return NextResponse.json({ok:true,hoodieId,wallet,tokenId,contract,priceWei:price.toString(),royaltyWei:result.fee.toString(),royaltyRecipient:'See marketplace and creator fee recipients below',sellerWei:result.seller.toString(),seaport:result.seaport,orderHash:result.orderHash,counter:result.counter,parameters:result.params,approval:result.approval,marketplaceFeeAndRoyaltyWei:result.fee.toString(),feeRecipients:result.params.consideration.filter(c=>c.recipient?.toLowerCase()!==wallet.toLowerCase()).map(c=>({recipient:c.recipient,amountWei:c.startAmount})),conduit:result.operator});
 }catch(e){return NextResponse.json({ok:false,error:jsonError(e)},{status:400});}
}
