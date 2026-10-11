"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, JsonRpcProvider, formatEther, getAddress, isAddress, parseEther, isHexString } from "ethers";
import type { Address, Hex } from "viem";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { useWallet } from "../../../components/WalletProvider";
import { siteConfig } from "../../../lib/config";
import { apiConfig, collectionApiUrl } from "../../../lib/api";

const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);
const HOOD_OS_ABI = [
  "function delegationContract() view returns (address)",
  "function delegationEnabled() view returns (bool)",
  "function hoodInfo(uint256 tokenId) view returns (tuple(uint256 tokenId,address owner,address wallet,bool walletDeployed,bool active,address activationOwner,uint64 activatedAt,uint256 walletState,uint256 nativeBalance,uint256 paymentTokenBalance) info)",
] as const;
const DELEGATION_ABI = [
  "function hoodies() view returns (address)",
  "function grantOpenCapability(uint256 tokenId,address delegate,uint256 maxNativeValue,uint64 expiresAt)",
  "function revokeOpenCapability(uint256 tokenId,address delegate)",
  "function getOpenCapability(uint256 tokenId,address owner,address delegate) view returns (tuple(bool active,uint64 expiresAt,uint256 maxNativeValue))",
  "function grantTargetCapability(uint256 tokenId,address delegate,address target,uint256 maxNativeValue,uint64 expiresAt)",
  "function revokeTargetCapability(uint256 tokenId,address delegate,address target)",
  "function getTargetCapability(uint256 tokenId,address owner,address delegate,address target) view returns (tuple(bool active,uint64 expiresAt,uint256 maxNativeValue))",
  "function grantSelectorCapability(uint256 tokenId,address delegate,address target,bytes4 selector,uint256 maxNativeValue,uint64 expiresAt)",
  "function revokeSelectorCapability(uint256 tokenId,address delegate,address target,bytes4 selector)",
  "function getSelectorCapability(uint256 tokenId,address owner,address delegate,address target,bytes4 selector) view returns (tuple(bool active,uint64 expiresAt,uint256 maxNativeValue))",
  "function grantExactCapability(uint256 tokenId,address delegate,address target,bytes data,uint256 maxNativeValue,uint64 expiresAt)",
  "function revokeExactCapability(uint256 tokenId,address delegate,address target,bytes data)",
  "function getExactCapability(uint256 tokenId,address owner,address delegate,address target,bytes data) view returns (tuple(bool active,uint64 expiresAt,uint256 maxNativeValue))",
] as const;
const WRITE_ABI = [
  {type:"function",name:"grantOpenCapability",stateMutability:"nonpayable",inputs:[{name:"tokenId",type:"uint256"},{name:"delegate",type:"address"},{name:"maxNativeValue",type:"uint256"},{name:"expiresAt",type:"uint64"}],outputs:[]},
  {type:"function",name:"revokeOpenCapability",stateMutability:"nonpayable",inputs:[{name:"tokenId",type:"uint256"},{name:"delegate",type:"address"}],outputs:[]},
  {type:"function",name:"grantTargetCapability",stateMutability:"nonpayable",inputs:[{name:"tokenId",type:"uint256"},{name:"delegate",type:"address"},{name:"target",type:"address"},{name:"maxNativeValue",type:"uint256"},{name:"expiresAt",type:"uint64"}],outputs:[]},
  {type:"function",name:"revokeTargetCapability",stateMutability:"nonpayable",inputs:[{name:"tokenId",type:"uint256"},{name:"delegate",type:"address"},{name:"target",type:"address"}],outputs:[]},
  {type:"function",name:"grantSelectorCapability",stateMutability:"nonpayable",inputs:[{name:"tokenId",type:"uint256"},{name:"delegate",type:"address"},{name:"target",type:"address"},{name:"selector",type:"bytes4"},{name:"maxNativeValue",type:"uint256"},{name:"expiresAt",type:"uint64"}],outputs:[]},
  {type:"function",name:"revokeSelectorCapability",stateMutability:"nonpayable",inputs:[{name:"tokenId",type:"uint256"},{name:"delegate",type:"address"},{name:"target",type:"address"},{name:"selector",type:"bytes4"}],outputs:[]},
  {type:"function",name:"grantExactCapability",stateMutability:"nonpayable",inputs:[{name:"tokenId",type:"uint256"},{name:"delegate",type:"address"},{name:"target",type:"address"},{name:"data",type:"bytes"},{name:"maxNativeValue",type:"uint256"},{name:"expiresAt",type:"uint64"}],outputs:[]},
  {type:"function",name:"revokeExactCapability",stateMutability:"nonpayable",inputs:[{name:"tokenId",type:"uint256"},{name:"delegate",type:"address"},{name:"target",type:"address"},{name:"data",type:"bytes"}],outputs:[]},
] as const;

type Scope = "open" | "target" | "selector" | "exact";
type OwnedHoodie = {tokenId:string;name:string;image?:string};
type Capability = {active:boolean;expiresAt:number;maxNativeValue:bigint};
type WalletInfo = {owner:string;wallet:string;active:boolean;walletDeployed:boolean};
const classInput = "w-full border border-black bg-[#ccff00] px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-black";
const classLabel = "mb-2 block text-[8px] uppercase tracking-[0.13em]";
function errMessage(error:unknown):string {if(error && typeof error === "object"){const e=error as {shortMessage?:string;message?:string;cause?:{shortMessage?:string}};return e.shortMessage||e.cause?.shortMessage||e.message||"Transaction failed";}return String(error);}
function fmtDate(seconds:number){return seconds ? new Date(seconds*1000).toLocaleString():"No expiry";}
function shortAddress(address:string){return `${address.slice(0,6)}...${address.slice(-4)}`;}
function capFrom(result:{active:boolean;expiresAt:bigint;maxNativeValue:bigint}):Capability{return {active:Boolean(result.active),expiresAt:Number(result.expiresAt),maxNativeValue:BigInt(result.maxNativeValue)};}
function artwork(id:string){return apiConfig.isMainnet ? collectionApiUrl(`/images/${encodeURIComponent(id)}.svg`):`/api/hoodies/image?tokenId=${encodeURIComponent(id)}`;}

export default function DelegateOSPage(){
  const {address,connect,ensureRequiredNetwork,getWalletClient}=useWallet();
  const provider=useMemo(()=>siteConfig.rpcUrl?new JsonRpcProvider(siteConfig.rpcUrl,Number(siteConfig.chainId),{staticNetwork:true}):null,[]);
  const [owned,setOwned]=useState<OwnedHoodie[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [ownershipLoading,setOwnershipLoading]=useState(false);
  const [walletInfo,setWalletInfo]=useState<WalletInfo|null>(null);
  const [delegationAddress,setDelegationAddress]=useState("");
  const [delegationEnabled,setDelegationEnabled]=useState(false);
  const [contractReady,setContractReady]=useState(false);
  const [delegate,setDelegate]=useState("");
  const [scope,setScope]=useState<Scope>("open");
  const [duration,setDuration]=useState("7");
  const [target,setTarget]=useState("");
  const [selector,setSelector]=useState("");
  const [calldata,setCalldata]=useState("0x");
  const [limitMode,setLimitMode]=useState<"zero"|"custom"|"unlimited">("unlimited");
  const [maxEth,setMaxEth]=useState("0.01");
  const [capability,setCapability]=useState<Capability|null>(null);
  const [capLoading,setCapLoading]=useState(false);
  const [confirmedRisk,setConfirmedRisk]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [now,setNow]=useState(()=>Math.floor(Date.now()/1000));
  useEffect(()=>{const id=window.setInterval(()=>setNow(Math.floor(Date.now()/1000)),15000);return ()=>window.clearInterval(id);},[]);

  const loadOwned=useCallback(async()=>{
    if(!address){setOwned([]);setSelectedId("");return;}
    setOwnershipLoading(true);
    try{
      const response=await fetch(`/api/hoodies?${new URLSearchParams({owner:address})}`,{cache:"no-store"});
      const data=await response.json() as {items?:OwnedHoodie[];error?:string};
      if(!response.ok) throw new Error(data.error||"Failed to fetch Hoodies");
      const rows=Array.from(new Map((data.items||[]).map(item=>[String(item.tokenId),{...item,tokenId:String(item.tokenId)}])).values());
      rows.sort((a,b)=>BigInt(a.tokenId)<BigInt(b.tokenId)?-1:BigInt(a.tokenId)>BigInt(b.tokenId)?1:0);
      setOwned(rows);setSelectedId(prev=>rows.some(row=>row.tokenId===prev)?prev:(rows[0]?.tokenId||""));
    }catch(e){setOwned([]);setSelectedId("");setError(errMessage(e));}
    finally{setOwnershipLoading(false);}
  },[address]);
  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(!cancelled)void loadOwned();});return ()=>{cancelled=true;};},[loadOwned]);

  const loadConfiguration=useCallback(async()=>{
    if(!provider)return;
    setContractReady(false);
    try{
      const os=new Contract(siteConfig.hoodOSAddress,HOOD_OS_ABI,provider);
      const [configured,enabled]=await Promise.all([os.delegationContract() as Promise<string>,os.delegationEnabled() as Promise<boolean>]);
      setDelegationAddress(configured);setDelegationEnabled(Boolean(enabled));
      if(configured==="0x0000000000000000000000000000000000000000")throw new Error("HoodOS does not have a delegation contract configured yet.");
      const delegation=new Contract(configured,DELEGATION_ABI,provider);
      const collection=await delegation.hoodies() as string;
      if(collection.toLowerCase()!=="0x9ec6c5b9f572a9b02138e553bc5f5882da735f45")throw new Error("Delegation contract is not bound to the expected OnChainHoodies collection.");
      setContractReady(true);
    }catch(e){setError(`Delegation configuration: ${errMessage(e)}`);}
  },[provider]);
  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(!cancelled)void loadConfiguration();});return ()=>{cancelled=true;};},[loadConfiguration]);

  const loadWalletInfo=useCallback(async()=>{
    if(!provider||!selectedId){setWalletInfo(null);return;}
    try{
      const os=new Contract(siteConfig.hoodOSAddress,HOOD_OS_ABI,provider);
      const info=await os.hoodInfo(BigInt(selectedId));
      setWalletInfo({owner:String(info.owner),wallet:String(info.wallet),active:Boolean(info.active),walletDeployed:Boolean(info.walletDeployed)});
    }catch(e){setWalletInfo(null);setError(`HoodWallet: ${errMessage(e)}`);}
  },[provider,selectedId]);
  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(!cancelled)void loadWalletInfo();});return ()=>{cancelled=true;};},[loadWalletInfo]);
  const validDelegate=isAddress(delegate)&&getAddress(delegate)!=="0x0000000000000000000000000000000000000000";
  const validTarget=isAddress(target)&&getAddress(target)!=="0x0000000000000000000000000000000000000000";
  const validSelector=/^0x[0-9a-fA-F]{8}$/.test(selector)&&selector.toLowerCase()!=="0x00000000";
  const validData=isHexString(calldata)&&calldata.length%2===0;
  const scopeInputsValid=scope==="open"||(validTarget&&(scope==="target"||(scope==="selector"?validSelector:validData)));
  const ownerMatch=Boolean(address&&walletInfo?.owner.toLowerCase()===address.toLowerCase());

  const loadCapability=useCallback(async()=>{
    if(!provider||!selectedId||!walletInfo||!delegationAddress||!contractReady||!validDelegate||!scopeInputsValid){setCapability(null);return;}
    setCapLoading(true);
    try{
      const contract=new Contract(delegationAddress,DELEGATION_ABI,provider);
      const common=[BigInt(selectedId),walletInfo.owner,getAddress(delegate)] as const;
      let item;
      if(scope==="open")item=await contract.getOpenCapability(...common);
      else if(scope==="target")item=await contract.getTargetCapability(...common,getAddress(target));
      else if(scope==="selector")item=await contract.getSelectorCapability(...common,getAddress(target),selector);
      else item=await contract.getExactCapability(...common,getAddress(target),calldata);
      setCapability(capFrom(item));
    }catch(e){setCapability(null);setError(`Capability check: ${errMessage(e)}`);}
    finally{setCapLoading(false);}
  },[provider,selectedId,walletInfo,delegationAddress,contractReady,validDelegate,scopeInputsValid,delegate,scope,target,selector,calldata]);
  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(!cancelled)void loadCapability();});return ()=>{cancelled=true;};},[loadCapability]);

  const maxNativeValue=useMemo(()=>{try{return limitMode==="unlimited"?MAX_UINT256:limitMode==="zero"?BigInt(0):parseEther(maxEth);}catch{return null;}},[limitMode,maxEth]);
  const highRisk=scope==="open" || limitMode==="unlimited";
  const canGrant=Boolean(address&&ownerMatch&&selectedId&&walletInfo?.active&&delegationEnabled&&contractReady&&validDelegate&&scopeInputsValid&&maxNativeValue!==null&&maxNativeValue>=BigInt(0)&&(limitMode!=="custom"||Number(maxEth)>=0)&&(!highRisk||confirmedRisk)&&!busy);
  async function transact(revoke:boolean){
    if(!address||!ownerMatch||!selectedId||!contractReady||!validDelegate||!scopeInputsValid||!delegationAddress||(!revoke&&(!walletInfo?.active||!delegationEnabled))) {setError("Confirm ownership, delegate, and delegation settings first. Granting also requires an active wallet and enabled delegation.");return;}
    if(!revoke&&(maxNativeValue===null||maxNativeValue<BigInt(0)||(highRisk&&!confirmedRisk))){setError("Confirm the permission risks and valid ETH limit.");return;}
    setBusy(true);setError("");setSuccess("");
    try{
      await ensureRequiredNetwork();
      const client=await getWalletClient();
      if(!client.account)throw new Error("Wallet account unavailable.");
      if(client.account.address.toLowerCase()!==address.toLowerCase())throw new Error("Connected signer changed; reconnect the owner wallet.");
      const id=BigInt(selectedId);const d=getAddress(delegate) as Address;
      const t=getAddress(validTarget?target:"0x0000000000000000000000000000000000000001") as Address;
      const expiry=BigInt(Math.floor(Date.now()/1000)+Number(duration)*86400);
      const limit=maxNativeValue??BigInt(0);
      let functionName:typeof WRITE_ABI[number]["name"];
      let args:readonly unknown[];
      if(scope==="open") {functionName=revoke?"revokeOpenCapability":"grantOpenCapability";args=revoke?[id,d]:[id,d,limit,expiry];}
      else if(scope==="target"){functionName=revoke?"revokeTargetCapability":"grantTargetCapability";args=revoke?[id,d,t]:[id,d,t,limit,expiry];}
      else if(scope==="selector"){functionName=revoke?"revokeSelectorCapability":"grantSelectorCapability";args=revoke?[id,d,t,selector as Hex]:[id,d,t,selector as Hex,limit,expiry];}
      else {functionName=revoke?"revokeExactCapability":"grantExactCapability";args=revoke?[id,d,t,calldata as Hex]:[id,d,t,calldata as Hex,limit,expiry];}
      // Runtime ABI is chosen from a fixed whitelist of grant/revoke functions.
      const hash=await client.writeContract({chain:null,address:delegationAddress as Address,abi:WRITE_ABI,functionName,args:args as never,account:client.account});
      if(!provider)throw new Error("RPC unavailable");
      const receipt=await provider.waitForTransaction(hash,1);
      if(!receipt||receipt.status!==1)throw new Error("Transaction reverted or not confirmed");
      setSuccess(`${revoke?"Revoked":"Granted"} ${scope} capability for Hoodie #${selectedId}. Tx: ${hash}`);
      await loadCapability();
    }catch(e){setError(errMessage(e));}
    finally{setBusy(false);}
  }
  const preset=[{id:"open",title:"Full access",subtitle:"Any contract, any action"},{id:"target",title:"One app",subtitle:"Any action on one contract"},{id:"selector",title:"One function",subtitle:"Specific contract + function"},{id:"exact",title:"One exact call",subtitle:"Specific calldata only"}] as const;
  const capLive=Boolean(capability?.active && (!capability.expiresAt || capability.expiresAt>now));
  return <main className="min-h-screen bg-[#ccff00] text-black"><SiteHeader/><section className="mx-auto max-w-[1360px] px-4 pb-24 pt-20 md:px-6 md:pt-24">
    <div className="flex items-center justify-between border-b border-black pb-3"><p className="text-[9px] uppercase tracking-[0.16em]">OnChainHoodies / HoodOS / DelegateOS</p><Link href="/hoodos" className="text-[8px] uppercase underline underline-offset-4">Back to HoodOS</Link></div>
    <div className="grid gap-8 border-b border-black py-12 lg:grid-cols-[1fr_0.8fr] lg:items-end"><div><p className="text-[9px] uppercase tracking-[0.2em] opacity-50">HoodOS / Agents & Permissions</p><h1 className="mt-6 text-[clamp(4rem,10vw,8rem)] leading-[0.78] tracking-[-0.08em]">DELEGATE<br/>OS</h1></div><div><h2 className="text-3xl leading-[0.95] tracking-[-0.05em] md:text-5xl">LET AGENTS<br/>BUILD.</h2><p className="mt-5 max-w-lg text-base opacity-70">Give another wallet permission to operate your Hoodie, for a limited time. Your Hoodie stays yours.</p></div></div>
    {!address?<div className="mt-8 border border-black p-8 text-center"><h2 className="text-3xl">CONNECT YOUR WALLET</h2><button type="button" className="mt-6 bg-black px-8 py-4 text-[9px] uppercase text-[#ccff00]" onClick={()=>void connect()}>Connect wallet</button></div>:<div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-7">
        <section className="border border-black p-5 md:p-7"><p className="text-[8px] uppercase opacity-50">01 / Hoodie</p><h2 className="mt-2 text-2xl">Choose your Hoodie.</h2>{ownershipLoading?<p className="mt-5 text-sm">Loading your Hoodies…</p>:owned.length===0?<p className="mt-5 text-sm">No Hoodies found for this wallet.</p>:<div className="mt-5 flex items-center gap-4"><div className="h-20 w-20 shrink-0 overflow-hidden border border-black bg-black">{selectedId&&<Image src={artwork(selectedId)} alt={`Hoodie #${selectedId}`} width={80} height={80} unoptimized className="h-full w-full object-cover image-render-pixel"/>}</div><div className="min-w-0 flex-1"><label htmlFor="delegateos-hoodie" className={classLabel}>Hoodie ID</label><select id="delegateos-hoodie" className={classInput} value={selectedId} onChange={e=>{setSelectedId(e.target.value);setConfirmedRisk(false);}}>{owned.map(h=><option key={h.tokenId} value={h.tokenId}>Hoodie #{h.tokenId}</option>)}</select></div></div>}{walletInfo&&<div className="mt-4 flex flex-wrap gap-3 text-[8px] uppercase"><span>{walletInfo.active?"● Activated":"○ Inactive"}</span><span>Wallet: {shortAddress(walletInfo.wallet)}</span><span>{ownerMatch?"● Owner connected":"○ Owner mismatch"}</span></div>}{walletInfo&&!walletInfo.active&&<p className="mt-3 text-sm">Activate this Hoodie in <Link href="/hoodwallet" className="underline">HoodWallet</Link> before granting usable agent permissions.</p>}</section>
        <section className="border border-black p-5 md:p-7"><p className="text-[8px] uppercase opacity-50">02 / Delegate</p><h2 className="mt-2 text-2xl">Who can operate it?</h2><label htmlFor="delegateos-delegate" className={`${classLabel} mt-5`}>Delegate wallet address</label><input id="delegateos-delegate" spellCheck={false} className={classInput} value={delegate} onChange={e=>{setDelegate(e.target.value);setConfirmedRisk(false);}} placeholder="0x..."/><p className="mt-3 text-[8px] leading-relaxed opacity-60">Enter the wallet address you want to authorize. This can be another wallet you control or an agent&apos;s transaction-signing address. Only the address entered here receives permission.</p></section>
        <section className="border border-black p-5 md:p-7"><p className="text-[8px] uppercase opacity-50">03 / Permission preset</p><h2 className="mt-2 text-2xl">Choose what it can do.</h2><div className="mt-5 grid gap-2 sm:grid-cols-2">{preset.map(p=><button key={p.id} type="button" onClick={()=>{setScope(p.id);setConfirmedRisk(false);}} className={`border border-black p-4 text-left transition-colors ${scope===p.id?"bg-black text-[#ccff00]":"hover:bg-black hover:text-[#ccff00]"}`}><span className="block text-sm font-semibold">{p.title}</span><span className="mt-2 block text-[8px] opacity-75">{p.subtitle}</span></button>)}</div>{scope!=="open"&&<div className="mt-5 space-y-4"><div><label htmlFor="delegateos-target" className={classLabel}>Allowed target contract</label><input id="delegateos-target" value={target} onChange={e=>setTarget(e.target.value)} spellCheck={false} className={classInput} placeholder="0x..."/></div>{scope==="selector"&&<div><label htmlFor="delegateos-selector" className={classLabel}>4-byte function selector</label><input id="delegateos-selector" value={selector} onChange={e=>setSelector(e.target.value)} spellCheck={false} className={classInput} placeholder="0xa9059cbb"/></div>}{scope==="exact"&&<div><label htmlFor="delegateos-data" className={classLabel}>Exact calldata (hex)</label><textarea id="delegateos-data" rows={3} value={calldata} onChange={e=>setCalldata(e.target.value)} className={classInput} spellCheck={false}/></div>}</div>}</section>
        <section className="border border-black p-5 md:p-7"><p className="text-[8px] uppercase opacity-50">04 / Time & value limit</p><h2 className="mt-2 text-2xl">Set the boundaries.</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><label htmlFor="delegateos-duration" className={classLabel}>Expires after</label><select id="delegateos-duration" value={duration} onChange={e=>setDuration(e.target.value)} className={classInput}><option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option></select></div><div><label htmlFor="delegateos-value" className={classLabel}>ETH forwarded per call</label><select id="delegateos-value" value={limitMode} onChange={e=>{setLimitMode(e.target.value as "zero"|"custom"|"unlimited");setConfirmedRisk(false);}} className={classInput}><option value="zero">0 ETH (token operations allowed)</option><option value="custom">Custom ETH limit</option><option value="unlimited">Unlimited ETH per call</option></select></div></div>{limitMode==="custom"&&<div className="mt-4"><label htmlFor="delegateos-eth" className={classLabel}>Maximum ETH per execution</label><input id="delegateos-eth" value={maxEth} onChange={e=>setMaxEth(e.target.value)} className={classInput} inputMode="decimal" placeholder="0.01"/></div>}<p className="mt-4 text-[8px] leading-relaxed opacity-70">ETH limit applies to each execution, not to total spending. A 0 ETH limit does <strong>not</strong> restrict ERC-20 or NFT transfers, approvals, or asset withdrawals through contract calls.</p></section>
        {highRisk&&<section className="border-2 border-black p-5"><p className="text-[9px] font-semibold uppercase">High-risk permission</p><p className="mt-3 text-sm leading-relaxed">{scope==="open"?"Full access permits calls to ANY contract, including transferring and approving all tokens and NFTs from the HoodWallet. ":""}{limitMode==="unlimited"?"There is no ETH-per-call cap. ":""}Expiry does not undo transfers or approvals made before it ends. Only delegate a wallet you fully trust.</p><label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmedRisk} onChange={e=>setConfirmedRisk(e.target.checked)} className="mt-1 h-4 w-4 accent-black"/><span>I understand that the delegate can move or approve assets, and I accept this risk.</span></label></section>}
        <section className="border border-black p-5 md:p-7"><p className="text-[8px] uppercase opacity-50">05 / On-chain permission</p><h2 className="mt-2 text-2xl">Grant or revoke.</h2><p className="mt-3 text-sm opacity-75">The connected NFT owner signs directly with their wallet. No backend, admin approval or extra contract is required.</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={!canGrant} onClick={()=>void transact(false)} className="bg-black px-6 py-4 text-[9px] uppercase text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-25">{busy?"Waiting for wallet…":`Grant ${scope} access`}</button><button type="button" disabled={busy||!ownerMatch||!contractReady||!validDelegate||!scopeInputsValid||!capability?.active} onClick={()=>void transact(true)} className="border border-black px-6 py-4 text-[9px] uppercase disabled:opacity-25">Revoke this capability</button></div><p className="mt-4 text-[8px] opacity-60">Grant replaces an existing capability of the same type and key. Revoke removes only the exact permission currently selected above.</p></section>
      </div>
      <aside className="space-y-5"><section className="border border-black p-5"><p className="text-[8px] uppercase opacity-50">HoodOS health</p><h3 className="mt-3 text-2xl">Permission engine</h3><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-3"><span>Delegation contract</span><span>{contractReady?"Detected":"Unavailable"}</span></div><div className="flex justify-between gap-3"><span>HoodOS delegation</span><span>{delegationEnabled?"Enabled":"Disabled"}</span></div><div className="flex justify-between gap-3"><span>HoodWallet</span><span>{walletInfo?.active?"Active":"Not active"}</span></div></div>{delegationAddress&&<a href={`https://robin.etherscan.io/address/${delegationAddress}#code`} target="_blank" rel="noreferrer" className="mt-5 block break-all text-[8px] underline">{delegationAddress}</a>}{!delegationEnabled&&<p className="mt-4 text-[8px]">HoodOS delegation is disabled. Permissions cannot be used until an admin enables it.</p>}</section>
      <section className="border border-black p-5"><p className="text-[8px] uppercase opacity-50">Selected capability</p><h3 className="mt-3 text-2xl">Current status</h3>{capLoading?<p className="mt-4 text-sm">Checking on-chain…</p>:capability?<div className="mt-4 space-y-3 text-sm"><p className="text-lg">{capLive?"● Active":capability.active?"○ Expired":"○ Not granted"}</p><p>Expires: {fmtDate(capability.expiresAt)}</p><p>Max ETH per call: {capability.maxNativeValue===MAX_UINT256?"Unlimited":formatEther(capability.maxNativeValue)}</p></div>:<p className="mt-4 text-sm">Enter valid capability details to check its on-chain status.</p>}<button type="button" onClick={()=>void loadCapability()} disabled={capLoading} className="mt-5 border border-black px-4 py-3 text-[8px] uppercase disabled:opacity-40">Refresh status</button></section>
      <section className="border border-black p-5"><p className="text-[8px] uppercase opacity-50">A note about ownership</p><p className="mt-3 text-sm leading-relaxed">Your Hoodie remains in your wallet. Transfer of the Hoodie invalidates permissions granted by its previous owner. HoodOS activation and global delegation settings still apply.</p></section></aside>
    </div>}
    {success&&<div role="status" className="mt-7 border border-black bg-black p-4 text-sm text-[#ccff00] break-all">{success}</div>}{error&&<div role="alert" className="mt-7 border-2 border-black p-4 text-sm break-words">{error}</div>}
  </section><SiteFooter/></main>;
}
