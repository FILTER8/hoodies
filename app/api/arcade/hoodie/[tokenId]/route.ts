import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://api.onchainhoodies.xyz";

const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;

type RouteContext = {
  params: Promise<{
    tokenId: string;
  }>;
};

type TokenAttribute = {
  trait_type?: string;
  traitType?: string;
  type?: string;
  name?: string;
  value?: unknown;
};

type TokenResponse = {
  tokenId?: string | number;
  name?: string;

  attributes?: TokenAttribute[];
  traits?: TokenAttribute[];

  metadata?: {
    attributes?: TokenAttribute[];
  };

  [key: string]: unknown;
};

type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ParsedGroup = {
  fill: string | null;
  body: string;
};

function isValidTokenId(value: string) {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const tokenId = Number(value);

  return (
    Number.isInteger(tokenId) &&
    tokenId >= 0 &&
    tokenId < 6000
  );
}

function normalizeColor(value: string | null) {
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

function readAttribute(
  source: string,
  attribute: string
): string | null {
  const expression = new RegExp(
    `${attribute}\\s*=\\s*["']([^"']+)["']`,
    "i"
  );

  const match = source.match(expression);

  return match?.[1] ?? null;
}

function readNumberAttribute(
  source: string,
  attribute: string
): number | null {
  const raw = readAttribute(source, attribute);

  if (raw === null) {
    return null;
  }

  const value = Number(raw);

  return Number.isFinite(value)
    ? value
    : null;
}

function parseRectangle(tag: string): Rectangle | null {
  const x =
    readNumberAttribute(tag, "x") ?? 0;

  const y =
    readNumberAttribute(tag, "y") ?? 0;

  const width =
    readNumberAttribute(tag, "width");

  const height =
    readNumberAttribute(tag, "height");

  if (
    width === null ||
    height === null
  ) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
  };
}

function parseGroups(svg: string): ParsedGroup[] {
  const groups: ParsedGroup[] = [];

  const groupExpression =
    /<g\b([^>]*)>([\s\S]*?)<\/g>/gi;

  let match: RegExpExecArray | null;

  while (
    (match = groupExpression.exec(svg)) !== null
  ) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";

    groups.push({
      fill: normalizeColor(
        readAttribute(attributes, "fill")
      ),
      body,
    });
  }

  return groups;
}

function createEmptyGrid() {
  return Array.from(
    { length: GRID_HEIGHT },
    () =>
      Array<number>(GRID_WIDTH).fill(0)
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

function svgToRows(svg: string) {
  const grid = createEmptyGrid();

  const groups = parseGroups(svg);

  for (const group of groups) {
    const groupFill =
      normalizeColor(group.fill);

    const rectTags =
      group.body.match(
        /<rect\b[^>]*\/?>/gi
      ) ?? [];

    for (const rectTag of rectTags) {
      const rectangle =
        parseRectangle(rectTag);

      if (!rectangle) {
        continue;
      }

      const rectFill =
        normalizeColor(
          readAttribute(
            rectTag,
            "fill"
          )
        );

      const finalFill =
        rectFill ?? groupFill;

      /*
       * Game conversion:
       *
       * Original black NFT pixel
       *   -> Robin game brick
       *   -> 1
       *
       * Original Robin NFT pixel
       *   -> empty black game space
       *   -> 0
       *
       * Processing happens in SVG order,
       * so later rectangles overwrite
       * earlier rectangles exactly like
       * the original SVG renderer.
       */

      if (finalFill === "black") {
        paintRectangle(
          grid,
          rectangle,
          1
        );
      } else if (
        finalFill === "robin"
      ) {
        paintRectangle(
          grid,
          rectangle,
          0
        );
      }
    }
  }

  return grid.map((row) =>
    row.join("")
  );
}

function countPixels(
  rows: string[]
) {
  let count = 0;

  for (const row of rows) {
    for (const pixel of row) {
      if (pixel === "1") {
        count += 1;
      }
    }
  }

  return count;
}

function calculateBounds(
  rows: string[]
) {
  let minX = GRID_WIDTH;
  let minY = GRID_HEIGHT;

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
        rows[y]?.[x] !== "1"
      ) {
        continue;
      }

      minX = Math.min(
        minX,
        x
      );

      minY = Math.min(
        minY,
        y
      );

      maxX = Math.max(
        maxX,
        x
      );

      maxY = Math.max(
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
      maxX - minX + 1,

    height:
      maxY - minY + 1,
  };
}

function normalizeTraitName(
  value: unknown
) {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(
      /[\s_-]+/g,
      ""
    );
}

function extractArchetype(
  token: TokenResponse
): string | null {
  const candidateLists:
    TokenAttribute[][] = [];

  if (
    Array.isArray(
      token.attributes
    )
  ) {
    candidateLists.push(
      token.attributes
    );
  }

  if (
    Array.isArray(
      token.traits
    )
  ) {
    candidateLists.push(
      token.traits
    );
  }

  if (
    token.metadata &&
    typeof token.metadata ===
      "object" &&
    Array.isArray(
      token.metadata.attributes
    )
  ) {
    candidateLists.push(
      token.metadata.attributes
    );
  }

  for (
    const attributes of
    candidateLists
  ) {
    for (
      const attribute of
      attributes
    ) {
      const traitName =
        attribute.trait_type ??
        attribute.traitType ??
        attribute.type ??
        attribute.name ??
        "";

      const normalized =
        normalizeTraitName(
          traitName
        );

      if (
        normalized !==
          "hoddie" &&
        normalized !==
          "hoodie" &&
        normalized !==
          "archetype"
      ) {
        continue;
      }

      if (
        typeof attribute.value ===
        "string"
      ) {
        return attribute.value;
      }
    }
  }

  function search(
    value: unknown
  ): string | null {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return null;
    }

    if (
      Array.isArray(value)
    ) {
      for (
        const item of value
      ) {
        const result =
          search(item);

        if (result) {
          return result;
        }
      }

      return null;
    }

    const record =
      value as Record<
        string,
        unknown
      >;

    for (
      const [key, item] of
      Object.entries(record)
    ) {
      const normalizedKey =
        normalizeTraitName(key);

      if (
        normalizedKey ===
          "hoddie" ||
        normalizedKey ===
          "hoodie" ||
        normalizedKey ===
          "archetype"
      ) {
        if (
          typeof item ===
          "string"
        ) {
          return item;
        }
      }

      const nested =
        search(item);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  return search(token);
}

function normalizeArchetype(
  archetype: string | null
) {
  if (!archetype) {
    return null;
  }

  const normalized =
    archetype
      .trim()
      .toLowerCase();

  if (
    normalized === "builder"
  ) {
    return "Builder";
  }

  if (
    normalized === "collector"
  ) {
    return "Collector";
  }

  if (
    normalized === "flipper"
  ) {
    return "Flipper";
  }

  if (
    normalized === "hodler"
  ) {
    return "HODLer";
  }

  return archetype;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { tokenId } =
      await context.params;

    if (
      !isValidTokenId(tokenId)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid Hoodie token ID. Expected 0 to 5999.",
        },
        {
          status: 400,
        }
      );
    }

    const imageUrl =
      `${API_BASE}/images/${tokenId}.svg`;

    const tokenUrl =
      `${API_BASE}/v1/token/${tokenId}`;

    const [
      svgResponse,
      tokenResponse,
    ] = await Promise.all([
      fetch(imageUrl, {
        next: {
          revalidate: 3600,
        },
      }),

      fetch(tokenUrl, {
        next: {
          revalidate: 3600,
        },
      }),
    ]);

    if (!svgResponse.ok) {
      return NextResponse.json(
        {
          error:
            "Unable to load Hoodie SVG.",
          upstreamStatus:
            svgResponse.status,
        },
        {
          status: 502,
        }
      );
    }

    if (!tokenResponse.ok) {
      return NextResponse.json(
        {
          error:
            "Unable to load Hoodie metadata.",
          upstreamStatus:
            tokenResponse.status,
        },
        {
          status: 502,
        }
      );
    }

    const svg =
      await svgResponse.text();

    const token =
      (await tokenResponse.json()) as TokenResponse;

    const pixels =
      svgToRows(svg);

    const visiblePixelCount =
      countPixels(pixels);

    const bounds =
      calculateBounds(pixels);

    const rawArchetype =
      extractArchetype(token);

    const archetype =
      normalizeArchetype(
        rawArchetype
      );

    return NextResponse.json(
      {
        schemaVersion:
          "1.0",

        tokenId,

        name:
          typeof token.name ===
          "string"
            ? token.name
            : `OnChainHoodies #${tokenId}`,

        archetype,

        sprite: {
          format:
            "1bit-row-map",

          width:
            GRID_WIDTH,

          height:
            GRID_HEIGHT,

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
        status: 200,

        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    console.error(
      "Hood Break sprite route failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to build Hoodie game sprite.",
      },
      {
        status: 500,
      }
    );
  }
}