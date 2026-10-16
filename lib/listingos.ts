import { siteConfig } from "./config";
import { Contract, Interface, JsonRpcProvider, ZeroAddress, ZeroHash, getAddress, parseEther, parseUnits, randomBytes, hexlify } from 'ethers';

export const CHAIN = 'robinhood';
export const CHAIN_ID = 4663; // ListingOS v1 is mainnet-only
export const USDG_ADDRESS = getAddress('0x5fc5360d0400a0fd4f2af552add042d716f1d168');
export type ListingCurrency = 'ETH' | 'USDG';
export function currencyAddress(currency:ListingCurrency):string {return currency==='USDG'?USDG_ADDRESS:ZeroAddress;}
export function parseListingPrice(amount:string,decimals:number):bigint {
 if(!/^\d+(?:\.\d+)?$/.test(amount) || !Number.isInteger(decimals) || decimals<0 || decimals>36)throw Error('Invalid listing amount or token decimals');
 const n=parseUnits(amount,decimals);
 if(n<=BigInt(0))throw Error('Price must be positive');
 return n;
}

export const OPENSEA_API = siteConfig.listingOSOpenSeaApiUrl;
export const HOODOS = siteConfig.hoodOSAddress;
export const CANVAS = siteConfig.listingOSCanvasAddress;
export const NFT_ABI = [ 'function ownerOf(uint256) view returns (address)', 'function isApprovedForAll(address,address) view returns (bool)', 'function getApproved(uint256) view returns (address)', 'function approve(address,uint256)', 'function isApprovedForAll(address,address) view returns (bool)' ];
export const HOODOS_ABI = ['function hoodInfo(uint256) view returns (tuple(uint256 tokenId,address owner,address wallet,bool walletDeployed,bool active,address activationOwner,uint64 activatedAt,uint256 walletState,uint256 nativeBalance,uint256 paymentTokenBalance) info)'];
export const WALLET_ABI = [{ type:'function', name:'execute', stateMutability:'payable',inputs:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'},{name:'operation',type:'uint8'}],outputs:[{name:'result',type:'bytes'}]}] as const;
export const SEAPORT_ABI = [
  'function getCounter(address offerer) view returns (uint256)',
  'function getOrderHash((address offerer,address zone,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] offer,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter) order) view returns (bytes32)',
  'function getOrderStatus(bytes32 orderHash) view returns (bool isValidated,bool isCancelled,uint256 totalFilled,uint256 totalSize)',
  'function validate(((address offerer,address zone,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] offer,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 totalOriginalConsiderationItems) parameters,bytes signature)[] orders) returns (bool)',
  'function cancel((address offerer,address zone,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] offer,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)[] orders) returns (bool)',
];
export const seaportIface = new Interface(SEAPORT_ABI);
export const nftIface = new Interface(NFT_ABI);
export function provider() { if (siteConfig.chainId !== CHAIN_ID) throw Error('ListingOS v1 supports Robinhood mainnet only'); const url = process.env.ROBINHOOD_RPC_URL || siteConfig.rpcUrl; if(!url) throw Error('Configure ROBINHOOD_RPC_URL or your site RPC URL'); return new JsonRpcProvider(url, CHAIN_ID, { staticNetwork:true }); }
export function seaportAddress() { const a=siteConfig.listingOSSeaportAddress; if(!a) throw Error('Configure NEXT_PUBLIC_LISTINGOS_SEAPORT_MAINNET_ADDRESS from a verified Robinhood OpenSea order'); return getAddress(a); }
export function requireOpenSeaKey() { const key=process.env.OPENSEA_API_KEY; if(!key) throw Error('Configure OPENSEA_API_KEY'); return key; }
export function jsonError(e:unknown) { return e instanceof Error ? e.message : 'Unknown failure'; }
export function parsePrice(price:string) { const x=parseEther(price); if(x<=BigInt(0)) throw Error('Price must be positive'); return x; }
export async function hoodInfo(hoodieId:string) { const p=provider(); const i=await new Contract(HOODOS,HOODOS_ABI,p).hoodInfo(BigInt(hoodieId)); if(!i.active || !i.walletDeployed) throw Error('HoodWallet not active/deployed'); return {p, owner:getAddress(i.owner), wallet:getAddress(i.wallet), hoodieId}; }
export async function getNftOwner(p:JsonRpcProvider, contract:string, tokenId:string) { return getAddress(await new Contract(contract,NFT_ABI,p).ownerOf(BigInt(tokenId))); }
export function requireCanvasContract(contract:string) { return getAddress(contract); } // Legacy name; ListingOS supports ERC-721s from multiple contracts.
export function generateSalt(){ return BigInt(hexlify(randomBytes(32))).toString(); }
export type Item = {itemType:number;token:string;identifierOrCriteria:string;startAmount:string;endAmount:string;recipient?:string};
export type Parameters={offerer:string;zone:string;offer:Item[];consideration:Item[];orderType:number;startTime:string;endTime:string;zoneHash:string;salt:string;conduitKey:string;totalOriginalConsiderationItems:number};
export function components(params:Parameters,counter:string){ const {totalOriginalConsiderationItems:_ignored,...rest}=params; void _ignored; return {...rest,counter}; }
export function cleanParams(v:unknown):Parameters { if(!v || typeof v!=='object') throw Error('Missing order parameters'); const x=v as Record<string,unknown>; const toItems=(a:unknown, recipient:boolean) => {if(!Array.isArray(a)) throw Error('Invalid items');return a.map((it:unknown)=>{const z=it as Record<string,unknown>;return {itemType:Number(z.itemType),token:getAddress(String(z.token)),identifierOrCriteria:String(z.identifierOrCriteria),startAmount:String(z.startAmount),endAmount:String(z.endAmount),...(recipient?{recipient:getAddress(String(z.recipient))}:{})};});};return {offerer:getAddress(String(x.offerer)),zone:getAddress(String(x.zone)),offer:toItems(x.offer,false),consideration:toItems(x.consideration,true),orderType:Number(x.orderType),startTime:String(x.startTime),endTime:String(x.endTime),zoneHash:String(x.zoneHash),salt:String(x.salt),conduitKey:String(x.conduitKey),totalOriginalConsiderationItems:Number(x.totalOriginalConsiderationItems)}; }
export function checkOrder(p:Parameters,wallet:string,token:string,id:string){
 if(getAddress(p.offerer)!==getAddress(wallet))throw Error('Offerer is not HoodWallet');
 if(p.offer.length!==1||p.offer[0].itemType!==2||getAddress(p.offer[0].token)!==getAddress(token)||BigInt(p.offer[0].identifierOrCriteria)!==BigInt(id)||BigInt(p.offer[0].startAmount)!==BigInt(1)||BigInt(p.offer[0].endAmount)!==BigInt(1))throw Error('Unexpected NFT offer');
 // OpenSea's Robinhood Listing Creation Actions API can return either
 // FULL_OPEN (0, zero zone) or restricted (2/3, nonzero zone) orders.
 // Reject other order types and inconsistent zone combinations.
 const fullOpen=p.orderType===0;
 const restricted=p.orderType===2||p.orderType===3;
 if(!fullOpen&&!restricted)throw Error('Unsupported OpenSea Seaport order type');
 if(fullOpen&&(p.zone!==ZeroAddress||p.zoneHash!==ZeroHash))throw Error('FULL_OPEN order must have zero zone and zone hash');
 if(restricted&&p.zone===ZeroAddress)throw Error('Restricted OpenSea order missing zone');
 if(p.conduitKey===ZeroHash)throw Error('Missing OpenSea conduit key');
 if(p.consideration.length<2)throw Error('Missing seller or marketplace payment items');
 // All proceeds must use ONE approved payment asset. Do not allow mixed currencies.
 const first=p.consideration[0];
 const paymentToken=getAddress(first.token);
 const paymentType=first.itemType;
 if(!((paymentType===0 && paymentToken===ZeroAddress)||(paymentType===1 && paymentToken===USDG_ADDRESS)))throw Error('Unsupported listing currency: only native ETH or Robinhood USDG');
 for(const c of p.consideration){
  if(c.itemType!==paymentType||getAddress(c.token)!==paymentToken||BigInt(c.identifierOrCriteria)!==BigInt(0)||BigInt(c.startAmount)!==BigInt(c.endAmount)||BigInt(c.startAmount)<=BigInt(0))throw Error('Only fixed, uniform ETH or USDG consideration supported');
 }
 if(!p.consideration.some(c=>getAddress(c.recipient!)===getAddress(wallet)))throw Error('Missing HoodWallet sale proceeds');
 if(BigInt(p.endTime)<=BigInt(Math.floor(Date.now()/1000)))throw Error('Listing already expired');
}


// Fail closed on unexpected long-running Seaport orders. The OpenSea Actions
// endpoint does not currently document a duration input; never forge signed times.
export function validateListingDuration(p:Parameters, days?:number, now=Math.floor(Date.now()/1000)) {
 const start=Number(p.startTime), end=Number(p.endTime);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end<=now)throw Error('Invalid or expired Seaport listing timestamps');
 if(start>now+900)throw Error('OpenSea listing starts unexpectedly far in the future');
 if(end>now+30*86400+900)throw Error(`OpenSea listing expiration is too long (${new Date(end*1000).toISOString()}). Maximum supported duration is 30 days; no signature requested.`);
 if(days!==undefined){
  if(!Number.isInteger(days)||days<1||days>30)throw Error('Duration must be 1-30 days');
  const requested=days*86400;
  const actual=end-now;
  if(Math.abs(actual-requested)>900)throw Error(`OpenSea listing expiration mismatch: requested ${days} day(s), but returned endTime=${end} (${new Date(end*1000).toISOString()}); no signature requested. The listing Actions API may not support custom expiration.`);
 }
 return {startTime:start,endTime:end,expiresAt:new Date(end*1000).toISOString(),remainingSeconds:end-now};
}

export type RoyaltyReport={supported:boolean;recipient:string|null;amount:string;paid:string;verified:boolean;note:string};
export async function verifyCreatorRoyalty(p:Parameters,nftContract:string,tokenId:string,total:bigint,rpc:JsonRpcProvider,required:boolean):Promise<RoyaltyReport>{
 const abi=['function royaltyInfo(uint256 tokenId,uint256 salePrice) view returns (address receiver,uint256 royaltyAmount)'];
 let recipient:string;let amount:bigint;
 try {
  const result=await new Contract(nftContract,abi,rpc).royaltyInfo(BigInt(tokenId),total);
  recipient=getAddress(String(result[0]));amount=BigInt(result[1]);
 }catch{
  return {supported:false,recipient:null,amount:'0',paid:'0',verified:false,note:'ERC-2981 royaltyInfo unavailable; OpenSea creator fee recipients cannot be independently classified from order data.'};
 }
 if(recipient===ZeroAddress||amount===BigInt(0))return {supported:true,recipient:recipient===ZeroAddress?null:recipient,amount:amount.toString(),paid:'0',verified:true,note:'ERC-2981 reports no creator royalty at this sale price.'};
 const paid=p.consideration.filter(c=>getAddress(c.recipient!)===recipient).reduce((n,c)=>n+BigInt(c.startAmount),BigInt(0));
 if(required&&paid<amount)throw Error(`Creator royalties enabled, but OpenSea order pays ${paid} base units to ERC-2981 recipient ${recipient}; royaltyInfo requests ${amount}. Listing refused.`);
 return {supported:true,recipient,amount:amount.toString(),paid:paid.toString(),verified:paid>=amount,note:paid>=amount?'ERC-2981 creator royalty satisfied in signed order.':'Creator royalty not fully included in order (configuration disabled).'};
}
