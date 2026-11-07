import {NextRequest,NextResponse} from 'next/server';
import {Contract,JsonRpcProvider,getAddress,hashMessage,isHexString} from 'ethers';
import {siteConfig} from '../../../../lib/config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const BASE='https://api.opensea.io';
const ABI=['function hoodInfo(uint256) view returns (tuple(uint256 tokenId,address owner,address wallet,bool walletDeployed,bool active,address activationOwner,uint64 activatedAt,uint256 walletState,uint256 nativeBalance,uint256 paymentTokenBalance) info)'];
const SIG=['function isValidSignature(bytes32,bytes) view returns (bytes4)'];
const STATEMENT='Click to sign in and accept the Platform Terms of Service (https://opensea.io/tos) and Privacy Policy (https://opensea.io/privacy).';
type Obj=Record<string,unknown>;
class StageError extends Error {constructor(public stage:string,public http:number,detail:string,public traceId:string){super(`${stage}: OpenSea HTTP ${http}${detail?` (${detail})`:''}${traceId?` [trace ${traceId}]`:''}`)}}
function obj(v:unknown):Obj{return v&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{}}
function str(v:unknown):string{return typeof v==='string'?v:''}
function pick(v:Obj,...keys:string[]):string{for(const key of keys){const s=str(v[key]);if(s)return s}return ''}
async function readJson(r:Response):Promise<Obj>{
 const raw=await r.text();
 if(!raw)return {_emptyBody:true};
 try{const parsed=JSON.parse(raw);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Obj:{_rawText:String(parsed).slice(0,800)}}
 catch{return {_rawText:raw.slice(0,800)}}
}
function safeDetail(data:Obj):string{
 // Never expose access tokens or cookies in the error response.
 const e=obj(data.error);const err=obj(e.error);const nested=obj(data.details);
 const direct=pick(e,'message','detail','description')||pick(err,'message','detail')||pick(data,'message','detail','error_description')||pick(nested,'message','detail');
 const problems=Array.isArray(e.errors)?e.errors:Array.isArray(data.errors)?data.errors:[];
 const detail=direct||problems.map(x=>typeof x==='string'?x:pick(obj(x),'message','detail')).filter(Boolean).join('; ')||pick(data,'_rawText')||JSON.stringify(data).slice(0,800);
 return detail.replace(/(Bearer\s+)[^\s"']+/gi,'$1[redacted]').replace(/(access_token|refresh_token|subjectToken|api_key|signature|cookie)([=:\"\s]+)[^\s,}]+/gi,'$1$2[redacted]').slice(0,800);
}
function check(r:Response,data:Obj,stage:string){
 if(r.ok)return;
 const trace=pick(obj(data.meta),'x-trace-id','traceId')||r.headers.get('x-trace-id')||r.headers.get('x-request-id')||'';
 throw new StageError(stage,r.status,safeDetail(data),trace);
}
function extractCookies(r:Response):string{
 const lines=typeof r.headers.getSetCookie==='function'?r.headers.getSetCookie():[];
 const allowed=['access_token','refresh_token'];const pairs:string[]=[];
 for(const line of lines){const first=line.split(';',1)[0].trim();const idx=first.indexOf('=');if(idx>0&&allowed.includes(first.slice(0,idx)))pairs.push(first)}
 return pairs.join('; ');
}
async function post(path:string,body:unknown,headers:Record<string,string>={}){
 const response=await fetch(BASE+path,{method:'POST',headers:{'content-type':'application/json','accept':'application/json',...headers},body:JSON.stringify(body),cache:'no-store',redirect:'manual'});
 const data=await readJson(response);return {response,data};
}
export async function POST(req:NextRequest){let stage='validation';let tokenId='';let cookies='';let verified=false;let patCreated=false;let patRevoked=false;
 try{
  const origin=req.headers.get('origin');if(origin&&origin!==req.nextUrl.origin)throw Error('Cross-site request blocked');
  const b=obj(await req.json());const wallet=getAddress(str(b.wallet));const signature=str(b.signature),message=str(b.message),hoodieId=str(b.hoodieId);
  const action=str(b.action)==='claim'?'claim':'save';const username=str(b.username).trim();const displayName=str(b.displayName).trim();const imageData=str(b.imageData);const bannerData=str(b.bannerData);const bio=str(b.bio);const externalUrl=str(b.externalUrl).trim();
  if(!/^\d{1,6}$/.test(hoodieId)||!isHexString(signature)||message.length>3000||!/^[A-Za-z0-9_-]{1,50}$/.test(displayName)||(action==='claim'&&!/^[A-Za-z0-9_-]{1,50}$/.test(username)))throw Error('Invalid Hoodie, signature or display name (1-50 characters)');
  if(bio.length>500||externalUrl.length>2048)throw Error('Bio or website exceeds OpenSea limits');
  if(externalUrl){const u=new URL(externalUrl);if(u.protocol!=='https:'&&u.protocol!=='http:')throw Error('Website must use HTTPS or HTTP');}
  const apiKey=process.env.OPENSEA_API_KEY||process.env.OPENSEA_API_KEY_V2;
  if(!apiKey)throw Error('Server configuration missing OPENSEA_API_KEY (add it to your deployment environment)');
  const serverApiKey:string=apiKey;
  const provider=new JsonRpcProvider(siteConfig.rpcUrl,Number(siteConfig.chainId),{staticNetwork:true});
  const info=await new Contract(siteConfig.hoodOSAddress,ABI,provider).hoodInfo(BigInt(hoodieId));
  if(getAddress(String(info.wallet))!==wallet||!info.active||!info.walletDeployed)throw Error('HoodWallet mismatch or inactive');
  const lines=message.split('\n');const domain=lines[0]?.split(' wants you to sign in with your Ethereum account:')[0];
  const field=(key:string)=>lines.find(x=>x.startsWith(key+': '))?.slice(key.length+2)||'';
  const parsed={domain,address:wallet,statement:lines[3]||'',uri:field('URI'),version:field('Version'),chainId:field('Chain ID'),nonce:field('Nonce'),issuedAt:field('Issued At'),accountType:'Ethereum'};
  if(domain!=='opensea.io'||parsed.uri!=='https://opensea.io'||parsed.statement!==STATEMENT||parsed.version!=='1'||parsed.chainId!==String(siteConfig.chainId)||!/^[A-Za-z0-9]{8,}$/.test(parsed.nonce)||!parsed.issuedAt)throw Error('SIWE message differs from the OpenSea documented format');
  const canonical=`opensea.io wants you to sign in with your Ethereum account:\n${wallet}\n\n${STATEMENT}\n\nURI: https://opensea.io\nVersion: 1\nChain ID: ${parsed.chainId}\nNonce: ${parsed.nonce}\nIssued At: ${parsed.issuedAt}`;
  if(message!==canonical)throw Error('Unexpected SIWE formatting');
  const timestamp=Date.parse(parsed.issuedAt);if(!Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>5*60*1000)throw Error('SIWE issue time is stale');
  const magic=await new Contract(wallet,SIG,provider).isValidSignature(hashMessage(message),signature);
  if(String(magic).toLowerCase()!=='0x1626ba7e')throw Error('ERC-1271 signature invalid');
  stage='siwe';
  const login=await post('/api/v2/auth/siwe/verify',{message:parsed,signature,chainArch:'EVM'});
  check(login.response,login.data,stage);verified=true;
  cookies=extractCookies(login.response);
  if(!cookies.includes('access_token='))throw new Error('OpenSea authenticated but no access_token cookie was available to server');
  stage='create-token';
  const created=await post('/api/v2/auth/tokens',{label:`ProfileOS Hoodie ${hoodieId}`,scopes:['write:profile'],expiresInDays:1},{cookie:cookies});
  // OpenSea may accept SIWE and ERC-1271 yet deny write:profile at PAT creation.
  // This is an account entitlement decision, not a signature failure. No fallback
  // to weaker scopes: profile PATCH requires write:profile.
  if(!created.response.ok){
   const detail=safeDetail(created.data);
   if(created.response.status===400 && /scope|entitlement|permission/i.test(detail)){
    const trace=pick(obj(created.data.meta),'x-trace-id','traceId')||created.response.headers.get('x-trace-id')||created.response.headers.get('x-request-id')||'';
    throw new StageError('scope-entitlement',400,detail,trace);
   }
  }
  check(created.response,created.data,stage);
  const root=created.data;const nested=obj(root.data);const nestedToken=obj(root.token);
  const pat=pick(root,'token','personalAccessToken','accessToken','secret','value')||pick(nested,'token','personalAccessToken','accessToken','secret','value')||pick(nestedToken,'token','secret','value');
  tokenId=pick(root,'id','tokenId')||pick(nested,'id','tokenId')||pick(nestedToken,'id','tokenId');
  patCreated=true;
  if(!pat)throw new Error('Token created, but OpenSea returned an unrecognized PAT response shape. Review server code against its latest schema.');
  stage='exchange';
  const exchanged=await post('/api/v2/auth/tokens/exchange',{subjectToken:pat,subjectTokenType:'ACCESS_TOKEN'});
  check(exchanged.response,exchanged.data,stage);
  const jwt=pick(exchanged.data,'accessToken');if(!jwt)throw new Error('Token exchange response missing accessToken');
  if(action==='claim'){
   stage='claim-username';
   const claimed=await post('/api/v2/profile/username',{username},{'x-api-key':serverApiKey,'authorization':`Bearer ${jwt}`});
   check(claimed.response,claimed.data,stage);
   if(claimed.data.success!==true)throw new StageError(stage,claimed.response.status,'OpenSea did not confirm username claim','');
   stage='read-back';
   const account=await fetch(BASE+'/api/v2/accounts/'+encodeURIComponent(wallet),{headers:{accept:'application/json','x-api-key':apiKey},cache:'no-store'});
   const accountData=await readJson(account);const accountObj=Object.keys(obj(accountData.account)).length?obj(accountData.account):accountData;
   const readUsername=pick(accountObj,'username');
   return NextResponse.json({ok:true,stage:'completed',usernameClaimed:true,username,readBack:readUsername||null,readBackMatches:readUsername.toLowerCase()===username.toLowerCase(),details:'Username claimed on OpenSea.'},{headers:{'cache-control':'no-store'}});
  }
  // Upload optional PNG images without changing existing profile images when omitted.
  async function uploadImage(data:string,imageType:'profile_picture'|'banner_image'):Promise<string>{
   stage=`${imageType}-validation`;
   if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)||data.length>2_800_000)throw Error(`${imageType}: PNG image is missing or too large`);
   const imageBytes=Buffer.from(data.slice('data:image/png;base64,'.length),'base64');
   if(imageBytes.length<32||imageBytes.length>2_000_000||imageBytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`${imageType}: invalid PNG (2 MB max)`);
   stage=`${imageType}-context`;
   const ctx=await post('/api/v2/profile/images',{imageType,contentType:'image/png'},{'x-api-key':serverApiKey,'authorization':`Bearer ${jwt}`});
   check(ctx.response,ctx.data,stage);
   const uploadUrl=pick(ctx.data,'url');const method=pick(ctx.data,'method');const uploadToken=pick(ctx.data,'token');const fields=obj(ctx.data.fields);
   if(!uploadUrl||!['POST','PUT'].includes(method)||!uploadToken)throw Error('OpenSea returned an unrecognized upload context');
   const parsedUpload=new URL(uploadUrl);
   if(parsedUpload.protocol!=='https:'||parsedUpload.username||parsedUpload.password)throw Error('OpenSea returned an invalid upload URL');
   stage=`${imageType}-storage`;
   let storageResponse:Response;
   if(method==='POST'){
    const form=new FormData();for(const [k,v] of Object.entries(fields))if(typeof v==='string')form.append(k,v);
    form.append('file',new Blob([new Uint8Array(imageBytes)],{type:'image/png'}),`${imageType}-${hoodieId}.png`);
    storageResponse=await fetch(uploadUrl,{method:'POST',body:form,redirect:'manual',cache:'no-store'});
   }else storageResponse=await fetch(uploadUrl,{method:'PUT',body:new Uint8Array(imageBytes),redirect:'manual',cache:'no-store'});
   if(!storageResponse.ok)throw new StageError(stage,storageResponse.status,'Image storage rejected the upload','');
   return uploadToken;
  }
  const changes:Obj={displayName,bio,externalUrl};
  if(imageData)changes.profileImageToken=await uploadImage(imageData,'profile_picture');
  if(bannerData)changes.bannerImageToken=await uploadImage(bannerData,'banner_image');
  stage='update-profile';
  const updated=await fetch(BASE+'/api/v2/profile',{method:'PATCH',headers:{'content-type':'application/json','accept':'application/json','x-api-key':apiKey,'authorization':`Bearer ${jwt}`},body:JSON.stringify(changes),cache:'no-store',redirect:'manual'});
  const updatedBody=await readJson(updated);check(updated,updatedBody,stage);
  stage='read-back';
  const account=await fetch(BASE+'/api/v2/accounts/'+encodeURIComponent(wallet),{headers:{'accept':'application/json','x-api-key':apiKey},cache:'no-store'});
  const profile=await readJson(account);
  const publicName=pick(profile,'display_name','displayName')||pick(obj(profile.account),'display_name','displayName');
  return NextResponse.json({ok:true,status:updated.status,stage:'completed',verified:true,profileUpdated:true,displayName:pick(updatedBody,'displayName')||displayName,readBack:account.ok?publicName:null,readBackMatches:account.ok&&publicName===displayName,readBackStatus:account.status,bio:pick(profile,'bio')||pick(obj(profile.account),'bio'),externalUrl:pick(profile,'website','external_url','externalUrl')||pick(obj(profile.account),'website','external_url','externalUrl'),profileImageUrl:pick(profile,'profile_image_url','profileImageUrl')||null,details:account.ok&&publicName===displayName?'OpenSea profile name saved and confirmed by public account lookup.':'OpenSea accepted the name update. Public account lookup may still be indexing.'},{headers:{'cache-control':'no-store'}});
 }catch(e){const details=e instanceof Error?e.message:'Unexpected error';return NextResponse.json({ok:false,stage,status:e instanceof StageError?e.http:undefined,verified,patCreated,error:details,traceId:e instanceof StageError?e.traceId:undefined,...(stage==='scope-entitlement'?{requestedScopes:['write:profile'],diagnosis:'OpenSea accepted the signed wallet session but did not entitle this account to create a PAT with write:profile. Changing the signature or requesting weaker scopes will not enable profile writes.',nextAction:'Check the account permissions with OpenSea support/developer portal; include the trace ID. No profile update was attempted.'}:{})},{status:200,headers:{'cache-control':'no-store'}})}
 finally{
  if(tokenId&&cookies){try{const r=await fetch(BASE+'/api/v2/auth/tokens/'+encodeURIComponent(tokenId),{method:'DELETE',headers:{'cookie':cookies},cache:'no-store'});patRevoked=r.ok}catch{/* a PAT expires after one day; no secrets are persisted */}}
  void patRevoked;
 }
}

export async function GET(req:NextRequest){
 try{
  const wallet=getAddress(req.nextUrl.searchParams.get('wallet')||'');
  const apiKey=process.env.OPENSEA_API_KEY||process.env.OPENSEA_API_KEY_V2;
  if(!apiKey)throw Error('Server missing OPENSEA_API_KEY');
  const r=await fetch(BASE+'/api/v2/accounts/'+encodeURIComponent(wallet),{headers:{'accept':'application/json','x-api-key':apiKey},cache:'no-store'});
  if(r.status===404)return NextResponse.json({ok:true,exists:false},{headers:{'cache-control':'no-store'}});
  const data=await readJson(r);check(r,data,'read-profile');
  const account=Object.keys(obj(data.account)).length?obj(data.account):data;
  return NextResponse.json({ok:true,exists:true,displayName:pick(account,'display_name','displayName'),bio:pick(account,'bio','description'),externalUrl:pick(account,'website','external_url','externalUrl'),username:pick(account,'username'),profileImageUrl:pick(account,'profile_image_url','profileImageUrl'),bannerImageUrl:pick(account,'banner_image_url','bannerImageUrl')},{headers:{'cache-control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Unable to read profile'},{status:400,headers:{'cache-control':'no-store'}})}
}
