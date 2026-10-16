import {NextRequest, NextResponse} from 'next/server';
import {Contract, TypedDataEncoder, getAddress, isHexString} from 'ethers';
import {CHAIN, CHAIN_ID, OPENSEA_API, CANVAS, SEAPORT_ABI, checkOrder, cleanParams, components, getNftOwner, hoodInfo, jsonError, requireOpenSeaKey, validateListingDuration, verifyCreatorRoyalty, resolveListingDuration} from '../../../../lib/listingos';
import {ORDER_TYPES, orderValues, signingDomain} from '../../../../lib/listingos-signing';

export const runtime = 'nodejs';
const ERC1271 = ['function isValidSignature(bytes32 hash,bytes signature) view returns (bytes4)'];
const MAGIC = '0x1626ba7e';
const types = ORDER_TYPES as unknown as Record<string, {name:string;type:string}[]>;

async function responseBody(response: Response): Promise<unknown> {
 const raw = await response.text();
 try {return JSON.parse(raw);} catch {return {raw:raw.slice(0,2000)};}
}
function detailsText(v: unknown): string {
 if(!v || typeof v !== 'object') return '';
 const x=v as Record<string,unknown>;
 if(Array.isArray(x.errors)) return x.errors.map(String).join('; ');
 if(typeof x.detail==='string')return x.detail;
 if(typeof x.message==='string')return x.message;
 return '';
}

export async function POST(req: NextRequest) {
 try {
  const b = await req.json();
  const hoodieId=String(b.hoodieId), tokenId=String(b.tokenId);
  if(!/^\d+$/.test(hoodieId)||!/^\d+$/.test(tokenId))throw Error('Invalid Hoodie or token ID');
  const contract=getAddress(String(b.contract||CANVAS));
  const signature=String(b.signature||'');
  if(!isHexString(signature)||signature.length<132)throw Error('Invalid owner signature');
  const {wallet,p}=await hoodInfo(hoodieId);
  if(await getNftOwner(p,contract,tokenId)!==wallet)throw Error('NFT no longer belongs to this HoodWallet');
  const params=cleanParams(b.parameters);
  checkOrder(params,wallet,contract,tokenId);
  // Always reject multi-year orders, even for older clients. For a precise
  // requested duration, the submit caller must also send `days`.
  if(b.customDuration===true && b.durationSeconds===undefined && b.days===undefined)
   throw Error('Custom-duration submission requires durationSeconds (or legacy days)');
  const requestedDuration=(b.durationSeconds!==undefined||b.days!==undefined)?resolveListingDuration(b):undefined;
  const duration=validateListingDuration(params,requestedDuration);
  const useCreatorFee=b.useCreatorFee===undefined?true:b.useCreatorFee;
  if(typeof useCreatorFee!=='boolean')throw Error('useCreatorFee must be a boolean');
  const total=params.consideration.reduce((n,c)=>n+BigInt(c.startAmount),BigInt(0));
  const royalty=await verifyCreatorRoyalty(params,contract,tokenId,total,p,useCreatorFee);
  const seaportAddr=getAddress(String(b.seaport));
  const seaport=new Contract(seaportAddr,SEAPORT_ABI,p);
  const counter=String(await seaport.getCounter(wallet));
  if(counter!==String(b.counter))throw Error('Seaport counter changed; prepare a fresh order');
  const comp=components(params,counter);
  const hash:string=await seaport.getOrderHash(comp);
  if(hash.toLowerCase()!==String(b.orderHash).toLowerCase())throw Error('Order hash mismatch');
  const status=await seaport.getOrderStatus(hash);
  if(status.isCancelled||BigInt(status.totalFilled)>BigInt(0))throw Error('Order cancelled or already filled');
  if(BigInt(params.endTime)<=BigInt(Math.floor(Date.now()/1000)))throw Error('Order expired');
  const values=orderValues(comp);
  const digest=TypedDataEncoder.hash(signingDomain(CHAIN_ID,seaportAddr),types,values);
  const calculatedHash=TypedDataEncoder.hashStruct('OrderComponents',types,values);
  if(calculatedHash.toLowerCase()!==hash.toLowerCase())throw Error('Seaport order hash calculation mismatch');
  const valid:string=await new Contract(wallet,ERC1271,p).isValidSignature(digest,signature);
  if(valid.toLowerCase()!==MAGIC)throw Error('HoodWallet rejected human-owner signature');
  const counterNumber=Number(counter);
  if(!Number.isSafeInteger(counterNumber)||counterNumber<0)throw Error('Unsupported Seaport counter value');
  // The URL takes protocol NAME, not protocol ADDRESS. The address belongs in the JSON body.
  const url=`${OPENSEA_API.replace(/\/$/,'')}/orders/${CHAIN}/seaport/listings`;
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json','x-api-key':requireOpenSeaKey()},body:JSON.stringify({parameters:{...params,counter:counterNumber},protocol_address:seaportAddr,signature}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const payload=await responseBody(response);
  if(!response.ok){return NextResponse.json({ok:false,submittedToOpenSea:false,orderHash:hash,error:`OpenSea rejected the signed listing (HTTP ${response.status})${detailsText(payload)?`: ${detailsText(payload)}`:''}`,details:payload},{status:422});}
  const result=(payload && typeof payload==='object')?payload as Record<string,unknown>:{};
  if(typeof result.order_hash==='string'&&result.order_hash.toLowerCase()!==hash.toLowerCase())throw Error('OpenSea returned an unexpected order hash. Verify before considering this listed.');
  const reportedProtocol=typeof result.protocol_address==='string'?result.protocol_address:'';
  if(reportedProtocol&&getAddress(reportedProtocol)!==seaportAddr)throw Error('OpenSea returned an unexpected Seaport contract address');
  // API submission and live marketplace visibility are separate states.
  let active=false;
  let verificationError='';
  try {
   const lookup=await fetch(`${OPENSEA_API.replace(/\/$/,'')}/orders/chain/${CHAIN}/protocol/${seaportAddr}/${hash}`,{headers:{accept:'application/json','x-api-key':requireOpenSeaKey()},cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(lookup.ok){const body=await lookup.json() as {order?:{status?:string;order_hash?:string}};active=body.order?.status==='ACTIVE'&&body.order.order_hash?.toLowerCase()===hash.toLowerCase();}
   else verificationError=`OpenSea order lookup returned HTTP ${lookup.status}; indexing may take time`;
  }catch(e){verificationError=jsonError(e);}
  return NextResponse.json({ok:true,submittedToOpenSea:true,activeConfirmed:active,orderHash:hash,duration,creatorRoyalty:royalty,openseaUrl:`https://opensea.io/item/robinhood/${contract}/${tokenId}`,verificationError,response:payload});
 }catch(e){return NextResponse.json({ok:false,error:jsonError(e)},{status:400});}
}
