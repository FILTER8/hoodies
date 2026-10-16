import { NextRequest,NextResponse } from 'next/server';
import { Contract, ZeroAddress, getAddress } from 'ethers';
import { CHAIN, OPENSEA_API, getNftOwner, hoodInfo, jsonError, currencyAddress, parseListingPrice, requireOpenSeaKey } from '../../../../lib/listingos';
import { interpretActions } from '../../../../lib/listingos-actions';
export const runtime='nodejs';

export async function POST(req:NextRequest){
 try{
  const b=await req.json();
  const hoodieId=String(b.hoodieId),tokenId=String(b.tokenId),contract=getAddress(String(b.contract));
  if(!/^\d+$/.test(hoodieId)||!/^\d+$/.test(tokenId))throw Error('Invalid Hoodie/NFT token ID');
  // Backwards compatible: existing clients without `currency` still list for ETH.
  const currency=String(b.currency||'ETH').trim().toUpperCase();
  if(currency!=='ETH'&&currency!=='USDG')throw Error('Only ETH and USDG are supported');
  const amount=String(currency==='USDG' ? (b.price ?? b.priceUsdg ?? '') : (b.priceEth ?? b.price ?? '')).trim();
  if(!/^\d+(?:\.\d+)?$/.test(amount))throw Error('Invalid '+currency+' price');
  const paymentToken=currencyAddress(currency);
  const {wallet,p}=await hoodInfo(hoodieId);
  // Read decimals from the actual USDG token, never assume 18 or 6 decimals.
  const decimals=currency==='ETH'?18:Number(await new Contract(paymentToken,['function decimals() view returns (uint8)'],p).decimals());
  const price=parseListingPrice(amount,decimals);
  const days=Number(b.days||7);
  if(!Number.isInteger(days)||days<1||days>30)throw Error('Duration must be 1-30 days');
  if(getAddress(await getNftOwner(p,contract,tokenId))!==wallet)throw Error('NFT not owned by the selected HoodWallet');
  // The Actions API expects a human-readable amount in the selected asset.
  // Always ask OpenSea to construct the USDG order; never mutate signed order fields.
  const useCreatorFee=b.useCreatorFee===undefined?true:b.useCreatorFee;
  if(typeof useCreatorFee!=='boolean')throw Error('useCreatorFee must be a boolean');
  const input={address:wallet,items:[{
    chain:CHAIN,contract,token_id:tokenId,quantity:1,
    price:{currency:paymentToken,amount}
  }],use_creator_fee:useCreatorFee};
  const response=await fetch(`${OPENSEA_API.replace(/\/$/,'')}/listings/actions`,{method:'POST',headers:{'x-api-key':requireOpenSeaKey(),'content-type':'application/json',accept:'application/json'},body:JSON.stringify(input),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const raw=await response.text();let data:unknown;
  try{data=JSON.parse(raw);}catch{data={raw:raw.slice(0,1200)};}
  if(!response.ok)return NextResponse.json({ok:false,error:`OpenSea listing actions returned HTTP ${response.status}`,details:data},{status:422});
  const result=await interpretActions(data,{wallet,contract,tokenId,price,paymentToken,paymentDecimals:decimals,currency,days,useCreatorFee,provider:p});
  return NextResponse.json({ok:true,hoodieId,wallet,tokenId,contract,currency,paymentToken,paymentDecimals:decimals,priceAmount:amount,days,useCreatorFee,creatorRoyalty:result.royalty,duration:result.duration,priceWei:price.toString(),feeTotalBaseUnits:result.fee.toString(),sellerWei:result.seller.toString(),seaport:result.seaport,orderHash:result.orderHash,counter:result.counter,parameters:result.params,approval:result.approval,marketplaceFeeAndRoyaltyBaseUnits:result.fee.toString(),feeRecipients:result.params.consideration.filter(c=>c.recipient?.toLowerCase()!==wallet.toLowerCase()).map(c=>({recipient:c.recipient,amountWei:c.startAmount})),conduit:result.operator});
 }catch(e){return NextResponse.json({ok:false,error:jsonError(e)},{status:400});}
}
