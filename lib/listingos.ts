import { siteConfig } from "./config";
import { Contract, Interface, JsonRpcProvider, ZeroAddress, ZeroHash, getAddress, parseEther, randomBytes, hexlify } from 'ethers';

export const CHAIN = 'robinhood';
export const CHAIN_ID = 4663; // ListingOS v1 is mainnet-only
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
 for(const c of p.consideration){if(c.itemType!==0||getAddress(c.token)!==ZeroAddress||BigInt(c.startAmount)!==BigInt(c.endAmount)||BigInt(c.startAmount)<=BigInt(0))throw Error('Only fixed native ETH consideration supported');}
 if(!p.consideration.some(c=>getAddress(c.recipient!)===getAddress(wallet)))throw Error('Missing HoodWallet sale proceeds');
 if(BigInt(p.endTime)<=BigInt(Math.floor(Date.now()/1000)))throw Error('Listing already expired');
}
