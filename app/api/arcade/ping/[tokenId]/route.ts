import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  parseAbi,
} from "viem";

import { siteConfig } from "../../../../../lib/config";

const GRID_WIDTH = 30;
const GRID_HEIGHT = 30;

const pingAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

type RouteContext = {
  params: Promise<{
    tokenId: string;
  }>;
};

type PingAttribute = {
  trait_type?: string;
  value?: unknown;
};

type PingMetadata = {
  name?: string;
  description?: string;

  image?: string;
  image_data?: string;

  background_color?: string;

  attributes?: PingAttribute[];
};

type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function isValidTokenId(value: string): boolean {
  try {
    return BigInt(value) >= BigInt(0);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Data URI                                                                   */
/* -------------------------------------------------------------------------- */

function decodeDataUri(uri: string) {
  const commaIndex = uri.indexOf(",");

  if (commaIndex === -1) {
    throw new Error("Invalid data URI.");
  }

  const header = uri.slice(0, commaIndex);
  const body = uri.slice(commaIndex + 1);

  if (header.includes(";base64")) {
    return Buffer.from(
      body,
      "base64"
    ).toString("utf8");
  }

  return decodeURIComponent(body);
}

/* -------------------------------------------------------------------------- */
/* SVG helpers                                                                */
/* -------------------------------------------------------------------------- */

function readAttribute(
  source: string,
  attribute: string
) {
  const expression = new RegExp(
    `${attribute}\\s*=\\s*["']([^"']+)["']`,
    "i"
  );

  return (
    source.match(expression)?.[1] ??
    null
  );
}

function readNumberAttribute(
  source: string,
  attribute: string
) {
  const raw =
    readAttribute(
      source,
      attribute
    );

  if (raw === null) {
    return null;
  }

  const value = Number(raw);

  return Number.isFinite(value)
    ? value
    : null;
}

function normalizeColor(
  value: string | null
) {
  if (!value) {
    return null;
  }

  const color = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  if (
    color === "#000" ||
    color === "#000000" ||
    color === "black" ||
    color === "rgb(0,0,0)"
  ) {
    return "black";
  }

  if (
    color === "#cf0" ||
    color === "#ccff00" ||
    color === "rgb(204,255,0)"
  ) {
    return "robin";
  }

  return color;
}

function parseRectangle(
  tag: string
): Rectangle | null {
  const width =
    readNumberAttribute(
      tag,
      "width"
    );

  const height =
    readNumberAttribute(
      tag,
      "height"
    );

  if (
    width === null ||
    height === null
  ) {
    return null;
  }

  return {
    x:
      readNumberAttribute(
        tag,
        "x"
      ) ?? 0,

    y:
      readNumberAttribute(
        tag,
        "y"
      ) ?? 0,

    width,
    height,
  };
}

function createEmptyGrid() {
  return Array.from(
    {
      length: GRID_HEIGHT,
    },
    () =>
      Array<number>(
        GRID_WIDTH
      ).fill(0)
  );
}

function paintRectangle(
  grid: number[][],
  rectangle: Rectangle,
  value: 0 | 1
) {
  const startX =
    Math.max(
      0,
      Math.floor(
        rectangle.x
      )
    );

  const startY =
    Math.max(
      0,
      Math.floor(
        rectangle.y
      )
    );

  const endX =
    Math.min(
      GRID_WIDTH,
      Math.ceil(
        rectangle.x +
          rectangle.width
      )
    );

  const endY =
    Math.min(
      GRID_HEIGHT,
      Math.ceil(
        rectangle.y +
          rectangle.height
      )
    );

  for (
    let y = startY;
    y < endY;
    y += 1
  ) {
    for (
      let x = startX;
      x < endX;
      x += 1
    ) {
      grid[y][x] =
        value;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Ping SVG → Hood Break sprite                                               */
/* -------------------------------------------------------------------------- */

function svgToRows(
  svg: string
) {
  /*
   * Start completely empty.
   *
   * Hood Break Ping mapping:
   *
   * original ROBIN pixel
   *   -> playable brick
   *   -> 1
   *
   * original BLACK pixel
   *   -> empty game space
   *   -> 0
   *
   * This is intentionally the inverse
   * of the previous Ping route.
   *
   * Ping's full 30×30 black background
   * therefore becomes empty automatically.
   */

  const grid =
    createEmptyGrid();

  /*
   * Preserve SVG layer order.
   *
   * A later rectangle may overwrite
   * an earlier rectangle, exactly as
   * the actual SVG renderer does.
   */
  const groupExpression =
    /<g\b([^>]*)>([\s\S]*?)<\/g>/gi;

  let groupMatch:
    RegExpExecArray | null;

  while (
    (
      groupMatch =
        groupExpression.exec(
          svg
        )
    ) !== null
  ) {
    const groupAttributes =
      groupMatch[1] ?? "";

    const groupBody =
      groupMatch[2] ?? "";

    const groupFill =
      normalizeColor(
        readAttribute(
          groupAttributes,
          "fill"
        )
      );

    const rectangleTags =
      groupBody.match(
        /<rect\b[^>]*\/?>/gi
      ) ?? [];

    for (
      const rectangleTag of
      rectangleTags
    ) {
      const rectangle =
        parseRectangle(
          rectangleTag
        );

      if (!rectangle) {
        continue;
      }

      /*
       * A rect may define its own fill.
       * If it does not, inherit the
       * parent group's fill.
       */
      const rectangleFill =
        normalizeColor(
          readAttribute(
            rectangleTag,
            "fill"
          )
        );

      const finalFill =
        rectangleFill ??
        groupFill;

      /*
       * INVERTED PING MAPPING
       */
      if (
        finalFill ===
        "robin"
      ) {
        paintRectangle(
          grid,
          rectangle,
          1
        );
      } else if (
        finalFill ===
        "black"
      ) {
        paintRectangle(
          grid,
          rectangle,
          0
        );
      }
    }
  }

  return grid.map(
    (row) =>
      row.join("")
  );
}

/* -------------------------------------------------------------------------- */
/* Sprite statistics                                                          */
/* -------------------------------------------------------------------------- */

function countPixels(
  rows: string[]
) {
  let count = 0;

  for (
    const row of rows
  ) {
    for (
      const pixel of row
    ) {
      if (
        pixel === "1"
      ) {
        count += 1;
      }
    }
  }

  return count;
}

function calculateBounds(
  rows: string[]
) {
  let minX =
    GRID_WIDTH;

  let minY =
    GRID_HEIGHT;

  let maxX = -1;
  let maxY = -1;

  for (
    let y = 0;
    y < GRID_HEIGHT;
    y += 1
  ) {
    for (
      let x = 0;
      x < GRID_WIDTH;
      x += 1
    ) {
      if (
        rows[y]?.[x] !==
        "1"
      ) {
        continue;
      }

      minX =
        Math.min(
          minX,
          x
        );

      minY =
        Math.min(
          minY,
          y
        );

      maxX =
        Math.max(
          maxX,
          x
        );

      maxY =
        Math.max(
          maxY,
          y
        );
    }
  }

  if (
    maxX < 0 ||
    maxY < 0
  ) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,

    width:
      maxX -
      minX +
      1,

    height:
      maxY -
      minY +
      1,
  };
}

/* -------------------------------------------------------------------------- */
/* Metadata helpers                                                           */
/* -------------------------------------------------------------------------- */

function getTrait(
  metadata: PingMetadata,
  traitType: string
) {
  return (
    metadata.attributes?.find(
      (attribute) =>
        attribute.trait_type ===
        traitType
    )?.value ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { tokenId } =
      await context.params;

    /* ---------------------------------------------------------------------- */
    /* Validate                                                               */
    /* ---------------------------------------------------------------------- */

    if (
      !isValidTokenId(
        tokenId
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid Ping token ID.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !siteConfig.pingAddress
    ) {
      return NextResponse.json(
        {
          error:
            "Ping contract is not configured for the active network.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !siteConfig.rpcUrl
    ) {
      return NextResponse.json(
        {
          error:
            "RPC URL is not configured for the active network.",
        },
        {
          status: 500,
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Viem client                                                            */
    /* ---------------------------------------------------------------------- */

    const client =
      createPublicClient({
        chain:
          siteConfig.chain,

        transport:
          http(
            siteConfig.rpcUrl
          ),
      });

    const numericTokenId =
      BigInt(tokenId);

    /* ---------------------------------------------------------------------- */
    /* Read live blockchain state                                             */
    /* ---------------------------------------------------------------------- */

    const [
      owner,
      tokenUri,
    ] =
      await Promise.all([
        client.readContract({
          address:
            siteConfig.pingAddress as `0x${string}`,

          abi:
            pingAbi,

          functionName:
            "ownerOf",

          args: [
            numericTokenId,
          ],
        }),

        client.readContract({
          address:
            siteConfig.pingAddress as `0x${string}`,

          abi:
            pingAbi,

          functionName:
            "tokenURI",

          args: [
            numericTokenId,
          ],
        }),
      ]);

    if (
      typeof tokenUri !==
      "string"
    ) {
      throw new Error(
        "Ping tokenURI returned an invalid value."
      );
    }

    if (
      !tokenUri.startsWith(
        "data:"
      )
    ) {
      throw new Error(
        "Ping tokenURI is not stored as an on-chain data URI."
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Decode metadata                                                        */
    /* ---------------------------------------------------------------------- */

    const metadataString =
      decodeDataUri(
        tokenUri
      );

    let metadata:
      PingMetadata;

    try {
      metadata =
        JSON.parse(
          metadataString
        ) as PingMetadata;
    } catch {
      throw new Error(
        "Ping metadata JSON could not be decoded."
      );
    }

    /*
     * Ping currently exposes image_data.
     * image remains as a fallback.
     */
    const imageData =
      metadata.image_data ??
      metadata.image;

    if (
      typeof imageData !==
      "string"
    ) {
      throw new Error(
        "Ping metadata does not contain image_data."
      );
    }

    if (
      !imageData.startsWith(
        "data:image/svg+xml"
      )
    ) {
      throw new Error(
        "Ping image_data is not an SVG data URI."
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Decode current SVG                                                     */
    /* ---------------------------------------------------------------------- */

    const svg =
      decodeDataUri(
        imageData
      );

    /* ---------------------------------------------------------------------- */
    /* Convert to game sprite                                                 */
    /* ---------------------------------------------------------------------- */

    const pixels =
      svgToRows(
        svg
      );

    const visiblePixelCount =
      countPixels(
        pixels
      );

    const bounds =
      calculateBounds(
        pixels
      );

    /* ---------------------------------------------------------------------- */
    /* Response                                                               */
    /* ---------------------------------------------------------------------- */

    return NextResponse.json(
      {
        schemaVersion:
          "1.0",

        type:
          "ping",

        tokenId,

        name:
          metadata.name ??
          `Ping #${tokenId}`,

        network:
          siteConfig.network,

        chainId:
          siteConfig.chainId,

        contract:
          siteConfig.pingAddress,

        owner,

        metadata: {
          description:
            metadata.description ??
            null,

          backgroundColor:
            metadata.background_color ??
            null,
        },

        traits: {
          ping:
            getTrait(
              metadata,
              "Ping"
            ),

          feet:
            getTrait(
              metadata,
              "Feet"
            ),

          tail:
            getTrait(
              metadata,
              "Tail"
            ),

          mouth:
            getTrait(
              metadata,
              "Mouth"
            ),

          eyes:
            getTrait(
              metadata,
              "Eyes"
            ),

          top:
            getTrait(
              metadata,
              "Top"
            ),
        },

        sprite: {
          format:
            "1bit-row-map",

          width:
            GRID_WIDTH,

          height:
            GRID_HEIGHT,

          /*
           * Native Ping:
           *
           * 30 × 30
           *
           * Game:
           *
           * 30 × 2
           * = 60 × 60
           */
          gameScale:
            2,

          anchor: {
            x: 15,
            y: 15,
          },

          visiblePixelCount,

          bounds,

          pixels,
        },
      },
      {
        status: 200,

        headers: {
          /*
           * Artwork is on-chain but
           * ownership can change.
           */
          "Cache-Control":
            "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error(
      "Ping arcade route failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Ping from chain.",
      },
      {
        status: 500,
      }
    );
  }
}