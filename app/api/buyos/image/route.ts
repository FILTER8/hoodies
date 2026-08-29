import {
  NextRequest,
  NextResponse,
} from "next/server";

/*//////////////////////////////////////////////////////////////
                            HELPERS
//////////////////////////////////////////////////////////////*/

function normalizeDecentralizedUrl(
  value: string,
) {
  const trimmed =
    value.trim();

  /*
   * IPFS
   *
   * ipfs://CID/file.png
   * ->
   * https://ipfs.io/ipfs/CID/file.png
   */
  if (
    trimmed.startsWith(
      "ipfs://",
    )
  ) {
    let path =
      trimmed.slice(
        "ipfs://".length,
      );

    /*
     * Some metadata uses:
     *
     * ipfs://ipfs/CID
     *
     * Avoid producing:
     *
     * /ipfs/ipfs/CID
     */
    if (
      path.startsWith(
        "ipfs/",
      )
    ) {
      path =
        path.slice(
          "ipfs/".length,
        );
    }

    return `https://ipfs.io/ipfs/${path}`;
  }

  /*
   * Arweave
   *
   * ar://TX_ID
   * ->
   * https://arweave.net/TX_ID
   */
  if (
    trimmed.startsWith(
      "ar://",
    )
  ) {
    return `https://arweave.net/${trimmed.slice(
      "ar://".length,
    )}`;
  }

  return trimmed;
}

/*
 * Don't allow obvious local/private targets.
 *
 * This lets BuyOS work with arbitrary NFT image hosts
 * without turning the route into an unrestricted
 * localhost/private-network proxy.
 */
function isBlockedHostname(
  hostname: string,
) {
  const host =
    hostname
      .trim()
      .toLowerCase();

  if (
    !host ||
    host === "localhost" ||
    host.endsWith(
      ".localhost",
    ) ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }

  /*
   * Cloud metadata endpoint.
   */
  if (
    host ===
    "169.254.169.254"
  ) {
    return true;
  }

  /*
   * Direct IPv4 address.
   */
  const match =
    host.match(
      /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
    );

  if (!match) {
    return false;
  }

  const parts =
    match
      .slice(1)
      .map(
        Number,
      );

  if (
    parts.some(
      (
        part,
      ) =>
        !Number.isInteger(
          part,
        ) ||
        part < 0 ||
        part > 255,
    )
  ) {
    return true;
  }

  const [
    a,
    b,
  ] =
    parts;

  /*
   * 0.0.0.0/8
   */
  if (a === 0) {
    return true;
  }

  /*
   * 10.0.0.0/8
   */
  if (a === 10) {
    return true;
  }

  /*
   * 127.0.0.0/8
   */
  if (a === 127) {
    return true;
  }

  /*
   * 169.254.0.0/16
   */
  if (
    a === 169 &&
    b === 254
  ) {
    return true;
  }

  /*
   * 172.16.0.0/12
   */
  if (
    a === 172 &&
    b >= 16 &&
    b <= 31
  ) {
    return true;
  }

  /*
   * 192.168.0.0/16
   */
  if (
    a === 192 &&
    b === 168
  ) {
    return true;
  }

  /*
   * Multicast / reserved.
   */
  if (a >= 224) {
    return true;
  }

  return false;
}

/*
 * OpenSea occasionally gives us raw media:
 *
 * https://raw2.seadn.io/.../asset.mp4
 *
 * Convert it to OpenSea's image-rendering CDN:
 *
 * raw2.seadn.io -> i2.seadn.io
 * raw.seadn.io  -> i.seadn.io
 *
 * frame-time=1 asks SeaDN for a still preview.
 */
function normalizeSeaDn(
  input: URL,
) {
  const source =
    new URL(
      input.toString(),
    );

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

    source.searchParams.set(
      "fit",
      "contain",
    );
  }

  return source;
}

/*//////////////////////////////////////////////////////////////
                       DATA IMAGE SUPPORT
//////////////////////////////////////////////////////////////*/

function dataImageResponse(
  raw: string,
) {
  const commaIndex =
    raw.indexOf(
      ",",
    );

  if (
    commaIndex <= 0
  ) {
    throw new Error(
      "Invalid data image.",
    );
  }

  const header =
    raw.slice(
      5,
      commaIndex,
    );

  const payload =
    raw.slice(
      commaIndex + 1,
    );

  const headerParts =
    header.split(
      ";",
    );

  const contentType =
    headerParts[0]
      ?.trim() ||
    "image/svg+xml";

  if (
    !contentType
      .toLowerCase()
      .startsWith(
        "image/",
      )
  ) {
    throw new Error(
      "Data URL is not an image.",
    );
  }

  const isBase64 =
    headerParts.some(
      (
        part,
      ) =>
        part
          .trim()
          .toLowerCase() ===
        "base64",
    );

 let body:
  ArrayBuffer;

if (isBase64) {
  const bytes =
    Buffer.from(
      payload,
      "base64",
    );

  body =
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset +
        bytes.byteLength,
    );
} else {
  const bytes =
    new TextEncoder().encode(
      decodeURIComponent(
        payload,
      ),
    );

  body =
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset +
        bytes.byteLength,
    );
}

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
}

/*//////////////////////////////////////////////////////////////
                       CONTENT DETECTION
//////////////////////////////////////////////////////////////*/

function looksLikeSvg(
  body: ArrayBuffer,
) {
  try {
    const sample =
      new Uint8Array(
        body,
        0,
        Math.min(
          body.byteLength,
          2048,
        ),
      );

    const text =
      new TextDecoder(
        "utf-8",
        {
          fatal:
            false,
        },
      )
        .decode(
          sample,
        )
        .trimStart()
        .toLowerCase();

    return (
      text.startsWith(
        "<svg",
      ) ||
      text.startsWith(
        "<?xml",
      ) &&
      text.includes(
        "<svg",
      )
    );
  } catch {
    return false;
  }
}

function inferImageTypeFromUrl(
  source: URL,
) {
  const pathname =
    source.pathname
      .toLowerCase();

  if (
    pathname.endsWith(
      ".svg",
    )
  ) {
    return "image/svg+xml";
  }

  if (
    pathname.endsWith(
      ".png",
    )
  ) {
    return "image/png";
  }

  if (
    pathname.endsWith(
      ".jpg",
    ) ||
    pathname.endsWith(
      ".jpeg",
    )
  ) {
    return "image/jpeg";
  }

  if (
    pathname.endsWith(
      ".webp",
    )
  ) {
    return "image/webp";
  }

  if (
    pathname.endsWith(
      ".gif",
    )
  ) {
    return "image/gif";
  }

  if (
    pathname.endsWith(
      ".avif",
    )
  ) {
    return "image/avif";
  }

  return "";
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

    /*////////////////////////////////////////////////////////////
                         DATA IMAGE
    ////////////////////////////////////////////////////////////*/

    if (
      raw
        .trim()
        .toLowerCase()
        .startsWith(
          "data:image/",
        )
    ) {
      try {
        return dataImageResponse(
          raw.trim(),
        );
      } catch (
        error
      ) {
        console.error(
          "BuyOS data image:",
          error,
        );

        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Unable to decode NFT image.",
          },
          {
            status:
              400,
          },
        );
      }
    }

    /*////////////////////////////////////////////////////////////
                    NORMAL URL / IPFS / ARWEAVE
    ////////////////////////////////////////////////////////////*/

    const normalized =
      normalizeDecentralizedUrl(
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

    /*
     * Only remote HTTPS artwork.
     */
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

    /*
     * Don't allow URLs containing credentials.
     */
    if (
      source.username ||
      source.password
    ) {
      return NextResponse.json(
        {
          error:
            "Image URLs containing credentials are not supported.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      isBlockedHostname(
        source.hostname,
      )
    ) {
      console.warn(
        "BuyOS image host blocked:",
        source.hostname,
      );

      return NextResponse.json(
        {
          error:
            "Private image hosts are not supported.",
        },
        {
          status:
            400,
        },
      );
    }

    /*
     * Convert OpenSea raw/video media
     * into a rendered preview when possible.
     */
    source =
      normalizeSeaDn(
        source,
      );

    console.log(
      "BuyOS image fetch:",
      source.toString(),
    );

    /*////////////////////////////////////////////////////////////
                           FETCH IMAGE
    ////////////////////////////////////////////////////////////*/

    const response =
      await fetch(
        source.toString(),
        {
          method:
            "GET",

          headers: {
            accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",

            "user-agent":
              "Mozilla/5.0 (compatible; OnChainHoodies-BuyOS/1.0)",
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

    /*////////////////////////////////////////////////////////////
                         RESPONSE BODY
    ////////////////////////////////////////////////////////////*/

    const body =
      await response.arrayBuffer();

    let contentType =
      response.headers
        .get(
          "content-type",
        )
        ?.split(
          ";",
        )[0]
        ?.trim()
        .toLowerCase() ||
      "";

    console.log(
      "BuyOS image content-type:",
      contentType ||
        "unknown",
    );

    /*
     * Some NFT servers return SVG as:
     *
     * text/plain
     * application/xml
     * application/octet-stream
     *
     * Detect the SVG body ourselves.
     */
    if (
      !contentType.startsWith(
        "image/",
      )
    ) {
      if (
        looksLikeSvg(
          body,
        )
      ) {
        contentType =
          "image/svg+xml";
      }
    }

    /*
     * Last fallback:
     * infer common image types from file extension.
     */
    if (
      !contentType.startsWith(
        "image/",
      )
    ) {
      const inferred =
        inferImageTypeFromUrl(
          source,
        );

      if (inferred) {
        contentType =
          inferred;
      }
    }

    if (
      !contentType.startsWith(
        "image/",
      )
    ) {
      console.warn(
        "BuyOS remote media is not image:",
        contentType ||
          "unknown",
        source.toString(),
      );

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

    /*////////////////////////////////////////////////////////////
                             SUCCESS
    ////////////////////////////////////////////////////////////*/

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

          /*
           * Useful while testing BuyOS.
           */
          "x-buyos-image-source":
            source.hostname,
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
          error instanceof Error
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