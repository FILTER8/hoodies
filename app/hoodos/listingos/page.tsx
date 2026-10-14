'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {Contract,JsonRpcProvider,formatEther,getAddress} from 'ethers';
import { ORDER_TYPES, orderValues, signingDomain } from '../../../lib/listingos-signing';
import type {Address,Hex} from 'viem';
import SiteHeader from '../../../components/SiteHeader';
import SiteFooter from '../../../components/SiteFooter';
import {useWallet} from '../../../components/WalletProvider';
import {siteConfig} from '../../../lib/config';

const HOODOS_ABI=['function hoodInfo(uint256) view returns (tuple(uint256 tokenId,address owner,address wallet,bool walletDeployed,bool active,address activationOwner,uint64 activatedAt,uint256 walletState,uint256 nativeBalance,uint256 paymentTokenBalance) info)'];
const EXEC_ABI=[{type:'function',name:'execute',stateMutability:'payable',inputs:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'},{name:'operation',type:'uint8'}],outputs:[{name:'result',type:'bytes'}]}] as const;

type Exec={target:string;value:string;data:Hex};
type OrderParams={offerer:string;zone:string;offer:unknown[];consideration:unknown[];orderType:number;startTime:string;endTime:string;zoneHash:string;salt:string;conduitKey:string;totalOriginalConsiderationItems:number};
type Prepared={ok:boolean;hoodieId:string;wallet:string;tokenId:string;contract:string;orderHash:string;counter:string;parameters:OrderParams;priceWei:string;royaltyWei:string;royaltyRecipient:string;sellerWei:string;seaport:string;approval:Exec|null;error?:string};
type SavedOrder={seaport:string;hoodieId:string;tokenId:string;contract:string;wallet:string;orderHash:string;counter:string;parameters:OrderParams};
type Hoodie={tokenId:string;name:string};
type WalletNft={contract:string;tokenId:string;name:string;collectionName:string;image?:string;imageCandidates?:string[];balance:string;kind:'erc721'|'erc1155';trusted:boolean;spam:boolean};
type MarketplaceListing={order_hash?:string;chain?:string;maker?:string;protocol_address?:string;asset?:{identifier?:string;contract?:string;name?:string;image_url?:string};price?:{current?:{currency?:string;decimals?:number;value?:string}};order_created_at?:number;remaining_quantity?:number;};
type MarketplaceOrders={listings?:MarketplaceListing[];next?:string|null};
type EditableListing={orderHash:string;contract:string;tokenId:string;name:string;priceEth:string;};
type InventoryResponse={nfts?:Array<{contract:string;tokenId:string;name?:string;collectionName?:string;image?:string;imageCandidates?:string[];balance?:string;kind?:string;trusted?:boolean;spam?:boolean}>;warning?:string;error?:string};
function sameAddress(a:string,b:string){return a.toLowerCase()===b.toLowerCase()}
function NftPreview({nft}:{nft:WalletNft}){
 const [index,setIndex]=useState(0);const [proxy,setProxy]=useState(false);const [failed,setFailed]=useState(false);
 const sources=useMemo(()=>Array.from(new Set([...(nft.imageCandidates||[]),nft.image||''].map(x=>x.trim()).filter(Boolean))),[nft.image,nft.imageCandidates]);
 const current=sources[index];
 const fallback=`/api/hoodwallet/nft-image?${new URLSearchParams({contract:nft.contract,tokenId:nft.tokenId}).toString()}`;
 const image=current?(proxy&&!current.toLowerCase().startsWith('data:image/')?`/api/hoodwallet/image?url=${encodeURIComponent(current)}`:current):fallback;
 return <div className="aspect-square overflow-hidden bg-black text-[#ccff00]">{failed?<div className="flex h-full items-center justify-center p-4 text-center text-xs">NFT #{nft.tokenId}</div>:<Image unoptimized width={256} height={256} key={nft.contract+':'+nft.tokenId+':'+index+':'+String(proxy)} src={image} alt={nft.name} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={()=>{if(current&&!proxy&&!current.toLowerCase().startsWith('data:image/')){setProxy(true);return;}if(current&&index+1<sources.length){setIndex(x=>x+1);setProxy(false);return;}if(current){setIndex(sources.length);setProxy(false);return;}setFailed(true)}} />}</div>;
}

function orderPriceEth(o:MarketplaceListing):string{
 const value=o.price?.current?.value;
 if(typeof value!=='string'||!/^\d+$/.test(value))return '—';
 const decimals=o.price?.current?.decimals;
 if(decimals!==18)return '—';
 try{return formatEther(BigInt(value));}catch{return '—';}
}
function marketplaceNft(o:MarketplaceListing):{contract:string;tokenId:string}|null{
 const contract=o.asset?.contract,tokenId=o.asset?.identifier;
 if(typeof contract!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(contract)||typeof tokenId!=='string'||!/^\d+$/.test(tokenId))return null;
 return {contract,tokenId};
}
function shortHash(hash:string){return `${hash.slice(0,10)}…${hash.slice(-6)}`;}
function msg(e:unknown){return e instanceof Error?e.message:String(e)}
async function post<T>(path:string,payload:unknown):Promise<T>{
 const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload),cache:'no-store'});
 const raw=await r.text();let j:Record<string,unknown>;
 try{j=JSON.parse(raw) as Record<string,unknown>;}catch{throw Error(`${path} returned HTTP ${r.status} with non-JSON response. ${raw.slice(0,180)}`);}
 if(!r.ok||!j.ok){const details=(j.details&&typeof j.details==='object')?j.details as Record<string,unknown>:null;const errors=Array.isArray(details?.errors)?details.errors.join('; '):(typeof details?.message==='string'?details.message:typeof details?.detail==='string'?details.detail:'');throw Error(String(j.error||'Request failed')+(errors&&!String(j.error||'').includes(errors)?` — ${errors}`:''));}
 return j as T;
}
export default function ListingOS(){
 const {address,connect,ensureRequiredNetwork,getWalletClient}=useWallet();
 const provider=useMemo(()=>siteConfig.rpcUrl?new JsonRpcProvider(siteConfig.rpcUrl,Number(siteConfig.chainId),{staticNetwork:true}):null,[]);
 const [hoodies,setHoodies]=useState<Hoodie[]>([]);const [hoodieId,setHoodieId]=useState('');const [wallet,setWallet]=useState('');const [active,setActive]=useState(false);const [walletOwner,setWalletOwner]=useState('');
 const [inventory,setInventory]=useState<WalletNft[]>([]);const [inventoryLoading,setInventoryLoading]=useState(false);const [inventoryLoaded,setInventoryLoaded]=useState(false);const [inventoryWarning,setInventoryWarning]=useState('');const [showAllNfts,setShowAllNfts]=useState(false);
 const [tokenId,setTokenId]=useState('');const [priceEth,setPriceEth]=useState('0.01');const [days,setDays]=useState(7);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');const [prepared,setPrepared]=useState<Prepared|null>(null);const [marketOrders,setMarketOrders]=useState<MarketplaceOrders|null>(null);const [editing,setEditing]=useState<EditableListing|null>(null);const [changePrice,setChangePrice]=useState('');
 const canAct=!!address&&!!active&&walletOwner.toLowerCase()===address.toLowerCase();
 useEffect(()=>{let stop=false;const run=async()=>{if(!address){await Promise.resolve();if(stop)return;setHoodies([]);setHoodieId('');setWallet('');setActive(false);setWalletOwner('');setInventory([]);setInventoryLoaded(false);setInventoryWarning('');setTokenId('');setPrepared(null);setMarketOrders(null);setEditing(null);return;}try{const r=await fetch(`/api/hoodies?owner=${encodeURIComponent(address)}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Unable to load Hoodies');if(stop)return;const list=Array.isArray(j.items)?j.items:[];setHoodies(list);setHoodieId(v=>list.some((h:Hoodie)=>String(h.tokenId)===v)?v:String(list[0]?.tokenId||''));}catch(e){if(!stop)setError(msg(e));}};void run();return()=>{stop=true}},[address]);
 useEffect(()=>{let stop=false;const run=async()=>{if(!hoodieId||!provider)return;try{const i=await new Contract(siteConfig.hoodOSAddress,HOODOS_ABI,provider).hoodInfo(BigInt(hoodieId));if(!stop){setInventory([]);setInventoryLoaded(false);setInventoryWarning('');setTokenId('');setPrepared(null);setInventoryLoading(false);setEditing(null);setWallet(String(i.wallet));setActive(Boolean(i.active)&&Boolean(i.walletDeployed));setWalletOwner(String(i.owner));setPrepared(null);setMarketOrders(null);}}catch(e){if(!stop){setActive(false);setError(msg(e));}}};void run();return()=>{stop=true}},[hoodieId,provider]);
 const loadInventory=useCallback(async()=>{
  if(!wallet)return;
  setInventoryLoading(true);setInventoryWarning('');setError('');
  try{
   const params=new URLSearchParams({address:wallet});
   const r=await fetch(`/api/hoodwallet/assets?${params.toString()}`,{cache:'no-store',headers:{accept:'application/json'}});
   const json=(await r.json()) as InventoryResponse;
   if(!r.ok)throw Error(json.error||'Unable to load HoodWallet inventory');
   const unique=new Map<string,WalletNft>();
   for(const item of json.nfts||[]){
    if(!/^0x[a-fA-F0-9]{40}$/.test(item.contract||'')||!/^\d+$/.test(String(item.tokenId)))continue;
    if(item.kind!=='erc721'&&item.kind!=='erc1155')continue;
    const nft:WalletNft={contract:item.contract,tokenId:String(item.tokenId),name:item.name||`NFT #${item.tokenId}`,collectionName:item.collectionName||'NFT',image:item.image,imageCandidates:item.imageCandidates||[],balance:item.balance||'1',kind:item.kind,trusted:item.trusted===true,spam:item.spam===true};
    unique.set(`${nft.contract.toLowerCase()}:${nft.tokenId}`,nft);
   }
   setInventory(Array.from(unique.values()));setInventoryLoaded(true);setInventoryWarning(json.warning||'');
  }catch(e){setInventoryLoaded(false);setError(msg(e));}finally{setInventoryLoading(false)}
 },[wallet]);
 useEffect(()=>{if(!wallet)return;let cancelled=false;queueMicrotask(()=>{if(!cancelled)void loadInventory()});return()=>{cancelled=true}},[wallet,loadInventory]);
 const eligibleNfts=useMemo(()=>inventory.filter(n=>n.kind==='erc721'&&!n.spam),[inventory]);
 const visibleNfts=showAllNfts?inventory.filter(n=>!n.spam):eligibleNfts;
 const selectedNft=eligibleNfts.find(n=>`${n.contract.toLowerCase()}:${n.tokenId}`===tokenId);
 const execute=useCallback(async(action:Exec)=>{if(!wallet||!address)throw Error('Connect wallet and select Hoodie');await ensureRequiredNetwork();const client=await getWalletClient();if(!client.account)throw Error('Wallet account unavailable');const hash=await client.writeContract({chain:null,address:wallet as Address,abi:EXEC_ABI,functionName:'execute',args:[action.target as Address,BigInt(action.value),action.data,0],value:BigInt(0),account:client.account});if(!provider)throw Error('RPC unavailable');const receipt=await provider.waitForTransaction(hash,1);if(!receipt||receipt.status!==1)throw Error(`Transaction failed: ${hash}`);return hash;},[wallet,address,ensureRequiredNetwork,getWalletClient,provider]);
 const prepare=async()=>{if(!selectedNft){setError('Select an ERC-721 NFT held by this HoodWallet.');return;}setBusy(true);setError('');setMessage('');try{const p=await post<Prepared>('/api/listingos/prepare',{hoodieId,contract:selectedNft.contract,tokenId:selectedNft.tokenId,priceEth,days});setPrepared(p);setMessage('Prepared. Check price, royalties and NFT approval below before listing.');}catch(e){setError(msg(e))}finally{setBusy(false)}};
 const publish=async()=>{if(!prepared||!address)return;setBusy(true);setError('');setMessage('');try{
  // Sign first. A bad/unsupported signature costs zero gas.
  setMessage('Step 1/3: sign Seaport listing in your wallet (no gas).');
  await ensureRequiredNetwork();
  const client=await getWalletClient();
  if(!client.account)throw Error('Wallet account unavailable');
  const signature=await client.signTypedData({
   account:client.account,
   domain:{...signingDomain(4663,prepared.seaport || siteConfig.listingOSSeaportAddress),verifyingContract:getAddress(prepared.seaport || siteConfig.listingOSSeaportAddress) as Address},
   types:ORDER_TYPES,
   primaryType:'OrderComponents',
   message:orderValues({...prepared.parameters,counter:prepared.counter}) as never,
  });
  const o:SavedOrder={seaport:prepared.seaport,hoodieId:prepared.hoodieId,tokenId:prepared.tokenId,contract:prepared.contract,wallet:prepared.wallet,orderHash:prepared.orderHash,counter:prepared.counter,parameters:prepared.parameters};
  // Validate ERC-1271 before sending an NFT approval transaction.
  setMessage('Step 2/3: verify your signature on-chain (free read).');
  await post('/api/listingos/check-signature',{...o,signature});
  if(prepared.approval){setMessage('NFT approval required: confirm one blockchain transaction.');await execute(prepared.approval);}
  setMessage('Step 3/3: submitting signed listing to OpenSea...');
  const result=await post<{ok:boolean;orderHash:string;openseaUrl:string;activeConfirmed:boolean;verificationError?:string}>('/api/listingos/submit',{...o,signature});
  setMessage(result.activeConfirmed?`OpenSea listing ACTIVE: ${result.orderHash}. ${result.openseaUrl}`:`OpenSea accepted submission but ACTIVE indexing is not yet confirmed. Order ${result.orderHash}. ${result.verificationError||'Refresh marketplace orders shortly.'}`);
  setPrepared(null);
 }catch(e){setError(`Listing not confirmed on OpenSea: ${msg(e)}. If a previous order was validated, cancel it separately before listing again.`)}finally{setBusy(false)}};
 const cancelMarketplace=async(o:MarketplaceListing,newPrice?:string)=>{
  if(!canAct||!hoodieId)throw Error('Connect the current Hoodie owner first.');
  const orderHash=o.order_hash;
  if(!orderHash||!/^0x[a-fA-F0-9]{64}$/.test(orderHash))throw Error('Missing valid OpenSea order hash');
  setBusy(true);setError('');setMessage('Preparing cancellation from OpenSea order data…');
  try{
   const result=await post<{ok:boolean;execution:Exec;orderHash:string}>('/api/listingos/cancel-prepare',{hoodieId,orderHash});
   setMessage('Confirm the on-chain cancellation in your connected wallet.');
   const tx=await execute(result.execution);
   setMessage(`Order cancelled on-chain: ${tx}`);
   await refreshOrders(false);
   if(newPrice!==undefined){
    const asset=marketplaceNft(o);
    if(!asset)throw Error('Order cancelled, but NFT details were unavailable. Select the NFT from inventory to relist.');
    const key=`${asset.contract.toLowerCase()}:${asset.tokenId}`;
    if(!eligibleNfts.some(n=>`${n.contract.toLowerCase()}:${n.tokenId}`===key))throw Error('Old order cancelled; refresh NFT inventory, then select the NFT to relist.');
    setTokenId(key);setPriceEth(newPrice);setPrepared(null);setEditing(null);
    setMessage(`Old order cancelled. ${newPrice} ETH is ready in Create Listing; review and sign the new listing.`);
    document.getElementById('listingos-create')?.scrollIntoView({behavior:'smooth',block:'start'});
   }
  }catch(e){setError(msg(e));}finally{setBusy(false)}
 };
 const refreshOrders=async(showBusy=true)=>{if(!hoodieId)return;if(showBusy)setBusy(true);setError('');try{
  const r=await fetch(`/api/listingos/orders?hoodieId=${encodeURIComponent(hoodieId)}`,{cache:'no-store',headers:{accept:'application/json'}});
  const raw=await r.text();let j:{ok?:boolean;orders?:MarketplaceOrders;error?:string};
  try{j=JSON.parse(raw);}catch{throw Error(`Orders API returned HTTP ${r.status} instead of JSON. Check app/api/listingos/orders/route.ts`)}
  if(!r.ok||!j.ok)throw Error(j.error||'Failed to load listings');
  setMarketOrders(j.orders||{listings:[]});
 }catch(e){setError(msg(e))}finally{if(showBusy)setBusy(false)}};
 const refresh=()=>refreshOrders();
 return <main className="min-h-screen bg-[#ccff00] text-black"><SiteHeader/><section className="mx-auto max-w-5xl px-4 pb-24 pt-20 md:pt-24"><div className="flex items-center justify-between border-b border-black pb-3"><span className="text-[10px] uppercase tracking-widest">HoodOS / ListingOS</span><Link href="/hoodos" className="text-xs underline">Back to HoodOS</Link></div><h1 className="mt-10 text-7xl tracking-[-0.07em] md:text-9xl">LISTING<br/>OS</h1><p className="mt-6 max-w-xl text-base">Sell NFTs from your HoodWallet with a wallet signature. Fixed ETH price · Robinhood Chain · only one approval transaction when required.</p>
 {!address?<button className="mt-8 bg-black px-6 py-4 text-[#ccff00]" onClick={()=>void connect()}>Connect wallet</button>:<div className="mt-10 space-y-8"><section className="border border-black p-5"><h2 className="text-2xl">01 / SELECT HOODIE</h2><select className="mt-4 w-full border border-black bg-transparent p-3" value={hoodieId} onChange={e=>setHoodieId(e.target.value)}><option value="">Choose a Hoodie</option>{hoodies.map(h=><option key={h.tokenId} value={h.tokenId}>Hoodie #{h.tokenId}</option>)}</select><p className="mt-3 break-all text-sm">HoodWallet: {wallet||'—'}</p><p className="mt-2 text-sm">{active?'● Active':'○ Not active'} · {canAct?'Connected owner authorized':'Connect current Hoodie owner to use UI'}</p><p className="mt-2 text-xs">The connected human Hoodie owner signs the listing. No agent required.</p></section>
 <section id="listingos-create" className="border border-black p-5"><h2 className="text-2xl">02 / CREATE LISTING</h2><p className="mt-2 text-sm">Select an ERC-721 NFT from your HoodWallet inventory. ERC-1155s are not yet supported.</p>
 <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="text-xs uppercase">HoodWallet NFTs · {inventoryLoaded?inventory.length:'Loading...'}</span><div className="flex gap-3"><button type="button" onClick={()=>setShowAllNfts(v=>!v)} className="text-xs underline underline-offset-4">{showAllNfts?'Show supported NFTs':'Show all NFTs'}</button><button type="button" disabled={inventoryLoading||!wallet} onClick={()=>void loadInventory()} className="text-xs underline underline-offset-4 disabled:opacity-30">{inventoryLoading?'Refreshing...':'Refresh inventory'}</button></div></div>
 {inventoryWarning&&<p className="mt-2 text-xs">Inventory warning: {inventoryWarning}</p>}
 {!inventoryLoaded&&inventoryLoading?<p className="mt-4 border border-black p-4 text-xs">Discovering NFTs held by this HoodWallet...</p>:visibleNfts.length===0?<p className="mt-4 border border-black p-4 text-xs">{inventoryLoaded?'No matching NFTs found. Try Show all NFTs or refresh the wallet inventory.':'NFT inventory not loaded yet.'}</p>:<div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">{visibleNfts.map(n=>{const eligible=n.kind==='erc721'&&!n.spam;const chosen=eligible&&tokenId===`${n.contract.toLowerCase()}:${n.tokenId}`;return <button type="button" key={`${n.contract.toLowerCase()}:${n.tokenId}`} disabled={!eligible||busy} onClick={()=>{setTokenId(`${n.contract.toLowerCase()}:${n.tokenId}`);setPrepared(null);setError('');setMessage('')}} className={`min-w-0 overflow-hidden border text-left disabled:cursor-not-allowed ${chosen?'border-black ring-4 ring-black':'border-black/50'} ${!eligible?'opacity-50':''}`}><NftPreview nft={n}/><div className="p-2"><p className="truncate text-xs font-bold">{n.name}</p><p className="mt-1 truncate text-[10px]">{n.collectionName} · #{n.tokenId}</p><p className="mt-2 text-[10px] uppercase">{eligible?(chosen?'✓ Selected':'Select to list'):'Not supported in v1'}</p></div></button>})}</div>}
 {selectedNft&&<div className="mt-4 border border-black p-3 text-xs"><strong>Selected:</strong> {selectedNft.name} · Token #{selectedNft.tokenId}<p className="mt-1 break-all opacity-70">Contract: {selectedNft.contract}</p></div>}<div className="mt-5 grid grid-cols-2 gap-4"><label className="text-xs uppercase">Price (ETH)<input className="mt-2 block w-full border border-black bg-transparent p-3 text-lg" value={priceEth} onChange={e=>{setPriceEth(e.target.value);setPrepared(null)}} /></label><label className="text-xs uppercase">Duration (days)<input type="number" min={1} max={30} className="mt-2 block w-full border border-black bg-transparent p-3 text-lg" value={days} onChange={e=>{setDays(Number(e.target.value));setPrepared(null)}}/></label></div><button disabled={!canAct||!selectedNft||busy} onClick={()=>void prepare()} className="mt-5 w-full bg-black px-6 py-4 text-sm uppercase text-[#ccff00] disabled:opacity-30">Prepare listing</button>
 {prepared&&<div className="mt-6 border-t border-black pt-5"><h3 className="text-xl">Review order</h3><p className="mt-3 break-all text-xs">Order hash: {prepared.orderHash}</p><p className="mt-2 text-sm">Price: {formatEther(BigInt(prepared.priceWei))} ETH</p><p className="mt-2 text-sm">Marketplace + creator fees: {formatEther(BigInt(prepared.royaltyWei))} ETH ({prepared.royaltyRecipient})</p><p className="mt-2 text-sm">To HoodWallet: {formatEther(BigInt(prepared.sellerWei))} ETH</p><p className="mt-3 text-xs">NFT approval: {prepared.approval?'Required (one transaction)':'Already approved (no listing transaction)'} · Order authorization: wallet signature, no gas. Cancel any previously validated order before making a new listing.</p><p className="mt-3 text-xs">OpenSea prepares the fees, restricted Signed Zone and conduit. Review them before signing. Listings are not confirmed until accepted by OpenSea.</p><button disabled={busy||!canAct} onClick={()=>void publish()} className="mt-5 w-full bg-black px-6 py-4 text-sm uppercase text-[#ccff00] disabled:opacity-30">Sign + list on OpenSea</button></div>}</section>
 <section className="border border-black p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl">03 / MY OPENSEA LISTINGS</h2><p className="mt-2 text-xs">Cancel an order or change its price directly from this HoodWallet. Price changes cancel the old order before you create a new one.</p></div><button type="button" className="border border-black px-4 py-3 text-xs uppercase disabled:opacity-30" disabled={!active||busy} onClick={()=>void refresh()}> {busy?'Working…':'Refresh listings'}</button></div>
{marketOrders!==null&&(marketOrders.listings?.length? <div className="mt-5 space-y-3">{marketOrders.listings.map((o,index)=>{
 const nft=marketplaceNft(o);const hash=o.order_hash||'';const match=nft?inventory.find(n=>sameAddress(n.contract,nft.contract)&&n.tokenId===nft.tokenId):undefined;
 const artworkNft:WalletNft|undefined=nft?match||{contract:nft.contract,tokenId:nft.tokenId,name:o.asset?.name||`NFT #${nft.tokenId}`,collectionName:'OpenSea',kind:'erc721',trusted:true,spam:false,balance:'1',image:o.asset?.image_url}:undefined;
 const price=orderPriceEth(o);const isEditing=editing?.orderHash===hash;
 return <article key={hash||index} className="border border-black p-3"><div className="flex gap-3 sm:gap-4"><div className="h-20 w-20 shrink-0 overflow-hidden border border-black bg-black sm:h-24 sm:w-24">{artworkNft?<NftPreview nft={artworkNft}/>:<div className="p-2 text-xs text-[#ccff00]">No artwork</div>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold">{match?.name||o.asset?.name||(nft?`NFT #${nft.tokenId}`:'NFT')}</p><p className="mt-1 text-[10px] opacity-70">{match?.collectionName||'OpenSea'}{nft?` · #${nft.tokenId}`:''}</p></div><p className="shrink-0 text-base font-bold">{price} ETH</p></div><p className="mt-2 break-all text-[10px] opacity-60">Order {shortHash(hash)}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!canAct||busy||!nft||price==='—'} onClick={()=>{setEditing({orderHash:hash,contract:nft!.contract,tokenId:nft!.tokenId,name:match?.name||o.asset?.name||`NFT #${nft!.tokenId}`,priceEth:price});setChangePrice(price);setError('')}} className="border border-black px-3 py-2 text-[11px] uppercase disabled:opacity-30">Change price</button><button type="button" disabled={!canAct||busy||!hash} onClick={()=>{if(window.confirm('Cancel this OpenSea listing on-chain? This costs gas and cannot be undone.'))void cancelMarketplace(o);}} className="bg-black px-3 py-2 text-[11px] uppercase text-[#ccff00] disabled:opacity-30">Cancel listing</button>{nft&&<a href={`https://opensea.io/item/robinhood/${nft.contract}/${encodeURIComponent(nft.tokenId)}`} target="_blank" rel="noreferrer" className="border border-black px-3 py-2 text-[11px] uppercase">OpenSea ↗</a>}</div></div></div>
{isEditing&&<div className="mt-4 border-t border-black pt-3"><label className="block text-xs uppercase">New price (ETH)<input inputMode="decimal" value={changePrice} onChange={e=>setChangePrice(e.target.value)} className="mt-2 w-full max-w-xs border border-black bg-transparent px-3 py-2 text-base" /></label><p className="mt-2 text-xs">This first cancels the existing order on-chain. You will then review and sign a new listing at the new price.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy||!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(changePrice)||Number(changePrice)<=0} onClick={()=>{if(window.confirm(`Cancel old listing and prepare a new price of ${changePrice} ETH?`))void cancelMarketplace(o,changePrice)}} className="bg-black px-4 py-2 text-xs uppercase text-[#ccff00] disabled:opacity-30">Cancel old + change price</button><button type="button" onClick={()=>setEditing(null)} className="border border-black px-4 py-2 text-xs uppercase">Keep current listing</button></div></div>}</article>})}</div>:<p className="mt-4 border border-black p-4 text-xs">No active OpenSea listings found for this HoodWallet.</p>)}
</section></div>}
 {message&&<p className="mt-6 border border-black p-4 text-sm">{message}</p>}{error&&<p className="mt-6 border border-black p-4 text-sm">⚠ {error}</p>}</section><SiteFooter/></main>;
}
