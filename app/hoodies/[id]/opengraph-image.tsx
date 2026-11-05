/* eslint-disable @next/next/no-img-element -- next/og needs image tags for the artwork. */
import { ImageResponse } from "next/og";
import { fetchHomepage, defaultHomepage, mediaUrl } from "../../../lib/hoodieHomepage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "World Wide Hood personalized Hoodie homepage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ id: string }> };

async function imageData(url: string, expected: "svg" | "raster"): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0] || "";
    const allowed = expected === "svg" ? type.includes("svg") : ["image/png", "image/jpeg", "image/webp"].includes(type);
    if (!allowed) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 800_000) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch { return null; }
}

export default async function OpenGraphImage({ params }: Props) {
  const { id: raw } = await params;
  const id = /^\d{1,4}$/.test(raw) && Number(raw) < 6000 ? Number(raw) : 0;
  const config = await fetchHomepage(id) || defaultHomepage(id);
  const identity = config.modules.find(m => m.type === "identity");
  const marquee = config.modules.find(m => m.type === "marquee");
  const bgFile = config.background?.asset || "";
  const isGreen = config.theme === "green";
  const ink = isGreen ? "#000000" : "#ccff00";
  const paper = isGreen ? "#ccff00" : "#000000";
  const [avatar, background] = await Promise.all([
    imageData(`https://api.onchainhoodies.xyz/images/${id}.svg`, "svg"),
    /\.(png|jpg|jpeg|webp)$/i.test(bgFile) ? imageData(mediaUrl("backgrounds", bgFile), "raster") : Promise.resolve(null),
  ]);
  const title = (config.title || "THE WORLD WIDE HOOD").slice(0, 70).toUpperCase();
  const welcome = marquee?.type === "marquee" ? marquee.text.replace(/\[\[gif:[^\]]+\]\]/gi, "").slice(0, 85) : `WELCOME TO HOODIE #${id}`;
  return new ImageResponse(
    <div style={{ display:"flex", width:"100%", height:"100%", backgroundColor:paper, color:ink, padding:28, fontFamily:"monospace" }}>
      <div style={{ display:"flex", flexDirection:"column", width:"100%", border:`5px solid ${ink}`, padding:20, position:"relative", overflow:"hidden" }}>
        {background && <img src={background} alt="" style={{ position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:config.background?.mode === "contain" ? "contain" : "cover",opacity:.5 }} />}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:21,letterSpacing:2,backgroundColor:paper,padding:"8px 14px",zIndex:1}}>
          <span>ONCHAINHOODIES / PERSONAL WEB</span><span>EST. 2026</span>
        </div>
        <div style={{display:"flex",flex:1,gap:30,alignItems:"center",justifyContent:"space-between",zIndex:1,padding:"12px 10px"}}>
          <div style={{display:"flex",flexDirection:"column",justifyContent:"center",width:700,gap:22,alignItems:"flex-start"}}>
            <div style={{display:"flex",fontSize:25,letterSpacing:2,backgroundColor:paper,padding:"10px 14px"}}>★ {welcome || "WELCOME TO MY PAGE"} ★</div>
            <div style={{display:"flex",fontSize:title.length > 30 ? 42 : title.length > 19 ? 53 : 68,fontWeight:900,lineHeight:1.1,backgroundColor:paper,padding:"12px 14px",overflow:"hidden",maxWidth:700}}>{title}</div>
            <div style={{display:"flex",fontSize:25,backgroundColor:paper,padding:"8px 14px"}}>HOODIE #{id} · MY CORNER OF THE INTERNET</div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:330,height:330,backgroundColor:ink,border:`6px solid ${paper}`,flexShrink:0}}>
            {avatar ? <img src={avatar} width="306" height="306" alt="" style={{width:306,height:306,objectFit:"contain",imageRendering:"pixelated"}} /> : <span style={{fontSize:90,color:paper}}>#{id}</span>}
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",backgroundColor:paper,padding:"8px 14px",fontSize:23,zIndex:1}}>
          <span>THE WORLD WIDE HOOD</span><span>ONCHAINHOODIES.XYZ/HOODIES/{id}</span>
        </div>
      </div>
    </div>, size,
  );
}
