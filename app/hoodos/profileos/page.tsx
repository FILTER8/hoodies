'use client';
import {useCallback,useEffect,useMemo,useRef,useState, type PointerEvent as ReactPointerEvent, type RefObject} from 'react';
import Link from 'next/link';
/* eslint-disable @next/next/no-img-element -- Canvas/data URL previews and pixelated SVG require unoptimized rendering. */
import {Contract,JsonRpcProvider,hashMessage} from 'ethers';
import SiteHeader from '../../../components/SiteHeader';
import SiteFooter from '../../../components/SiteFooter';
import {useWallet} from '../../../components/WalletProvider';
import {siteConfig} from '../../../lib/config';
import {collectionApiUrl} from '../../../lib/api';

const HOODOS_ABI=['function hoodInfo(uint256) view returns (tuple(uint256 tokenId,address owner,address wallet,bool walletDeployed,bool active,address activationOwner,uint64 activatedAt,uint256 walletState,uint256 nativeBalance,uint256 paymentTokenBalance) info)'];
const ERC1271=['function isValidSignature(bytes32 hash,bytes signature) view returns (bytes4)'];
const SIWE_STATEMENT='Click to sign in and accept the Platform Terms of Service (https://opensea.io/tos) and Privacy Policy (https://opensea.io/privacy).';
type Hoodie={tokenId:string;name:string};
type Profile={ok:boolean;exists?:boolean;displayName?:string;bio?:string;externalUrl?:string;username?:string;profileImageUrl?:string;bannerImageUrl?:string;error?:string};
type Result={username?:string;usernameClaimed?:boolean;ok:boolean;error?:string;status?:number;details?:string;stage?:string;profileUpdated?:boolean;displayName?:string;readBack?:string|null;readBackMatches?:boolean;profileImageUrl?:string|null};
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
async function api<T>(url:string,body:unknown):Promise<T>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||`HTTP ${r.status}`);return j as T;}
async function pngFromArtwork(url:string):Promise<string>{
 const img=new window.Image();img.decoding='async';
 await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Could not load Hoodie SVG from artwork API'));img.src=url;});
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
 ctx.imageSmoothingEnabled=false;ctx.fillStyle='#000000';ctx.fillRect(0,0,512,512);ctx.drawImage(img,0,0,512,512);
 return canvas.toDataURL('image/png');
}
async function pngFromFile(file:File):Promise<string>{
 if(file.type!=='image/png'||file.size>2_000_000)throw Error('Upload a PNG under 2 MB');
 return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Cannot read PNG'));reader.readAsDataURL(file);});
}
type PixelStroke={size:number;color:string;points:Array<[number,number]>};
function BannerEditor({canvasRef,quote,onPreview}:{canvasRef:RefObject<HTMLCanvasElement|null>;quote:string;onPreview:(image:string)=>void}){
 const [background,setBackground]=useState<'black'|'green'>('black');
 const [showQuote,setShowQuote]=useState(true);
 const [brush,setBrush]=useState(3);
 const [paint,setPaint]=useState<'#000000'|'#ccff00'>('#ccff00');
 const [strokes,setStrokes]=useState<PixelStroke[]>([]);
 const drawing=useRef(false);
 const point=(event:ReactPointerEvent<HTMLCanvasElement>):[number,number]=>{
  const rect=event.currentTarget.getBoundingClientRect();
  return [Math.max(0,Math.min(299,Math.floor((event.clientX-rect.left)/rect.width*300))),Math.max(0,Math.min(74,Math.floor((event.clientY-rect.top)/rect.height*75)))];
 };
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  const bg=background==='black'?'#000000':'#ccff00';const fg=background==='black'?'#ccff00':'#000000';
  ctx.clearRect(0,0,1200,300);ctx.fillStyle=bg;ctx.fillRect(0,0,1200,300);
  ctx.imageSmoothingEnabled=false;
  // Center the quote inside OpenSea's narrow mobile banner crop.
  // No additional title or URL text is printed on the banner.
  if(showQuote && quote.trim()){
   ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';
   const words=quote.replace(/^[“"]|[”"]$/g,'').trim().toUpperCase().split(/\s+/).filter(Boolean);
   const maxTextWidth=610;
   const maxTextHeight=218;
   let lines:string[]=[];let fontSize=52;
   for(;fontSize>=17;fontSize-=1){
    ctx.font=`${fontSize}px DepartureMono, monospace`;
    const proposed:string[]=[];let line='';
    for(const word of words){
     const candidate=line?`${line} ${word}`:word;
     if(ctx.measureText(candidate).width>maxTextWidth && line){proposed.push(line);line=word;}else line=candidate;
    }
    if(line)proposed.push(line);
    if(proposed.every(v=>ctx.measureText(v).width<=maxTextWidth)&&proposed.length*(fontSize*1.2)<=maxTextHeight){lines=proposed;break;}
   }
   // Extremely long quotes still stay inside the banner instead of clipping.
   if(!lines.length){
    ctx.font='17px DepartureMono, monospace';
    lines=[];let line='';
    for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>maxTextWidth&&line){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);
    lines=lines.slice(0,9);
   }
   const lineHeight=fontSize*1.2;
   const top=150-((lines.length-1)*lineHeight)/2;
   lines.forEach((line,i)=>ctx.fillText(line,600,top+i*lineHeight,maxTextWidth));
  }
  for(const stroke of strokes){ctx.fillStyle=stroke.color;for(const [x,y] of stroke.points){const size=stroke.size*4;ctx.fillRect(x*4-Math.floor(size/2),y*4-Math.floor(size/2),size,size);}}
  onPreview(canvas.toDataURL('image/png'));
 },[background,showQuote,canvasRef,quote,strokes,onPreview]);
 function start(e:ReactPointerEvent<HTMLCanvasElement>){e.preventDefault();const p=point(e);drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);setStrokes(old=>[...old,{color:paint,size:brush,points:[p]}]);}
 function move(e:ReactPointerEvent<HTMLCanvasElement>){if(!drawing.current)return;const p=point(e);setStrokes(old=>{if(!old.length)return old;const copy=old.slice(),last=copy[copy.length-1],prev=last.points[last.points.length-1];if(prev[0]===p[0]&&prev[1]===p[1])return old;const points=last.points.slice();const steps=Math.max(Math.abs(p[0]-prev[0]),Math.abs(p[1]-prev[1]));for(let i=1;i<=steps;i++)points.push([Math.round(prev[0]+(p[0]-prev[0])*i/steps),Math.round(prev[1]+(p[1]-prev[1])*i/steps)]);copy[copy.length-1]={...last,points};return copy;});}
 function stop(){drawing.current=false;}
 const btn='border border-black px-3 py-2 text-[11px] uppercase disabled:opacity-30';
 return <div className="space-y-4">
  <canvas ref={canvasRef} width={1200} height={300} aria-label="Draw on your banner" className="block w-full cursor-crosshair border border-black [image-rendering:pixelated] touch-none" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}/>
  <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[11px] uppercase">Background</span><button className={`${btn} ${background==='black'?'bg-black text-[#ccff00]':''}`} onClick={()=>setBackground('black')}>Black</button><button className={`${btn} ${background==='green'?'bg-black text-[#ccff00]':''}`} onClick={()=>setBackground('green')}>Robin</button></div>
  <label className="flex w-fit items-center gap-2 text-[11px] uppercase"><input type="checkbox" checked={showQuote} onChange={e=>setShowQuote(e.target.checked)}/> Show Hood Talk on banner</label>
  <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[11px] uppercase">Draw</span>{[1,3,6].map(n=><button key={n} onClick={()=>setBrush(n)} className={`${btn} ${brush===n?'bg-black text-[#ccff00]':''}`}>{n}</button>)}<button aria-label="Black ink" title="Black ink" onClick={()=>setPaint('#000000')} className={`h-8 w-8 border-2 border-black bg-black ${paint==='#000000'?'ring-2 ring-offset-2 ring-black':''}`}/><button aria-label="Robin ink" title="Robin ink" onClick={()=>setPaint('#ccff00')} className={`h-8 w-8 border-2 border-black bg-[#ccff00] ${paint==='#ccff00'?'ring-2 ring-offset-2 ring-black':''}`}/><button className={btn} disabled={!strokes.length} onClick={()=>setStrokes(v=>v.slice(0,-1))}>Undo</button><button className={btn} disabled={!strokes.length} onClick={()=>setStrokes([])}>Clear</button></div>
  <button className="text-xs underline underline-offset-4" onClick={()=>{const canvas=canvasRef.current;if(!canvas)return;const a=document.createElement('a');a.download='onchainhoodie-banner.png';a.href=canvas.toDataURL('image/png');a.click();}}>Download banner PNG</button>
 </div>;
}

export default function ProfileOS(){
 const {address,connect,getWalletClient}=useWallet();
 const provider=useMemo(()=>siteConfig.rpcUrl?new JsonRpcProvider(siteConfig.rpcUrl,Number(siteConfig.chainId),{staticNetwork:true}):null,[]);
 const [hoodies,setHoodies]=useState<Hoodie[]>([]),[hoodieId,setHoodieId]=useState(''),[wallet,setWallet]=useState(''),[owner,setOwner]=useState(''),[active,setActive]=useState(false);
 const [profile,setProfile]=useState<Profile|null>(null),[loadingProfile,setLoadingProfile]=useState(false);
 const [name,setName]=useState(''),[bio,setBio]=useState(''),[externalUrl,setExternalUrl]=useState('');
 const [imageMode,setImageMode]=useState<'hoodie'|'keep'|'custom'>('hoodie');
 const [imageFile,setImageFile]=useState<File|null>(null),[imagePreview,setImagePreview]=useState('');
 const [username,setUsername]=useState(''),[talks,setTalks]=useState<Array<{quote:string;count:number}>>([]),[talkLoading,setTalkLoading]=useState(false);
 const bannerCanvasRef=useRef<HTMLCanvasElement|null>(null);
 const [bannerPreview,setBannerPreview]=useState(''),[previewMode,setPreviewMode]=useState<'desktop'|'mobile'>('desktop');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[remote,setRemote]=useState<Result|null>(null);
 const authorized=!!address&&owner.toLowerCase()===address.toLowerCase()&&active;
 const artworkUrl=hoodieId?`/api/profileos/artwork?tokenId=${encodeURIComponent(hoodieId)}`:'';
 const profileUrl=profile?.username?`https://opensea.io/${profile.username}`:wallet?`https://opensea.io/${wallet}`:'';
 const nameValid=/^[A-Za-z0-9_-]{1,50}$/.test(name.trim());
 const usernameValid=/^[A-Za-z0-9_-]{1,50}$/.test(username.trim());
 const setBannerImage=useCallback((value:string)=>setBannerPreview(value),[]);
 useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(!cancelled){setHoodies([]);setHoodieId('');}});if(!address)return()=>{cancelled=true;};void(async()=>{try{const r=await fetch(`/api/hoodies?owner=${encodeURIComponent(address)}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Could not load your Hoodies');if(!cancelled){const items=Array.isArray(j.items)?j.items:[];setHoodies(items);setHoodieId(v=>items.some((h:Hoodie)=>String(h.tokenId)===v)?v:String(items[0]?.tokenId||''));}}catch(e){if(!cancelled)setError(err(e));}})();return()=>{cancelled=true;}},[address]);
 useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(cancelled)return;setWallet('');setOwner('');setActive(false);setProfile(null);setRemote(null);setError('');setStatus('');setImageFile(null);setImagePreview('');setImageMode('hoodie');setBannerPreview('');setName(hoodieId?`OnchainHoodie_${hoodieId}`:'');setBio('');setExternalUrl(hoodieId?`https://onchainhoodies.xyz/hoodie/${hoodieId}`:'');setUsername(hoodieId?`OnchainHoodie_${hoodieId}`:'');setTalks([]);});if(!hoodieId||!provider)return()=>{cancelled=true;};
  void(async()=>{try{const info=await new Contract(siteConfig.hoodOSAddress,HOODOS_ABI,provider).hoodInfo(BigInt(hoodieId));if(!cancelled){setWallet(String(info.wallet));setOwner(String(info.owner));setActive(Boolean(info.active)&&Boolean(info.walletDeployed));}}catch(e){if(!cancelled)setError(err(e));}})();return()=>{cancelled=true;}},[hoodieId,provider]);
 useEffect(()=>{if(!wallet)return;let cancelled=false;void(async()=>{setLoadingProfile(true);try{const r=await fetch(`/api/profileos/verify?wallet=${encodeURIComponent(wallet)}`,{cache:'no-store'});const j=await r.json() as Profile;if(!j.ok)throw Error(j.error||'Could not load the profile');if(!cancelled){setProfile(j);if(j.exists){setName(j.displayName||`OnchainHoodie_${hoodieId}`);setBio(old=>j.bio||old);setExternalUrl(j.externalUrl||`https://onchainhoodies.xyz/hoodie/${hoodieId}`);if(j.username)setUsername(j.username);}}}catch(e){if(!cancelled)setError(`Could not load OpenSea profile: ${err(e)}`);}finally{if(!cancelled)setLoadingProfile(false);}})();return()=>{cancelled=true;}},[wallet,hoodieId]);
 useEffect(()=>{if(!hoodieId)return;let cancelled=false;void(async()=>{setTalkLoading(true);try{const response=await fetch(collectionApiUrl(`/v1/token/${encodeURIComponent(hoodieId)}/hood-talk/history`),{cache:'no-store'});const data=await response.json() as {talks?:Array<{quote:string;count:number;sequence:number}>};if(!response.ok)throw Error('Hood Talk unavailable');if(cancelled)return;const entries=(data.talks||[]).filter(t=>!!t.quote).sort((a,b)=>b.count-a.count||b.sequence-a.sequence);setTalks(entries);if(entries[0])setBio(old=>old||entries[0].quote.slice(0,500));}catch{if(!cancelled)setTalks([]);}finally{if(!cancelled)setTalkLoading(false);}})();return()=>{cancelled=true;}},[hoodieId]);
 useEffect(()=>()=>{if(imagePreview)URL.revokeObjectURL(imagePreview);},[imagePreview]);
 async function publish(action:'save'|'claim'){
  if(!provider||!authorized||!wallet||!address||busy)return;
  setBusy(true);setError('');setStatus(action==='claim'?'Claiming your username…':'Saving your profile…');setRemote(null);
  try{
   if(!nameValid)throw Error('The display name can use letters, numbers, underscores and hyphens.');
   if(action==='claim'&&!usernameValid)throw Error('Please enter a valid username.');
   if(bio.length>500)throw Error('Bio is too long.');
   if(externalUrl.trim()){const u=new URL(externalUrl.trim());if(!['https:','http:'].includes(u.protocol))throw Error('Please enter an HTTP or HTTPS website.');}
   let imageData='',bannerData='';
   if(action==='save'&&imageMode==='hoodie')imageData=await pngFromArtwork(artworkUrl);
   if(action==='save'&&imageMode==='custom'){if(!imageFile)throw Error('Choose a PNG image first.');imageData=await pngFromFile(imageFile);}
   if(action==='save'&&bannerCanvasRef.current)bannerData=bannerCanvasRef.current.toDataURL('image/png');
   if(imageData.length>2_800_000||bannerData.length>2_800_000)throw Error('One of the images exceeds the 2 MB limit.');
   const nonce=await api<{ok:true;nonce:string}>('/api/profileos/nonce',{});
   const message=`opensea.io wants you to sign in with your Ethereum account:\n${wallet}\n\n${SIWE_STATEMENT}\n\nURI: https://opensea.io\nVersion: 1\nChain ID: ${siteConfig.chainId}\nNonce: ${nonce.nonce}\nIssued At: ${new Date().toISOString()}`;
   setStatus('Review the wallet signature request.');
   const client=await getWalletClient();if(!client.account)throw Error('Please reconnect your wallet.');
   const signature=await client.signMessage({account:client.account,message});
   const magic=await new Contract(wallet,ERC1271,provider).isValidSignature(hashMessage(message),signature);
   if(String(magic).toLowerCase()!=='0x1626ba7e')throw Error('Your HoodWallet could not verify this signature.');
   setStatus(action==='claim'?'Claiming your username…':'Publishing to OpenSea…');
   const r=await fetch('/api/profileos/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,signature,wallet,hoodieId,action,username:username.trim(),displayName:name.trim(),bio,externalUrl:externalUrl.trim(),imageData,bannerData}),cache:'no-store'});
   const j=await r.json() as Result;setRemote(j);
   if(!j.ok)throw Error(j.error||j.details||'OpenSea could not save the changes.');
   setStatus(action==='claim'?'Username claimed!':'Profile saved!');
   const read=await fetch(`/api/profileos/verify?wallet=${encodeURIComponent(wallet)}`,{cache:'no-store'});const updated=await read.json() as Profile;if(updated.ok)setProfile(updated);
  }catch(e){setError(err(e));setStatus('');}finally{setBusy(false);}
 }
 const field='mt-2 block w-full min-w-0 border border-black bg-transparent px-3 py-3 text-base outline-none focus:ring-2 focus:ring-black';
 const small='text-[11px] uppercase tracking-[0.11em]';
 const card='border border-black p-4 sm:p-6';
 return <main className="min-h-screen bg-[#ccff00] text-black"><SiteHeader/>
  <section className="mx-auto max-w-5xl px-4 pb-24 pt-20 md:pt-24">
   <div className="flex items-center justify-between border-b border-black pb-3"><span className={small}>HoodOS / ProfileOS</span><Link href="/hoodos" className="text-xs underline underline-offset-4">Back to HoodOS</Link></div>
   <div className="mt-9 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-6xl leading-[.85] tracking-[-.075em] sm:text-8xl">PROFILE<br/>OS</h1><p className="mt-5 max-w-md text-sm sm:text-base">Make your Hoodie your own. Customize its OpenSea profile, from its voice to its pixels.</p></div>{profileUrl&&<a className="border border-black px-4 py-3 text-xs uppercase hover:bg-black hover:text-[#ccff00]" href={profileUrl} target="_blank" rel="noreferrer">View on OpenSea ↗</a>}</div>
   {!address?<div className="mt-10 border border-black p-8 text-center"><h2 className="text-2xl">Your Hoodie, your identity.</h2><button className="mt-6 bg-black px-6 py-4 text-sm uppercase text-[#ccff00]" onClick={()=>void connect()}>Connect wallet</button></div>:
   <div className="mt-9 space-y-5">
    <section className={card}><div className="flex items-center justify-between gap-3"><h2 className="text-2xl">Your Hoodie</h2>{active&&<span className="text-[11px] uppercase">● Active</span>}</div><select aria-label="Select Hoodie" className={field} value={hoodieId} onChange={e=>setHoodieId(e.target.value)}><option value="">Choose a Hoodie</option>{hoodies.map(h=><option key={h.tokenId} value={h.tokenId}>OnchainHoodie #{h.tokenId}</option>)}</select>{hoodieId&&<div className="mt-4 flex items-center gap-4">{artworkUrl&&<img src={artworkUrl} width={88} height={88} alt={`Hoodie #${hoodieId}`} className="h-20 w-20 border border-black bg-black object-contain [image-rendering:pixelated]"/>}<div className="min-w-0"><p className="text-lg font-semibold">OnchainHoodie #{hoodieId}</p><p className="mt-1 break-all text-xs opacity-70">{wallet||'Loading wallet…'}</p><p className="mt-2 text-xs">{loadingProfile?'Loading profile…':profile?.username?`@${profile.username}`:profile?.exists?'OpenSea profile connected':'Ready to personalize'}</p></div></div>}{hoodieId&&!authorized&&<p className="mt-4 text-xs">Connect the wallet holding this activated Hoodie to edit its profile.</p>}</section>
    {hoodieId&&<>
     <section className={card}><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl">Your identity</h2><p className="mt-1 text-sm opacity-70">Already filled in for you. Change anything you like.</p></div></div>
      <label className={`mt-6 block ${small}`}>Name<input className={field} value={name} maxLength={50} onChange={e=>setName(e.target.value)}/></label>{name&&!nameValid&&<p className="mt-1 text-xs">Use only letters, numbers, _ and -</p>}
      <label className={`mt-5 block ${small}`}>Bio <span className="opacity-60">{bio.length}/500</span><textarea className={`${field} min-h-28 resize-y normal-case`} value={bio} maxLength={500} onChange={e=>setBio(e.target.value)} placeholder="Give your Hoodie a voice"/></label>
      {!!talks.length&&<div className="mt-3"><p className={`${small} mb-2`}>From your Hood Talks</p><div className="flex max-h-36 flex-col gap-2 overflow-y-auto">{talks.map((talk,i)=><button key={`${talk.count}-${i}`} onClick={()=>setBio(talk.quote.slice(0,500))} className="border border-black/50 px-3 py-2 text-left text-xs hover:bg-black hover:text-[#ccff00]">“{talk.quote}”</button>)}</div></div>}{talkLoading&&<p className="mt-2 text-xs opacity-60">Loading Hood Talks…</p>}
      <label className={`mt-5 block ${small}`}>Website<input className={`${field} normal-case`} type="url" value={externalUrl} onChange={e=>setExternalUrl(e.target.value)} maxLength={2048}/></label><button className="mt-2 text-xs underline underline-offset-4" onClick={()=>setExternalUrl(`https://onchainhoodies.xyz/hoodie/${hoodieId}`)}>Use my Hoodie page URL</button>
     </section>
     <section className={card}><h2 className="text-2xl">Profile picture</h2><div className="mt-4 flex flex-wrap items-start gap-4">{artworkUrl&&<img src={imageMode==='custom'&&imagePreview?imagePreview:imageMode==='keep'&&profile?.profileImageUrl?profile.profileImageUrl:artworkUrl} alt="Profile picture preview" width={136} height={136} className="h-32 w-32 border border-black bg-black object-contain [image-rendering:pixelated]"/>}<div className="flex min-w-44 flex-1 flex-col items-start gap-2 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={imageMode==='hoodie'} onChange={()=>setImageMode('hoodie')}/>Hoodie artwork</label><label className="flex items-center gap-2"><input type="radio" checked={imageMode==='keep'} onChange={()=>setImageMode('keep')}/>Keep current picture</label><label className="flex items-center gap-2"><input type="radio" checked={imageMode==='custom'} onChange={()=>setImageMode('custom')}/>Upload a PNG</label>{imageMode==='custom'&&<input type="file" accept="image/png" className="mt-2 w-full text-xs" onChange={e=>{const f=e.target.files?.[0]||null;setImageFile(f);setImagePreview(f?URL.createObjectURL(f):'');}}/>}</div></div></section>
     <section className={card}><h2 className="text-2xl">Your banner</h2><p className="mt-2 text-sm opacity-70">Your name, your words, your pixels.</p>
      <div className="mt-5 flex items-center gap-2"><button onClick={()=>setPreviewMode('desktop')} className={`border border-black px-4 py-2 text-xs uppercase ${previewMode==='desktop'?'bg-black text-[#ccff00]':''}`}>Desktop preview</button><button onClick={()=>setPreviewMode('mobile')} className={`border border-black px-4 py-2 text-xs uppercase ${previewMode==='mobile'?'bg-black text-[#ccff00]':''}`}>Mobile preview</button></div>
      {bannerPreview&&<div className={`mt-3 overflow-hidden border border-black bg-black ${previewMode==='mobile'?'mx-auto max-w-[380px]':''}`}><div className={`relative overflow-hidden bg-black ${previewMode==='mobile'?'h-[190px]':'aspect-[4/1]'}`}><img src={bannerPreview} alt={`${previewMode} OpenSea banner preview`} className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"/>{previewMode==='mobile'&&<><div className="absolute inset-x-0 top-0 h-8 bg-black/50"/><div className="absolute bottom-0 left-5 h-20 w-20 translate-y-7 rounded-full border-4 border-[#ccff00] bg-black"/>{artworkUrl&&<img src={imageMode==='custom'&&imagePreview?imagePreview:imageMode==='keep'&&profile?.profileImageUrl?profile.profileImageUrl:artworkUrl} alt="" className="absolute bottom-0 left-5 h-20 w-20 translate-y-7 rounded-full border-4 border-[#ccff00] bg-black object-cover [image-rendering:pixelated]"/>}</>}</div>{previewMode==='desktop'&&<div className="relative flex min-h-20 items-center bg-black py-3 pl-28 text-sm text-white sm:min-h-24 sm:pl-36"><span className="truncate">{name}</span><div className="absolute -top-10 left-4 h-24 w-24 rounded-full border-4 border-black bg-[#ccff00] sm:-top-12 sm:h-28 sm:w-28">{artworkUrl&&<img src={imageMode==='custom'&&imagePreview?imagePreview:imageMode==='keep'&&profile?.profileImageUrl?profile.profileImageUrl:artworkUrl} alt="Hoodie profile avatar" className="h-full w-full rounded-full object-cover [image-rendering:pixelated]"/>}</div></div>}{previewMode==='mobile'&&<div className="bg-black px-4 pb-4 pt-6 text-sm text-white">{name}</div>}</div>}
      <p className="mt-3 text-xs opacity-70">{previewMode==='mobile'?'Mobile preview is approximate; OpenSea may crop differently by device.':'This is how your full banner looks.'}</p>
      <div className="mt-5 border-t border-black/40 pt-5"><p className={`${small} mb-3`}>Edit banner</p><BannerEditor key={hoodieId} canvasRef={bannerCanvasRef} quote={bio} onPreview={setBannerImage}/></div>
     </section>
     <section className={card}><h2 className="text-2xl">Your OpenSea username</h2><p className="mt-2 text-sm opacity-70">Give your Hoodie a personal link on OpenSea.</p><div className="mt-4 flex items-center border border-black"><span className="shrink-0 border-r border-black px-3 text-xs">opensea.io/</span><input aria-label="OpenSea username" className="w-full min-w-0 bg-transparent px-3 py-3 text-base outline-none" value={username} maxLength={50} onChange={e=>setUsername(e.target.value)}/></div>{profile?.username&&<p className="mt-2 text-xs">Current username: {profile.username}</p>}<button disabled={!authorized||busy||loadingProfile||!usernameValid} onClick={()=>{if(window.confirm(`Claim @${username} for Hoodie #${hoodieId}?`))void publish('claim');}} className="mt-4 border border-black px-5 py-3 text-xs uppercase hover:bg-black hover:text-[#ccff00] disabled:opacity-30">{busy?'Working…':'Claim username'}</button></section>
     <section className="border-2 border-black p-5 sm:p-7"><h2 className="text-2xl">Ready to publish?</h2><p className="mt-2 text-sm">Save your name, bio, website, picture and banner to OpenSea.</p><button disabled={!authorized||busy||loadingProfile||!nameValid||(imageMode==='custom'&&!imageFile)} onClick={()=>void publish('save')} className="mt-6 w-full bg-black px-5 py-4 text-sm uppercase text-[#ccff00] disabled:opacity-30">{busy?'Saving…':'Save profile'}</button>
      {status&&<p role="status" className="mt-4 text-sm">{status}</p>}{error&&<div role="alert" className="mt-4 border border-black p-3 text-sm"><p>{error}</p>{remote?.stage&&<details className="mt-2 text-xs"><summary className="cursor-pointer underline">More details</summary><p className="mt-2">Step: {remote.stage}{remote.status?` · HTTP ${remote.status}`:''}</p></details>}</div>}{remote?.ok&&<div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span>✓ Saved on OpenSea</span>{profileUrl&&<a href={profileUrl} target="_blank" rel="noreferrer" className="underline">View profile ↗</a>}</div>}
      <p className="mt-4 text-xs opacity-70">A wallet signature is required to publish. If your wallet flags the sign-in as high risk, cancel it rather than bypassing the warning.</p>
     </section>
    </>}
   </div>}
  </section><SiteFooter/></main>;
}
