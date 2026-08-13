import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/*//////////////////////////////////////////////////////////////
                              CONFIG
//////////////////////////////////////////////////////////////*/

const ALLOWED_HOSTS = new Set([
  "nft2-cdn.alchemy.com",
  "nft-cdn.alchemy.com",
  "res.cloudinary.com",
  "ipfs.io",
  "gateway.pinata.cloud",
]);

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/*//////////////////////////////////////////////////////////////
                              HELPERS
//////////////////////////////////////////////////////////////*/

function isAllowedRemoteUrl(value: string) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return false;
    }

    return ALLOWED_HOSTS.has(
      url.hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}

function normalizeIpfsUrl(value: string) {
  const trimmed = value.trim();

  if (
    trimmed.startsWith("ipfs://")
  ) {
    const path = trimmed.slice(
      "ipfs://".length,
    );

    return `https://ipfs.io/ipfs/${path}`;
  }

  return trimmed;
}

function isImageContentType(
  contentType: string,
) {
  return contentType
    .toLowerCase()
    .startsWith("image/");
}

/*//////////////////////////////////////////////////////////////
                              ROUTE
//////////////////////////////////////////////////////////////*/

export async function GET(
  request: NextRequest,
) {
  const rawUrl =
    request.nextUrl.searchParams
      .get("url")
      ?.trim() || "";

  if (!rawUrl) {
    return NextResponse.json(
      {
        error:
          "An NFT image URL is required.",
      },
      {
        status: 400,
      },
    );
  }

  const remoteUrl =
    normalizeIpfsUrl(
      rawUrl,
    );

  if (
    !isAllowedRemoteUrl(
      remoteUrl,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "This NFT image host is not allowed.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const response =
      await fetch(
        remoteUrl,
        {
          headers: {
            accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",

            /*
             * Some NFT CDNs behave
             * better with a normal
             * browser-style user agent.
             */
            "user-agent":
              "Mozilla/5.0 HoodWallet Image Proxy",
          },

          cache:
            "no-store",

          redirect:
            "follow",
        },
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Remote NFT image request failed (${response.status}).`,
      );
    }

    const contentType =
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim() ||
      "";

    if (
      !contentType ||
      !isImageContentType(
        contentType,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The remote URL did not return an image.",
        },
        {
          status: 415,
        },
      );
    }

    const declaredLength =
      Number(
        response.headers.get(
          "content-length",
        ) || "0",
      );

    if (
      Number.isFinite(
        declaredLength,
      ) &&
      declaredLength >
        MAX_IMAGE_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            "The NFT image is too large to proxy.",
        },
        {
          status: 413,
        },
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    if (
      arrayBuffer.byteLength >
      MAX_IMAGE_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            "The NFT image is too large to proxy.",
        },
        {
          status: 413,
        },
      );
    }

    return new NextResponse(
      arrayBuffer,
      {
        status: 200,

        headers: {
          "Content-Type":
            contentType,

          /*
           * This route exists specifically
           * so HoodWallet can safely use
           * NFT artwork inside a canvas.
           */
          "Access-Control-Allow-Origin":
            "*",

          /*
           * No cache while we are still
           * testing NFT export behavior.
           *
           * Later this can safely become
           * something like:
           *
           * public, s-maxage=86400,
           * stale-while-revalidate=604800
           */
          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
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
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}