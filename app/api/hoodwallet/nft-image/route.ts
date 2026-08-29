import {
  NextRequest,
  NextResponse,
} from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function normalizeDecentralizedUrl(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("ipfs://")) {
    let path = trimmed.slice("ipfs://".length);

    if (path.startsWith("ipfs/")) {
      path = path.slice("ipfs/".length);
    }

    return `https://ipfs.io/ipfs/${path}`;
  }

  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice("ar://".length)}`;
  }

  return trimmed;
}

function isBlockedHostname(hostname: string) {
  const host = hostname.trim().toLowerCase();

  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host === "169.254.169.254"
  ) {
    return true;
  }

  const ipv4Match = host.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );

  if (!ipv4Match) {
    return false;
  }

  const parts = ipv4Match.slice(1).map(Number);

  if (
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255,
    )
  ) {
    return true;
  }

  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127 || a >= 224) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  return false;
}

function normalizeSeaDn(input: URL) {
  const source = new URL(input.toString());
  const hostname = source.hostname.toLowerCase();

  if (hostname === "raw2.seadn.io") {
    source.hostname = "i2.seadn.io";
  } else if (hostname === "raw.seadn.io") {
    source.hostname = "i.seadn.io";
  }

  const finalHost = source.hostname.toLowerCase();

  if (finalHost === "i.seadn.io" || finalHost === "i2.seadn.io") {
    source.searchParams.set("frame-time", "1");
    source.searchParams.set("w", "800");
    source.searchParams.set("h", "800");
    source.searchParams.set("fit", "contain");
  }

  return source;
}

function isImageContentType(contentType: string) {
  return contentType.toLowerCase().startsWith("image/");
}

function looksLikeSvg(body: ArrayBuffer) {
  try {
    const sample = new Uint8Array(
      body,
      0,
      Math.min(body.byteLength, 2048),
    );

    const text = new TextDecoder("utf-8", {
      fatal: false,
    })
      .decode(sample)
      .trimStart()
      .toLowerCase();

    return (
      text.startsWith("<svg") ||
      (text.startsWith("<?xml") && text.includes("<svg"))
    );
  } catch {
    return false;
  }
}

function inferImageTypeFromUrl(source: URL) {
  const pathname = source.pathname.toLowerCase();

  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".avif")) return "image/avif";

  return "";
}

function dataImageResponse(raw: string) {
  const commaIndex = raw.indexOf(",");

  if (commaIndex <= 0) {
    throw new Error("Invalid data image.");
  }

  const header = raw.slice(5, commaIndex);
  const payload = raw.slice(commaIndex + 1);
  const headerParts = header.split(";");
  const contentType = headerParts[0]?.trim() || "image/svg+xml";

  if (!isImageContentType(contentType)) {
    throw new Error("Data URL is not an image.");
  }

  const isBase64 = headerParts.some(
    (part) => part.trim().toLowerCase() === "base64",
  );

  let body: ArrayBuffer;

  if (isBase64) {
    const bytes = Buffer.from(payload, "base64");
    body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  } else {
    const bytes = new TextEncoder().encode(
      decodeURIComponent(payload),
    );
    body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  }

  if (body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("The NFT image is too large to proxy.");
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const rawUrl =
    request.nextUrl.searchParams.get("url")?.trim() || "";

  if (!rawUrl) {
    return NextResponse.json(
      {
        error: "An NFT image URL is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (rawUrl.toLowerCase().startsWith("data:image/")) {
    try {
      return dataImageResponse(rawUrl);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to decode NFT image.";

      return NextResponse.json(
        {
          error: message,
        },
        {
          status: message.includes("too large") ? 413 : 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }

  const normalized = normalizeDecentralizedUrl(rawUrl);
  let source: URL;

  try {
    source = new URL(normalized);
  } catch {
    return NextResponse.json(
      {
        error: "Invalid NFT image URL.",
      },
      {
        status: 400,
      },
    );
  }

  if (source.protocol !== "https:") {
    return NextResponse.json(
      {
        error: "Only HTTPS NFT image URLs are supported.",
      },
      {
        status: 400,
      },
    );
  }

  if (source.username || source.password) {
    return NextResponse.json(
      {
        error: "NFT image URLs containing credentials are not supported.",
      },
      {
        status: 400,
      },
    );
  }

  if (isBlockedHostname(source.hostname)) {
    return NextResponse.json(
      {
        error: "Private NFT image hosts are not supported.",
      },
      {
        status: 400,
      },
    );
  }

  source = normalizeSeaDn(source);
  const remoteUrl = source.toString();

  try {
    const response = await fetch(remoteUrl, {
      headers: {
        accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (compatible; OnChainHoodies-HoodWallet/1.0)",
      },
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Remote NFT image request failed (${response.status}).`,
        },
        {
          status: response.status === 404 ? 404 : 502,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const declaredLength = Number(
      response.headers.get("content-length") || "0",
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_IMAGE_BYTES
    ) {
      return NextResponse.json(
        {
          error: "The NFT image is too large to proxy.",
        },
        {
          status: 413,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: "The NFT image is too large to proxy.",
        },
        {
          status: 413,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    let contentType =
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() || "";

    if (!isImageContentType(contentType) && looksLikeSvg(arrayBuffer)) {
      contentType = "image/svg+xml";
    }

    if (!isImageContentType(contentType)) {
      const inferred = inferImageTypeFromUrl(source);

      if (inferred) {
        contentType = inferred;
      }
    }

    if (!contentType || !isImageContentType(contentType)) {
      return NextResponse.json(
        {
          error: `Remote media returned ${
            contentType || "unknown content type"
          }, not a renderable image.`,
        },
        {
          status: 415,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
        "X-HoodWallet-Image-Source": source.hostname,
      },
    });
  } catch (error) {
    console.error(
      `HoodWallet NFT image proxy failed for ${remoteUrl}:`,
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load NFT image.",
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
