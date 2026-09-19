import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  parseAbi,
} from "viem";

import { siteConfig } from "../../../../../lib/config";

const GRID_WIDTH = 12;
const GRID_HEIGHT = 12;

const hoodFrameAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

type RouteContext = {
  params: Promise<{
    tokenId: string;
  }>;
};

type HoodFrameAttribute = {
  display_type?: string;
  trait_type?: string;
  value?: unknown;
};

type HoodFrameMetadata = {
  name?: string;
  description?: string;

  image?: string;
  image_data?: string;

  background_color?: string;

  attributes?: HoodFrameAttribute[];
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
  const commaIndex =
    uri.indexOf(",");

  if (commaIndex === -1) {
    throw new Error(
      "Invalid data URI."
    );
  }

  const header =
    uri.slice(
      0,
      commaIndex
    );

  const body =
    uri.slice(
      commaIndex + 1
    );

  if (
    header.includes(
      ";base64"
    )
  ) {
    return Buffer.from(
      body,
      "base64"
    ).toString(
      "utf8"
    );
  }

  return decodeURIComponent(
    body
  );
}

/* -------------------------------------------------------------------------- */
/* SVG helpers                                                                */
/* -------------------------------------------------------------------------- */

function readAttribute(
  source: string,
  attribute: string
) {
  const expression =
    new RegExp(
      `${attribute}\\s*=\\s*["']([^"']+)["']`,
      "i"
    );

  return (
    source.match(
      expression
    )?.[1] ??
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

  if (
    raw === null
  ) {
    return null;
  }

  const value =
    Number(raw);

  return Number.isFinite(
    value
  )
    ? value
    : null;
}

function normalizeColor(
  value: string | null
) {
  if (!value) {
    return null;
  }

  const color =
    value
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        ""
      );

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
      length:
        GRID_HEIGHT,
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
    let y =
      startY;
    y < endY;
    y += 1
  ) {
    for (
      let x =
        startX;
      x < endX;
      x += 1
    ) {
      grid[y][x] =
        value;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* SVG → Hood Break sprite                                                    */
/* -------------------------------------------------------------------------- */

function svgToRows(
  svg: string
) {
  const grid =
    createEmptyGrid();

  /*
   * HoodFrame renders its rectangles
   * directly in the SVG rather than
   * necessarily placing them inside <g>.
   *
   * Therefore we process EVERY rect
   * in document order.
   *
   * Hood Break mapping:
   *
   * ROBIN -> playable brick -> 1
   * BLACK -> empty space    -> 0
   *
   * Later rectangles overwrite earlier
   * rectangles naturally.
   */

  const rectTags =
    svg.match(
      /<rect\b[^>]*\/?>/gi
    ) ?? [];

  for (
    const rectTag of
    rectTags
  ) {
    const rectangle =
      parseRectangle(
        rectTag
      );

    if (
      !rectangle
    ) {
      continue;
    }

    const fill =
      normalizeColor(
        readAttribute(
          rectTag,
          "fill"
        )
      );

    if (
      fill ===
      "robin"
    ) {
      paintRectangle(
        grid,
        rectangle,
        1
      );
    } else if (
      fill ===
      "black"
    ) {
      paintRectangle(
        grid,
        rectangle,
        0
      );
    }
  }

  return grid.map(
    (row) =>
      row.join("")
  );
}

/* -------------------------------------------------------------------------- */
/* Sprite stats                                                               */
/* -------------------------------------------------------------------------- */

function countPixels(
  rows: string[]
) {
  let count =
    0;

  for (
    const row of
    rows
  ) {
    for (
      const pixel of
      row
    ) {
      if (
        pixel ===
        "1"
      ) {
        count +=
          1;
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

  let maxX =
    -1;

  let maxY =
    -1;

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
  metadata:
    HoodFrameMetadata,

  traitType:
    string
) {
  return (
    metadata.attributes?.find(
      (
        attribute
      ) =>
        attribute.trait_type ===
        traitType
    )?.value ??
    null
  );
}

function numberTrait(
  metadata:
    HoodFrameMetadata,

  traitType:
    string
) {
  const value =
    getTrait(
      metadata,
      traitType
    );

  if (
    typeof value ===
    "number"
  ) {
    return value;
  }

  if (
    typeof value ===
      "string" &&
    value.trim() !==
      ""
  ) {
    const parsed =
      Number(
        value
      );

    if (
      Number.isFinite(
        parsed
      )
    ) {
      return parsed;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request:
    NextRequest,

  context:
    RouteContext
) {
  try {
    const {
      tokenId,
    } =
      await context.params;

    /* ---------------------------------------------------------------------- */
    /* Validation                                                             */
    /* ---------------------------------------------------------------------- */

    if (
      !isValidTokenId(
        tokenId
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid HoodFrame token ID.",
        },

        {
          status:
            400,
        }
      );
    }

    if (
      !siteConfig.hoodFrameAddress
    ) {
      return NextResponse.json(
        {
          error:
            "HoodFrame contract is not configured for the active network.",
        },

        {
          status:
            500,
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
          status:
            500,
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Public client                                                          */
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
      BigInt(
        tokenId
      );

    /* ---------------------------------------------------------------------- */
    /* On-chain reads                                                         */
    /* ---------------------------------------------------------------------- */

    const [
      owner,
      tokenUri,
    ] =
      await Promise.all([
        client.readContract({
          address:
            siteConfig.hoodFrameAddress as `0x${string}`,

          abi:
            hoodFrameAbi,

          functionName:
            "ownerOf",

          args: [
            numericTokenId,
          ],
        }),

        client.readContract({
          address:
            siteConfig.hoodFrameAddress as `0x${string}`,

          abi:
            hoodFrameAbi,

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
        "HoodFrame tokenURI returned an invalid value."
      );
    }

    if (
      !tokenUri.startsWith(
        "data:"
      )
    ) {
      throw new Error(
        "HoodFrame tokenURI is not an on-chain data URI."
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Metadata                                                               */
    /* ---------------------------------------------------------------------- */

    const metadataString =
      decodeDataUri(
        tokenUri
      );

    let metadata:
      HoodFrameMetadata;

    try {
      metadata =
        JSON.parse(
          metadataString
        ) as HoodFrameMetadata;
    } catch {
      throw new Error(
        "HoodFrame metadata JSON could not be decoded."
      );
    }

    const imageData =
      metadata.image_data ??
      metadata.image;

    if (
      typeof imageData !==
      "string"
    ) {
      throw new Error(
        "HoodFrame metadata has no SVG image."
      );
    }

    if (
      !imageData.startsWith(
        "data:image/svg+xml"
      )
    ) {
      throw new Error(
        "HoodFrame image is not an SVG data URI."
      );
    }

    /* ---------------------------------------------------------------------- */
    /* SVG                                                                    */
    /* ---------------------------------------------------------------------- */

    const svg =
      decodeDataUri(
        imageData
      );

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
    /* HoodFrame metadata                                                     */
    /* ---------------------------------------------------------------------- */

    const originHoodie =
      numberTrait(
        metadata,
        "Origin Hoodie"
      );

    const sealedByHoodie =
      numberTrait(
        metadata,
        "Sealed By Hoodie"
      );

    const cropX =
      numberTrait(
        metadata,
        "X"
      );

    const cropY =
      numberTrait(
        metadata,
        "Y"
      );

    const sealedAt =
      numberTrait(
        metadata,
        "Sealed At"
      );

    const title =
      getTrait(
        metadata,
        "Title"
      );

    const frame =
      getTrait(
        metadata,
        "Frame"
      );

    /* ---------------------------------------------------------------------- */
    /* Response                                                               */
    /* ---------------------------------------------------------------------- */

    return NextResponse.json(
      {
        schemaVersion:
          "1.0",

        type:
          "hoodframe",

        tokenId,

        name:
          metadata.name ??
          `HoodFrame #${tokenId}`,

        network:
          siteConfig.network,

        chainId:
          siteConfig.chainId,

        contract:
          siteConfig.hoodFrameAddress,

        owner,

        hoodie: {
          originHoodie,
          sealedByHoodie,
        },

        crop: {
          x:
            cropX,

          y:
            cropY,
        },

        frame,

        title,

        sealedAt,

        metadata: {
          description:
            metadata.description ??
            null,

          backgroundColor:
            metadata.background_color ??
            null,
        },

        sprite: {
          format:
            "1bit-row-map",

          width:
            GRID_WIDTH,

          height:
            GRID_HEIGHT,

          /*
           * HoodFrame:
           *
           * 12 × 12 × 5
           * =
           * 60 × 60
           */
          gameScale:
            5,

          anchor: {
            x: 6,
            y: 6,
          },

          visiblePixelCount,

          bounds,

          pixels,
        },
      },

      {
        status:
          200,

        headers: {
          "Cache-Control":
            "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (
    error
  ) {
    console.error(
      "HoodFrame arcade route failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof
          Error
            ? error.message
            : "Unable to load HoodFrame from chain.",
      },

      {
        status:
          500,
      }
    );
  }
}