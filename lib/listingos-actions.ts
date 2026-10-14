import { Contract, Interface, JsonRpcProvider, ZeroAddress, getAddress, isAddress, isHexString } from 'ethers';
import { CHAIN_ID, NFT_ABI, SEAPORT_ABI, checkOrder, cleanParams, components } from './listingos';
import type { Parameters } from './listingos';

const CONTROLLER = '0x00000000F9490004C11Cef243f5400493c00Ad63';
const CONTROLLER_ABI = ['function getConduit(bytes32 conduitKey) view returns (address conduit, bool exists)'];
const APPROVAL_IFACE = new Interface(['function setApprovalForAll(address operator,bool approved)', 'function approve(address to,uint256 tokenId)']);
export type Approval = { target:string; data:`0x${string}`; value:'0' };
type Obj = Record<string, unknown>;
const obj = (v:unknown):Obj => v!==null && typeof v==='object' && !Array.isArray(v) ? v as Obj : {};
const addr = (v:unknown):string => getAddress(String(obj(v).value ?? v));
const num = (v:unknown):string => {
 const raw = obj(v).value ?? v;
 if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'bigint') throw Error('OpenSea numeric field is missing');
 const value=String(raw);
 if(!/^\d+$/.test(value))throw Error(`Unexpected OpenSea numeric field: ${value.slice(0,35)}`);
 return value;
};
const same = (a:string,b:string) => getAddress(a)===getAddress(b);
function itemType(v: unknown): number {
 const raw = String(v).trim().toUpperCase();
 const aliases: Record<string, number> = {
  NATIVE: 0,
  ERC20: 1,
  ERC721: 2,
  ERC1155: 3,
  ERC721_WITH_CRITERIA: 4,
  ERC1155_WITH_CRITERIA: 5,
  SEAPORT_ITEM_TYPE_NATIVE: 0,
  SEAPORT_ITEM_TYPE_ERC20: 1,
  SEAPORT_ITEM_TYPE_ERC721: 2,
  SEAPORT_ITEM_TYPE_ERC1155: 3,
  SEAPORT_ITEM_TYPE_ERC721_WITH_CRITERIA: 4,
  SEAPORT_ITEM_TYPE_ERC1155_WITH_CRITERIA: 5,
 };
 if (Object.prototype.hasOwnProperty.call(aliases, raw)) return aliases[raw];
 if (/^[0-5]$/.test(raw)) return Number(raw);
 throw Error(`Unsupported OpenSea itemType ${raw}`);
}

function items(v:unknown,isConsideration:boolean):Obj[] {
 if(!Array.isArray(v))throw Error('OpenSea order items missing');
 return v.map(raw=>{
  const i=obj(raw);
  return {itemType:itemType(i.itemType),token:addr(i.tokenContract ?? i.token),identifierOrCriteria:num(i.identifierOrCriteria),startAmount:num(i.startAmount),endAmount:num(i.endAmount),...(isConsideration?{recipient:addr(i.recipient)}:{})};
 });
}
function parseMessage(message:unknown):Obj {
 if(typeof message!=='string')throw Error('OpenSea signatureRequest.message was not a string');
 let parsed:unknown;
 try{parsed=JSON.parse(message);}catch {throw Error('OpenSea signing message was not JSON typed data; refused to invent a signing payload');}
 return obj(parsed);
}
function makeOrder(raw:Obj):{params:Parameters;counter:string;seaport:string} {
 const counter=num(raw.counter);
 const seaport=addr(raw.protocolAddress);
 const params=cleanParams({
  offerer:addr(raw.offerer),zone:addr(raw.zone),offer:items(raw.offer,false),consideration:items(raw.consideration,true),
  orderType:num(raw.orderType),startTime:num(raw.startTime),endTime:num(raw.endTime),
  zoneHash:String(raw.zoneHash),salt:num(raw.salt),conduitKey:String(raw.conduitKey),
  totalOriginalConsiderationItems:(raw.consideration as unknown[])?.length,
 });
 return {params,counter,seaport};
}
function verifyMessage(message:Obj, params:Parameters,counter:string,seaport:string) {
 // The signing request may be a JSON EIP-712 envelope or just its order message.
 const msg=obj(message.message ?? message);
 if(!Object.keys(msg).length)throw Error('OpenSea signing message missing order parameters');
 const messageCounter=num(msg.counter);
 if(messageCounter!==counter)throw Error('OpenSea signing message counter differs from returned order');
 const signed=cleanParams({...msg,totalOriginalConsiderationItems:params.consideration.length});
 // Compare normalized complete order. Signed order MUST match the returned order, including fee recipients.
 const left={...signed,totalOriginalConsiderationItems:0};
 const right={...params,totalOriginalConsiderationItems:0};
 if(JSON.stringify(left)!==JSON.stringify(right))throw Error('OpenSea signing message does not match its order data; refusing signature');
 const domain=obj(message.domain);
 if(Object.keys(domain).length){
  if(addr(domain.verifyingContract)!==seaport || Number(domain.chainId)!==CHAIN_ID || String(domain.name)!=='Seaport')throw Error('OpenSea EIP-712 domain mismatch');
  if(String(domain.version)!=='1.6')throw Error('Unexpected Seaport domain version');
 }
}
export async function interpretActions(raw:unknown, expected:{wallet:string;contract:string;tokenId:string;price:bigint;provider:JsonRpcProvider}) {
 const steps=obj(raw).steps;
 if(!Array.isArray(steps))throw Error('OpenSea returned no steps array');
 const create=steps.map(s=>obj(obj(s).createListingsAction)).find(v=>Object.keys(v).length>0);
 if(!create)throw Error('OpenSea did not provide createListingsAction');
 if(!Array.isArray(create.orders)||create.orders.length!==1)throw Error('Expected exactly one OpenSea listing order');
 const {params,counter,seaport}=makeOrder(obj(create.orders[0]));
 checkOrder(params,expected.wallet,expected.contract,expected.tokenId);
 const request=obj(create.signatureRequest);
 const chain=obj(request.chainIdentifier);
 if(Number(chain.chainId)!==CHAIN_ID)throw Error('OpenSea signing request chain does not match Robinhood');
 const typed=parseMessage(request.message);
 verifyMessage(typed,params,counter,seaport);
 const seaportContract=new Contract(seaport,SEAPORT_ABI,expected.provider);
 const chainCounter=String(await seaportContract.getCounter(expected.wallet));
 if(counter!==chainCounter)throw Error('OpenSea order counter is stale');
 const orderHash:string=await seaportContract.getOrderHash(components(params,counter));
 const total=params.consideration.reduce((n,c)=>n+BigInt(c.startAmount),BigInt(0));
 const seller=params.consideration.filter(c=>same(c.recipient!,expected.wallet)).reduce((n,c)=>n+BigInt(c.startAmount),BigInt(0));
 const fee=total-seller;
 if(total!==expected.price){
  const fmt=(v:bigint)=>`${v.toString()} wei (${Number(v)/1e18} ETH)`;
  throw Error(`OpenSea price check: requested ${fmt(expected.price)}; buyer total ${fmt(total)}; HoodWallet receives ${fmt(seller)}; fees ${fmt(fee)}; consideration items ${params.consideration.length}. No signature requested.`);
 }
 if(seller<=BigInt(0))throw Error('No proceeds allocated to HoodWallet');
 if(params.consideration.length>8||fee<expected.price/BigInt(100))throw Error('Unexpected marketplace fees');
 const controller=new Contract(CONTROLLER,CONTROLLER_ABI,expected.provider);
 const [operator,exists]=await controller.getConduit(params.conduitKey) as [string,boolean];
 if(!exists||!isAddress(operator)||same(operator,ZeroAddress))throw Error('OpenSea conduit cannot be verified on-chain');
 const nft=new Contract(expected.contract,NFT_ABI,expected.provider);
 const approved=await nft.isApprovedForAll(expected.wallet,operator) || same(await nft.getApproved(BigInt(expected.tokenId)),operator);
 // Parse the exact approval action shape returned by OpenSea, with wrapped addresses.
 for(const step of steps){
  const action=obj(obj(step).itemApprovalAction);
  if(!Object.keys(action).length)continue;
  const transaction=obj(action.transaction);
  if(!Object.keys(transaction).length)throw Error('OpenSea approval action missing transaction');
  const target=addr(transaction.to);
  if(!same(target,expected.contract)||BigInt(num(transaction.value))!==BigInt(0))throw Error('OpenSea returned an unsafe approval transaction');
  if(Number(obj(transaction.chainIdentifier).chainId)!==CHAIN_ID)throw Error('Approval action on wrong chain');
  const source=addr(transaction.from);
  if(!same(source,expected.wallet))throw Error('Approval must come from the HoodWallet');
  const parsed=APPROVAL_IFACE.parseTransaction({data:String(transaction.data)});
  if(!parsed)throw Error('Unrecognized OpenSea NFT approval');
  if(parsed.name==='setApprovalForAll'){
   if(!same(String(parsed.args[0]),operator)||parsed.args[1]!==true)throw Error('Incorrect OpenSea approval operator');
  }else if(parsed.name==='approve'){
   if(!same(String(parsed.args[0]),operator)||BigInt(parsed.args[1])!==BigInt(expected.tokenId))throw Error('Incorrect token approval');
  }else throw Error('Unsupported NFT approval action');
 }
 const approval:Approval|null=approved?null:{target:expected.contract,value:'0',data:APPROVAL_IFACE.encodeFunctionData('setApprovalForAll',[operator,true]) as `0x${string}`};
 return {params,counter,orderHash,seaport,operator,approval,total,seller,fee};
}
