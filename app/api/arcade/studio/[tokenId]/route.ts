import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  parseAbi,
} from "viem";

import { siteConfig } from "../../../../../lib/config";

const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;

const hoodieArtAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

type RouteContext = {
  params: Promise<{
    tokenId: string;
  }>;
};

type HoodieArtAttribute = {
  display_type?: string;
  trait_type?: string;
  value?: unknown;
};

type HoodieArtMetadata = {
  name?: string;
  description?: string;
  image?: string;
  image_data?: string;
  background_color?: string;
  attributes?: HoodieArtAttribute[];
};

type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isValidTokenId(value: string): boolean {
  try {
    return BigInt(value) >= BigInt(0);
  } catch {
    return false;
  }
}

function decodeDataUri(uri: string) {
  const commaIndex = uri.indexOf(",");

  if (commaIndex === -1) {
    throw new Error("Invalid data URI.");
  }

  const header = uri.slice(0, commaIndex);
  const body = uri.slice(commaIndex + 1);

  if (header.includes(";base64")) {
    return Buffer.from(body, "base64").toString("utf8");
  }

  return decodeURIComponent(body);
}

function readAttribute(
  source: string,
  attribute: string
) {
  const expression = new RegExp(
    `${attribute}\\s*=\\s*["']([^"']+)["']`,
    "i"
  );

  return source.match(expression)?.[1] ?? null;
}

function readNumberAttribute(
  source: string,
  attribute: string
) {
  const raw = readAttribute(source, attribute);

  if (raw === null) return null;

  const value = Number(raw);

  return Number.isFinite(value)
    ? value
    : null;
}

function normalizeColor(
  value: string | null
) {
  if (!value) return null;

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
  const width = readNumberAttribute(tag, "width");
  const height = readNumberAttribute(tag, "height");

  if (
    width === null ||
    height === null
  ) {
    return null;
  }

  return {
    x: readNumberAttribute(tag, "x") ?? 0,
    y: readNumberAttribute(tag, "y") ?? 0,
    width,
    height,
  };
}

function createEmptyGrid() {
  return Array.from(
    { length: GRID_HEIGHT },
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
  const startX = Math.max(
    0,
    Math.floor(rectangle.x)
  );

  const startY = Math.max(
    0,
    Math.floor(rectangle.y)
  );

  const endX = Math.min(
    GRID_WIDTH,
    Math.ceil(
      rectangle.x +
        rectangle.width
    )
  );

  const endY = Math.min(
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
      grid[y][x] = value;
    }
  }
}

/*
 * STUDIO IS INTENTIONALLY INVERTED FOR HOOD BREAK:
 *
 * Original Robin canvas pixel -> playable Robin brick -> 1
 * Original black published pixel -> empty black space -> 0
 *
 * This preserves the "negative" arcade treatment requested for Studio.
 *
 * We process tags in SVG order and support fill inherited from <g>.
 */
function svgToRows(svg: string) {
  const grid =
    createEmptyGrid();

  const tagExpression =
    /<\/?g\b[^>]*>|<rect\b[^>]*\/?>/gi;

  const fillStack:
    Array<string | null> = [
      null,
    ];

  let match:
    RegExpExecArray | null;

  while (
    (
      match =
        tagExpression.exec(svg)
    ) !== null
  ) {
    const tag =
      match[0];

    if (
      /^<\/g/i.test(tag)
    ) {
      if (
        fillStack.length > 1
      ) {
        fillStack.pop();
      }

      continue;
    }

    if (
      /^<g\b/i.test(tag)
    ) {
      const ownFill =
        normalizeColor(
          readAttribute(
            tag,
            "fill"
          )
        );

      const inheritedFill =
        fillStack[
          fillStack.length - 1
        ] ?? null;

      fillStack.push(
        ownFill ??
          inheritedFill
      );

      continue;
    }

    if (
      /^<rect\b/i.test(tag)
    ) {
      const rectangle =
        parseRectangle(tag);

      if (!rectangle) {
        continue;
      }

      const ownFill =
        normalizeColor(
          readAttribute(
            tag,
            "fill"
          )
        );

      const inheritedFill =
        fillStack[
          fillStack.length - 1
        ] ?? null;

      const finalFill =
        ownFill ??
        inheritedFill;

      if (
        finalFill === "robin"
      ) {
        paintRectangle(
          grid,
          rectangle,
          1
        );
      } else if (
        finalFill === "black"
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

function getTrait(
  metadata:
    HoodieArtMetadata,
  traitType:
    string
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

function numberTrait(
  metadata:
    HoodieArtMetadata,
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
    value.trim() !== ""
  ) {
    const parsed =
      Number(value);

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

    if (
      !isValidTokenId(
        tokenId
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid Hoodie Art token ID.",
        },
        {
          status:
            400,
        }
      );
    }

    if (
      !siteConfig.hoodieArtAddress
    ) {
      return NextResponse.json(
        {
          error:
            "Hoodie Art contract is not configured for the active network.",
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

    const [
      owner,
      tokenUri,
    ] =
      await Promise.all([
        client.readContract({
          address:
            siteConfig.hoodieArtAddress as `0x${string}`,
          abi:
            hoodieArtAbi,
          functionName:
            "ownerOf",
          args: [
            numericTokenId,
          ],
        }),

        client.readContract({
          address:
            siteConfig.hoodieArtAddress as `0x${string}`,
          abi:
            hoodieArtAbi,
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
        "Hoodie Art tokenURI returned an invalid value."
      );
    }

    if (
      !tokenUri.startsWith(
        "data:"
      )
    ) {
      throw new Error(
        "Hoodie Art tokenURI is not an on-chain data URI."
      );
    }

    const metadataString =
      decodeDataUri(
        tokenUri
      );

    let metadata:
      HoodieArtMetadata;

    try {
      metadata =
        JSON.parse(
          metadataString
        ) as HoodieArtMetadata;
    } catch {
      throw new Error(
        "Hoodie Art metadata JSON could not be decoded."
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
        "Hoodie Art metadata does not contain an SVG image."
      );
    }

    if (
      !imageData.startsWith(
        "data:image/svg+xml"
      )
    ) {
      throw new Error(
        "Hoodie Art image is not an SVG data URI."
      );
    }

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

    const canvasId =
      numberTrait(
        metadata,
        "Canvas ID"
      );

    const openingBottle =
      numberTrait(
        metadata,
        "Opening Bottle"
      );

    const version =
      numberTrait(
        metadata,
        "Version"
      );

    const permanentPixels =
      numberTrait(
        metadata,
        "Permanent Pixels"
      );

    const totalInkSpent =
      numberTrait(
        metadata,
        "Total INK Spent"
      );

    const rendererVersion =
      numberTrait(
        metadata,
        "Renderer Version"
      );

    const state =
      getTrait(
        metadata,
        "State"
      );

    const artist =
      getTrait(
        metadata,
        "Artist"
      );

    const artistAddress =
      getTrait(
        metadata,
        "Artist Address"
      );

    const approvedBy =
      getTrait(
        metadata,
        "Approved By"
      );

    return NextResponse.json(
      {
        schemaVersion:
          "1.0",

        type:
          "studio",

        tokenId,

        name:
          metadata.name ??
          `Hoodie Art #${tokenId}`,

        network:
          siteConfig.network,

        chainId:
          siteConfig.chainId,

        contract:
          siteConfig.hoodieArtAddress,

        owner,

        canvas: {
          canvasId,
          openingBottle,
          state,
          version,
          permanentPixels,
          totalInkSpent,
          rendererVersion,
        },

        artist: {
          name:
            artist,
          address:
            artistAddress,
          approvedBy,
        },

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

          gameScale:
            3,

          anchor: {
            x: 10,
            y: 10,
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
            "public, s-maxage=10, stale-while-revalidate=20",
        },
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Hoodie Art arcade route failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Hoodie Art from chain.",
      },
      {
        status:
          500,
      }
    );
  }
}
