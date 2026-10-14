import {NextRequest,NextResponse} from 'next/server';
import {Contract,TypedDataEncoder,getAddress,isHexString} from 'ethers';
import {CHAIN_ID,CANVAS,SEAPORT_ABI,checkOrder,cleanParams,components,getNftOwner,hoodInfo,jsonError,seaportAddress} from '../../../../lib/listingos';
import {ORDER_TYPES,orderValues,signingDomain} from '../../../../lib/listingos-signing';
const ERC1271=['function isValidSignature(bytes32 hash,bytes signature) view returns (bytes4)'];
export async function POST(req:NextRequest){try{
 const b=await req.json();const {wallet,p}=await hoodInfo(String(b.hoodieId));const tokenId=String(b.tokenId);const contract=getAddress(String(b.contract||CANVAS));
 if(await getNftOwner(p,contract,tokenId)!==wallet)throw Error('NFT ownership changed');
 const params=cleanParams(b.parameters);checkOrder(params,wallet,contract,tokenId);
 const counter=String(await new Contract(getAddress(String(b.seaport)),SEAPORT_ABI,p).getCounter(wallet));
 if(counter!==String(b.counter))throw Error('Seaport counter changed');
 const vals=orderValues(components(params,counter));
 const hash=TypedDataEncoder.hashStruct('OrderComponents',ORDER_TYPES as unknown as Record<string,{name:string;type:string}[]>,vals);
 if(hash.toLowerCase()!==String(b.orderHash).toLowerCase())throw Error('Order hash mismatch');
 const signature=String(b.signature||'');if(!isHexString(signature))throw Error('Invalid signature');
 const digest=TypedDataEncoder.hash(signingDomain(CHAIN_ID,getAddress(String(b.seaport))),ORDER_TYPES as unknown as Record<string,{name:string;type:string}[]>,vals);
 const magic=await new Contract(wallet,ERC1271,p).isValidSignature(digest,signature);
 if(String(magic).toLowerCase()!=='0x1626ba7e')throw Error('HoodWallet rejected this signature');
 return NextResponse.json({ok:true,signatureValid:true,orderHash:hash});
}catch(e){return NextResponse.json({ok:false,error:jsonError(e)},{status:400});}}
