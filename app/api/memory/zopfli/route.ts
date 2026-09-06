import { NextRequest } from "next/server";
import { zlibAsync } from "@gfx/zopfli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_BYTES = 256_000;

export async function POST(request: NextRequest) {
  try {
    const inputBuffer = await request.arrayBuffer();

    if (inputBuffer.byteLength === 0) {
      return new Response("Empty compression payload.", { status: 400 });
    }

    if (inputBuffer.byteLength > MAX_INPUT_BYTES) {
      return new Response("Compression payload is too large.", { status: 413 });
    }

    const input = new Uint8Array(inputBuffer);
    const output = await zlibAsync(input as never, {
      numiterations: 15,
      blocksplitting: true,
      blocksplittingmax: 15,
      verbose: false,
      verbose_more: false,
    });

    const compressed = new Uint8Array(output as ArrayLike<number>);
    const body = new Uint8Array(compressed.length);
    body.set(compressed);

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
        "content-length": String(body.byteLength),
      },
    });
  } catch (error) {
    console.error("Memory Zopfli compression failed", error);
    return new Response("Zopfli compression failed.", { status: 500 });
  }
}
