import {NextRequest,NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const tokenId=req.nextUrl.searchParams.get('tokenId')||'';
 if(!/^\d{1,6}$/.test(tokenId))return NextResponse.json({error:'Invalid Hoodie ID'},{status:400});
 try{
  const url=`https://api.onchainhoodies.xyz/images/${tokenId}.svg`;
  const r=await fetch(url,{signal:AbortSignal.timeout(12000),cache:'no-store',headers:{accept:'image/svg+xml'}});
  if(!r.ok)throw Error(`Hoodie artwork API HTTP ${r.status}`);
  const raw=await r.text();
  if(raw.length>500_000||!/<svg(?:\s|>)/i.test(raw))throw Error('Artwork endpoint did not return a valid-sized SVG');
  return new NextResponse(raw,{headers:{'content-type':'image/svg+xml; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Artwork unavailable'},{status:502})}
}
