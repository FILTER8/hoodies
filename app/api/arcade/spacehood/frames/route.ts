// Server-side proxy for the HoodFrame index worker supplied with the project.
export async function GET(request: Request) {
  const base = process.env.HOODFRAME_API_URL;
  if (!base) return Response.json({ error: "Set HOODFRAME_API_URL to your HoodFrame API origin." }, { status: 503 });
  const offset = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("offset")) || 0));
  try {
    const url = new URL("/v1/hoodframe/frames", base);
    url.searchParams.set("limit", "200"); url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("HoodFrame index is unavailable.");
    const data = await response.json();
    if (!Array.isArray(data.frames) || !Number.isFinite(data.total) || !(data.limit > 0)) throw new Error("Invalid HoodFrame index.");
    return Response.json(data);
  } catch { return Response.json({ error: "Unable to fetch the HoodFrame index." }, { status: 502 }); }
}
