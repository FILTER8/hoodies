import {
  NextRequest,
  NextResponse,
} from "next/server";

/*//////////////////////////////////////////////////////////////
                      ALLOWED IMAGE HOSTS
//////////////////////////////////////////////////////////////*/

const ALLOWED_HOSTS = [
  "i.seadn.io",
  "i2.seadn.io",

  "raw.seadn.io",
  "raw2.seadn.io",

  "storage.googleapis.com",
  "openseauserdata.com",

  "ipfs.io",
  "cloudflare-ipfs.com",
];

/*//////////////////////////////////////////////////////////////
                            HELPERS
//////////////////////////////////////////////////////////////*/

function normalizeIpfs(
  value: string,
) {
  if (
    value.startsWith(
      "ipfs://",
    )
  ) {
    return `https://ipfs.io/ipfs/${value.slice(
      "ipfs://".length,
    )}`;
  }

  return value;
}

function allowedHost(
  hostname: string,
) {
  const lower =
    hostname.toLowerCase();

  return ALLOWED_HOSTS.some(
    (
      allowed,
    ) =>
      lower === allowed ||
      lower.endsWith(
        `.${allowed}`,
      ),
  );
}

/*
 * OpenSea often gives us raw video assets like:
 *
 * https://raw2.seadn.io/.../asset.mp4
 *
 * But the OpenSea UI itself commonly renders these
 * through its image CDN.
 *
 * Convert:
 *
 * raw2.seadn.io
 *
 * into:
 *
 * i2.seadn.io
 *
 * Then ask SeaDN for frame-time=1.
 */
function normalizeSeaDn(
  source: URL,
) {
  const hostname =
    source.hostname.toLowerCase();

  if (
    hostname ===
    "raw2.seadn.io"
  ) {
    source.hostname =
      "i2.seadn.io";
  }

  if (
    hostname ===
    "raw.seadn.io"
  ) {
    source.hostname =
      "i.seadn.io";
  }

  const normalizedHost =
    source.hostname.toLowerCase();

  if (
    normalizedHost ===
      "i.seadn.io" ||
    normalizedHost ===
      "i2.seadn.io"
  ) {
    /*
     * This causes SeaDN to render a frame
     * from animated/video media.
     */
    source.searchParams.set(
      "frame-time",
      "1",
    );

    source.searchParams.set(
      "w",
      "800",
    );

    source.searchParams.set(
      "h",
      "800",
    );
  }

  return source;
}

/*//////////////////////////////////////////////////////////////
                              GET
//////////////////////////////////////////////////////////////*/

export async function GET(
  request: NextRequest,
) {
  try {
    const {
      searchParams,
    } =
      new URL(
        request.url,
      );

    const raw =
      searchParams.get(
        "url",
      );

    if (!raw) {
      return NextResponse.json(
        {
          error:
            "Missing image URL.",
        },
        {
          status:
            400,
        },
      );
    }

    const normalized =
      normalizeIpfs(
        raw,
      );

    let source:
      URL;

    try {
      source =
        new URL(
          normalized,
        );
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid image URL.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      source.protocol !==
      "https:"
    ) {
      return NextResponse.json(
        {
          error:
            "Only HTTPS image URLs are supported.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      !allowedHost(
        source.hostname,
      )
    ) {
      console.warn(
        "BuyOS image host rejected:",
        source.hostname,
      );

      return NextResponse.json(
        {
          error:
            `Image host not supported: ${source.hostname}`,
        },
        {
          status:
            400,
        },
      );
    }

    /*
     * Convert raw SeaDN video URL
     * into SeaDN rendered preview.
     */
    source =
      normalizeSeaDn(
        source,
      );

    console.log(
      "BuyOS image fetch:",
      source.toString(),
    );

    const response =
      await fetch(
        source.toString(),
        {
          headers: {
            accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",

            "user-agent":
              "OnChainHoodies-BuyOS/1.0",
          },

          redirect:
            "follow",

          cache:
            "force-cache",
        },
      );

    if (
      !response.ok
    ) {
      console.warn(
        "BuyOS remote image failed:",
        response.status,
        source.toString(),
      );

      return NextResponse.json(
        {
          error:
            `Remote image request failed (${response.status}).`,
        },
        {
          status:
            502,
        },
      );
    }

    const contentType =
      response.headers.get(
        "content-type",
      ) ||
      "";

    console.log(
      "BuyOS image content-type:",
      contentType,
    );

    if (
      !contentType.startsWith(
        "image/",
      )
    ) {
      return NextResponse.json(
        {
          error:
            `Remote media returned ${contentType || "unknown content type"}, not an image.`,
        },
        {
          status:
            415,
        },
      );
    }

    const body =
      await response.arrayBuffer();

    return new NextResponse(
      body,
      {
        status:
          200,

        headers: {
          "content-type":
            contentType,

          "cache-control":
            "public, max-age=3600, s-maxage=86400",

          "x-content-type-options":
            "nosniff",
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      "BuyOS image:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof
          Error
            ? error.message
            : "Unable to load NFT image.",
      },
      {
        status:
          500,
      },
    );
  }
}