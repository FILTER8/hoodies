"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Contract,
  JsonRpcProvider,
  getBytes,
  hexlify,
} from "ethers";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { siteConfig } from "../../../lib/config";

const CANVAS_WIDTH = 121;
const CANVAS_HEIGHT = 120;
const PIXEL_CANVAS_SIZE = 20;
const EXPORT_SCALE = 10;
const GIF_EXPORT_SCALE = 10;
const DEFAULT_FRAME_DELAY = 140;
const DEFAULT_MOVE_PIXELS = 1;
const BACKGROUND = "#ccff00";

/*
 * PixelData layer order:
 * 0 = background
 * 1 = included
 * 2 = Hoodie / dress
 * 3 = included
 * 4 = included
 * 5 = included
 * 6 = included
 */
const HEAD_LAYER_IDS = [1, 3, 4, 5, 6] as const;

const TEMPLATE = {
  body: "/images/gym-body.png",

  /*
   * The on-chain rectangles are rendered at native scale.
   * One PixelData coordinate equals one output-canvas pixel.
   */
  head: {
    x: 50,
    y: 7,
  },
} as const;

const PIXEL_DATA_ABI = [
  "function getComposite(uint256 compositeIndex) view returns (uint256[])",
  "function canvasWidth() view returns (uint16)",
  "function canvasHeight() view returns (uint16)",
  "function palettePointer() view returns (address)",
  "function traitPointers(uint256 layerId, uint256 pointerIndex) view returns (address)",
  "function traits(uint256 layerId, uint256 traitIndex) view returns (uint256 pointerIndex, uint256 offset, uint256 length)",
] as const;

type PaletteColor = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  paletteIndex: number;
};

type RenderedHoodie = {
  tokenId: number;
  sourceWidth: number;
  sourceHeight: number;
  palette: PaletteColor[];
  rectangles: PixelRect[];
};

type TraitRecord = readonly [
  pointerIndex: bigint,
  offset: bigint,
  length: bigint,
];

function parseTokenId(value: string): number {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    throw new Error("Enter a valid Hoodie ID.");
  }

  const tokenId = Number(trimmed);

  if (!Number.isSafeInteger(tokenId) || tokenId < 0) {
    throw new Error("Enter a valid Hoodie ID.");
  }

  return tokenId;
}

function requireRpcConfiguration(): void {
  if (!siteConfig.rpcUrl) {
    throw new Error("The RPC URL is not configured.");
  }

  if (!siteConfig.pixelDataAddress) {
    throw new Error("The PixelData contract address is not configured.");
  }
}

function bigintToSafeNumber(value: bigint, label: string): number {
  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue) || numericValue < 0) {
    throw new Error(`${label} is outside the supported range.`);
  }

  return numericValue;
}

function readUint256(bytes: Uint8Array, offset: number): bigint {
  if (offset < 0 || offset + 32 > bytes.length) {
    throw new Error("Unable to read the stored uint256 value.");
  }

  return BigInt(hexlify(bytes.slice(offset, offset + 32)));
}

/*
 * SSTORE2 stores one STOP byte at code position zero. Solidity's SSTORE2.read()
 * hides that byte, so frontend offsets must be shifted by one when reading
 * contract bytecode directly with eth_getCode.
 */
async function readSstore2Bytes(
  provider: JsonRpcProvider,
  pointer: string,
  start = 0,
  end?: number,
): Promise<Uint8Array> {
  const code = await provider.getCode(pointer);

  if (code === "0x") {
    throw new Error(`SSTORE2 pointer ${pointer} has no bytecode.`);
  }

  const storedCode = getBytes(code);
  const dataStart = start + 1;
  const dataEnd = end === undefined ? storedCode.length : end + 1;

  if (
    dataStart < 1 ||
    dataEnd < dataStart ||
    dataEnd > storedCode.length
  ) {
    throw new Error("The requested SSTORE2 byte range is invalid.");
  }

  return storedCode.slice(dataStart, dataEnd);
}

function decodePalette(storedPalette: Uint8Array): PaletteColor[] {
  if (storedPalette.length < 32) {
    throw new Error("The on-chain palette is incomplete.");
  }

  const paletteLength = bigintToSafeNumber(
    readUint256(storedPalette, 0),
    "Palette length",
  );

  if (
    paletteLength === 0 ||
    paletteLength % 4 !== 0 ||
    32 + paletteLength > storedPalette.length
  ) {
    throw new Error("The on-chain palette has an invalid length.");
  }

  const colors: PaletteColor[] = [];

  for (let offset = 32; offset < 32 + paletteLength; offset += 4) {
    colors.push({
      red: storedPalette[offset],
      green: storedPalette[offset + 1],
      blue: storedPalette[offset + 2],
      alpha: storedPalette[offset + 3],
    });
  }

  return colors;
}

function decodeTraitRectangles(data: Uint8Array): PixelRect[] {
  if (data.length % 5 !== 0) {
    throw new Error("The on-chain trait data has an invalid length.");
  }

  const rectangles: PixelRect[] = [];

  for (let offset = 0; offset < data.length; offset += 5) {
    const paletteIndex = data[offset + 4];

    // PixelDataV2 reserves palette index 255 as transparent / skipped.
    if (paletteIndex === 255) {
      continue;
    }

    rectangles.push({
      x: data[offset],
      y: data[offset + 1],
      width: data[offset + 2],
      height: data[offset + 3],
      paletteIndex,
    });
  }

  return rectangles;
}

async function fetchRenderedHoodie(
  tokenId: number,
): Promise<RenderedHoodie> {
  requireRpcConfiguration();

  const provider = new JsonRpcProvider(
    siteConfig.rpcUrl,
    siteConfig.chainId,
    {
      staticNetwork: true,
    },
  );

  const pixelData = new Contract(
    siteConfig.pixelDataAddress,
    PIXEL_DATA_ABI,
    provider,
  );

  const [
    compositeResult,
    canvasWidthResult,
    canvasHeightResult,
    palettePointer,
  ] = await Promise.all([
    pixelData.getComposite(tokenId) as Promise<bigint[]>,
    pixelData.canvasWidth() as Promise<bigint>,
    pixelData.canvasHeight() as Promise<bigint>,
    pixelData.palettePointer() as Promise<string>,
  ]);

  const sourceWidth = bigintToSafeNumber(
    canvasWidthResult,
    "Canvas width",
  );
  const sourceHeight = bigintToSafeNumber(
    canvasHeightResult,
    "Canvas height",
  );

  if (
    sourceWidth !== PIXEL_CANVAS_SIZE ||
    sourceHeight !== PIXEL_CANVAS_SIZE
  ) {
    throw new Error(
      `Expected a ${PIXEL_CANVAS_SIZE} × ${PIXEL_CANVAS_SIZE} PixelData canvas, received ${sourceWidth} × ${sourceHeight}.`,
    );
  }

  const storedPalette = await readSstore2Bytes(
    provider,
    palettePointer,
  );
  const palette = decodePalette(storedPalette);

  const layerRectangles = await Promise.all(
    HEAD_LAYER_IDS.map(async (layerId): Promise<PixelRect[]> => {
      const traitIndex = compositeResult[layerId];

      if (traitIndex === undefined) {
        throw new Error(`Composite layer ${layerId} is missing.`);
      }

      const traitRecord = (await pixelData.traits(
        layerId,
        traitIndex,
      )) as TraitRecord;

      const pointerIndex = bigintToSafeNumber(
        traitRecord[0],
        `Layer ${layerId} pointer index`,
      );
      const offset = bigintToSafeNumber(
        traitRecord[1],
        `Layer ${layerId} trait offset`,
      );
      const length = bigintToSafeNumber(
        traitRecord[2],
        `Layer ${layerId} trait length`,
      );

      // Empty optional traits are intentionally skipped by tokenImageSvg().
      if (length === 0) {
        return [];
      }

      const traitPointer = (await pixelData.traitPointers(
        layerId,
        pointerIndex,
      )) as string;

      const traitBytes = await readSstore2Bytes(
        provider,
        traitPointer,
        offset,
        offset + length,
      );

      return decodeTraitRectangles(traitBytes);
    }),
  );

  return {
    tokenId,
    sourceWidth,
    sourceHeight,
    palette,
    rectangles: layerRectangles.flat(),
  };
}

let bodyCanvasPromise: Promise<HTMLCanvasElement> | null = null;

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = source;
  });
}

function createTransparentBodyCanvas(
  image: HTMLImageElement,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const imageData = context.getImageData(
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
  );

  const visited = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const queueX = new Int16Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const queueY = new Int16Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  let queueStart = 0;
  let queueEnd = 0;

  function isBackgroundPixel(x: number, y: number): boolean {
    const index = (y * CANVAS_WIDTH + x) * 4;
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];

    return (
      green > 180 &&
      green > red * 1.15 &&
      green > blue * 1.15
    );
  }

  function enqueue(x: number, y: number): void {
    if (
      x < 0 ||
      y < 0 ||
      x >= CANVAS_WIDTH ||
      y >= CANVAS_HEIGHT
    ) {
      return;
    }

    const pixelIndex = y * CANVAS_WIDTH + x;

    if (visited[pixelIndex] || !isBackgroundPixel(x, y)) {
      return;
    }

    visited[pixelIndex] = 1;
    queueX[queueEnd] = x;
    queueY[queueEnd] = y;
    queueEnd += 1;
  }

  for (let x = 0; x < CANVAS_WIDTH; x += 1) {
    enqueue(x, 0);
    enqueue(x, CANVAS_HEIGHT - 1);
  }

  for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
    enqueue(0, y);
    enqueue(CANVAS_WIDTH - 1, y);
  }

  while (queueStart < queueEnd) {
    const x = queueX[queueStart];
    const y = queueY[queueStart];
    queueStart += 1;

    const dataIndex = (y * CANVAS_WIDTH + x) * 4;
    imageData.data[dataIndex + 3] = 0;

    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.putImageData(imageData, 0, 0);

  return canvas;
}

function getBodyCanvas(): Promise<HTMLCanvasElement> {
  if (!bodyCanvasPromise) {
    bodyCanvasPromise = loadImage(TEMPLATE.body).then((image) =>
      createTransparentBodyCanvas(image),
    );
  }

  return bodyCanvasPromise;
}

function drawPixelData(
  context: CanvasRenderingContext2D,
  hoodie: RenderedHoodie,
  headY: number = TEMPLATE.head.y,
): void {
  context.save();
  context.imageSmoothingEnabled = false;

  for (const rectangle of hoodie.rectangles) {
    const color = hoodie.palette[rectangle.paletteIndex];

    if (!color || color.alpha === 0) {
      continue;
    }

    context.fillStyle =
      `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha / 255})`;

    context.fillRect(
      TEMPLATE.head.x + rectangle.x,
      headY + rectangle.y,
      rectangle.width,
      rectangle.height,
    );
  }

  context.restore();
}

async function drawTemplate(
  context: CanvasRenderingContext2D,
  hoodie: RenderedHoodie,
  headY: number = TEMPLATE.head.y,
): Promise<void> {
  const bodyCanvas = await getBodyCanvas();

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  /*
   * Draw the gym-body template first. Its edge-connected lime background has
   * already been removed, while the black outlines and enclosed body fills
   * remain intact.
   */
  context.drawImage(
    bodyCanvas,
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
  );

  /*
   * Draw the raw PixelData rectangles after the body so the lower hoodie
   * pixels remain visible instead of being covered by the chest fill.
   */
  drawPixelData(context, hoodie, headY);
}

async function composeImage(
  canvas: HTMLCanvasElement,
  hoodie: RenderedHoodie,
  headY: number = TEMPLATE.head.y,
): Promise<void> {
  /*
   * Render the complete frame offscreen first, then copy it to the visible
   * canvas in one synchronous draw. This prevents the preview from briefly
   * showing a cleared canvas while the template image is being prepared.
   */
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = CANVAS_WIDTH;
  frameCanvas.height = CANVAS_HEIGHT;

  const frameContext = frameCanvas.getContext("2d");

  if (!frameContext) {
    throw new Error("Canvas is unavailable.");
  }

  await drawTemplate(frameContext, hoodie, headY);

  if (canvas.width !== CANVAS_WIDTH) {
    canvas.width = CANVAS_WIDTH;
  }

  if (canvas.height !== CANVAS_HEIGHT) {
    canvas.height = CANVAS_HEIGHT;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.drawImage(frameCanvas, 0, 0);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Unable to create PNG."));
      }
    }, "image/png");
  });
}

async function createScaledFrame(
  hoodie: RenderedHoodie,
  headY: number,
  scale: number,
): Promise<ImageData> {
  const sourceCanvas = document.createElement("canvas");
  await composeImage(sourceCanvas, hoodie, headY);

  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = CANVAS_WIDTH * scale;
  frameCanvas.height = CANVAS_HEIGHT * scale;

  const frameContext = frameCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!frameContext) {
    throw new Error("Canvas is unavailable.");
  }

  frameContext.imageSmoothingEnabled = false;
  frameContext.drawImage(
    sourceCanvas,
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    0,
    0,
    frameCanvas.width,
    frameCanvas.height,
  );

  return frameContext.getImageData(
    0,
    0,
    frameCanvas.width,
    frameCanvas.height,
  );
}

async function downloadGIF(
  hoodie: RenderedHoodie,
  frameDelay: number,
  movePixels: number,
): Promise<void> {
  const headYFrames = [
    TEMPLATE.head.y - movePixels,
    TEMPLATE.head.y,
    TEMPLATE.head.y + movePixels,
    TEMPLATE.head.y,
  ];
  const gif = GIFEncoder();
  let palette: ReturnType<typeof quantize> | null = null;

  for (let frameIndex = 0; frameIndex < headYFrames.length; frameIndex += 1) {
    const headY = headYFrames[frameIndex];
    const frame = await createScaledFrame(
      hoodie,
      headY,
      GIF_EXPORT_SCALE,
    );

    if (!palette) {
      palette = quantize(frame.data, 256);
    }

    const indexedFrame = applyPalette(frame.data, palette);

    gif.writeFrame(indexedFrame, frame.width, frame.height, {
      palette: frameIndex === 0 ? palette : undefined,
      delay: frameDelay,
      repeat: 0,
    });
  }

  gif.finish();

  // Copy the encoder output into a regular ArrayBuffer. This avoids the
  // Uint8Array<ArrayBufferLike> / BlobPart mismatch in newer TypeScript DOM types.
  const gifBytes = gif.bytes();
  const gifBuffer = new ArrayBuffer(gifBytes.byteLength);
  new Uint8Array(gifBuffer).set(gifBytes);

  const blob = new Blob([gifBuffer], { type: "image/gif" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = `onchainhoodies-gym-${hoodie.tokenId}-animated.gif`;
  link.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

async function downloadPNG(hoodie: RenderedHoodie): Promise<void> {
  const sourceCanvas = document.createElement("canvas");
  await composeImage(sourceCanvas, hoodie);

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = CANVAS_WIDTH * EXPORT_SCALE;
  exportCanvas.height = CANVAS_HEIGHT * EXPORT_SCALE;

  const exportContext = exportCanvas.getContext("2d");

  if (!exportContext) {
    throw new Error("Canvas is unavailable.");
  }

  exportContext.imageSmoothingEnabled = false;
  exportContext.drawImage(
    sourceCanvas,
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    0,
    0,
    exportCanvas.width,
    exportCanvas.height,
  );

  const blob = await canvasToBlob(exportCanvas);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = `onchainhoodies-gym-${hoodie.tokenId}.png`;
  link.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

function getReadableError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("invalid composite") ||
      message.includes("invalid composite index") ||
      message.includes("execution reverted")
    ) {
      return "That Hoodie ID does not exist on the selected network.";
    }

    if (
      message.includes("could not coalesce") ||
      message.includes("failed to fetch") ||
      message.includes("network")
    ) {
      return "The on-chain data could not be reached. Check the RPC configuration.";
    }

    return error.message;
  }

  return "The Gym Hoodie could not be created.";
}

export default function GymBuilderPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [hoodieInput, setHoodieInput] = useState("0");
  const [renderedHoodie, setRenderedHoodie] =
    useState<RenderedHoodie | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportingGif, setExportingGif] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frameDelay, setFrameDelay] = useState(DEFAULT_FRAME_DELAY);
  const [movePixels, setMovePixels] = useState(DEFAULT_MOVE_PIXELS);
  const [previewFrame, setPreviewFrame] = useState(1);
  const [error, setError] = useState("");


  const animationFrames = useMemo(
    () => [
      TEMPLATE.head.y - movePixels,
      TEMPLATE.head.y,
      TEMPLATE.head.y + movePixels,
      TEMPLATE.head.y,
    ],
    [movePixels],
  );

  useEffect(() => {
    if (!renderedHoodie || !isPlaying || movePixels === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setPreviewFrame((currentFrame) =>
        (currentFrame + 1) % animationFrames.length
      );
    }, frameDelay);

    return () => window.clearInterval(timer);
  }, [
    animationFrames.length,
    frameDelay,
    isPlaying,
    movePixels,
    renderedHoodie,
  ]);

  useEffect(() => {
    if (!renderedHoodie) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const headY =
      isPlaying && movePixels > 0
        ? animationFrames[previewFrame]
        : TEMPLATE.head.y;

    void composeImage(canvas, renderedHoodie, headY).catch((previewError) => {
      console.error(previewError);
      setError(getReadableError(previewError));
      setIsPlaying(false);
    });
  }, [
    animationFrames,
    isPlaying,
    movePixels,
    previewFrame,
    renderedHoodie,
  ]);

  const buildHoodie = useCallback(async () => {
    if (loadingPreview) {
      return;
    }

    setLoadingPreview(true);
    setIsPlaying(false);
    setPreviewFrame(1);
    setRenderedHoodie(null);
    setError("");

    try {
      const tokenId = parseTokenId(hoodieInput);
      const hoodie = await fetchRenderedHoodie(tokenId);
      const canvas = canvasRef.current;

      if (!canvas) {
        throw new Error("Preview canvas is unavailable.");
      }

      await composeImage(canvas, hoodie);
      setRenderedHoodie(hoodie);
      setHoodieInput(String(tokenId));
    } catch (buildError) {
      console.error(buildError);
      setError(getReadableError(buildError));
    } finally {
      setLoadingPreview(false);
    }
  }, [hoodieInput, loadingPreview]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void buildHoodie();
  }

  async function handleDownload() {
    if (!renderedHoodie || downloading) {
      return;
    }

    setDownloading(true);
    setError("");

    try {
      await downloadPNG(renderedHoodie);
    } catch (downloadError) {
      console.error(downloadError);
      setError(getReadableError(downloadError));
    } finally {
      setDownloading(false);
    }
  }

  async function handleGifDownload() {
    if (!renderedHoodie || exportingGif) {
      return;
    }

    setExportingGif(true);
    setError("");

    try {
      await downloadGIF(renderedHoodie, frameDelay, movePixels);
    } catch (downloadError) {
      console.error(downloadError);
      setError(getReadableError(downloadError));
    } finally {
      setExportingGif(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-[#ccff00]">
      <SiteHeader />

      <section className="px-4 pb-24 pt-28 md:px-6 md:pt-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="border-b-2 border-[#ccff00] pb-8">
            <p className="text-[8px] uppercase tracking-[0.18em] opacity-60">
              Hood Tool / Gym Builder
            </p>

            <h1 className="mt-5 text-[clamp(2.8rem,8vw,6rem)] leading-[0.86] tracking-[-0.06em]">
              GYM BUILDER.
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed opacity-75 md:text-base">
              Turn any Hoodie into a gym bro using its raw on-chain PixelData.
            </p>
          </div>

          <section className="border-b-2 border-[#ccff00] py-8">
            <div className="flex items-center justify-between gap-4 text-left">
              <h2 className="text-[10px] uppercase tracking-[0.16em]">
                Hoodie ID
              </h2>

              <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                Layers 1 / 3 / 4 / 5 / 6
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <label className="text-left">
                <span className="sr-only">Hoodie ID</span>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={hoodieInput}
                  disabled={loadingPreview}
                  onChange={(event) => {
                    setHoodieInput(event.target.value);
                    setError("");
                  }}
                  placeholder="Enter Hoodie ID"
                  className="min-h-14 w-full border-2 border-[#ccff00] bg-black px-5 text-sm text-[#ccff00] outline-none placeholder:text-[#ccff00]/40 disabled:cursor-wait disabled:opacity-50"
                />
              </label>

              <button
                type="submit"
                disabled={loadingPreview || hoodieInput.trim() === ""}
                className="min-h-14 border-2 border-[#ccff00] bg-[#ccff00] px-8 text-[9px] uppercase tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {loadingPreview ? "Reading Chain..." : "Build Hoodie"}
              </button>
            </form>

            <p className="mt-4 text-left text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-55">
              Background layer 0 and Hoodie layer 2 are excluded.
            </p>
          </section>

          <section className="border-b-2 border-[#ccff00] py-8">
            <div className="flex items-center justify-between gap-4 text-left">
              <h2 className="text-[10px] uppercase tracking-[0.16em]">
                Preview
              </h2>

              <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                121 × 120 PX
              </p>
            </div>

            <div className="mt-5 flex min-h-[360px] items-center justify-center border-2 border-[#ccff00] bg-[#ccff00] p-6 md:min-h-[520px] md:p-10">
              <div className="relative w-full max-w-[484px]">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  className={`block h-auto w-full border-2 border-black bg-[#ccff00] ${
                    renderedHoodie ? "opacity-100" : "opacity-25"
                  }`}
                  style={{ imageRendering: "pixelated" }}
                />

                {!renderedHoodie ? (
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[9px] uppercase leading-relaxed tracking-[0.14em] text-black">
                    {loadingPreview
                      ? "Reading raw rectangles from PixelData..."
                      : "Enter a Hoodie ID to build the preview."}
                  </div>
                ) : null}
              </div>
            </div>

            {renderedHoodie ? (
              <p className="mt-4 text-[8px] uppercase tracking-[0.14em] opacity-60">
                Hoodie #{renderedHoodie.tokenId} / Native 1 × 1 PixelData
              </p>
            ) : null}
          </section>

          <section className="border-b-2 border-[#ccff00] py-8">
            <div className="flex items-center justify-between gap-4 text-left">
              <h2 className="text-[10px] uppercase tracking-[0.16em]">
                Animation
              </h2>

              <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                Yo-Yo Head Move
              </p>
            </div>

            <div className="mt-5 grid gap-5 text-left md:grid-cols-2">
              <div className="border-2 border-[#ccff00] p-4">
                <div className="flex items-center justify-between gap-4">
                  <label
                    htmlFor="animation-speed"
                    className="text-[9px] uppercase tracking-[0.14em]"
                  >
                    Speed
                  </label>

                  <span className="text-[8px] uppercase tracking-[0.12em] opacity-60">
                    {frameDelay} MS / Frame
                  </span>
                </div>

                <input
                  id="animation-speed"
                  type="range"
                  min="60"
                  max="400"
                  step="10"
                  value={frameDelay}
                  onChange={(event) =>
                    setFrameDelay(Number(event.target.value))
                  }
                  className="mt-5 w-full accent-[#ccff00]"
                />

                <div className="mt-2 flex justify-between text-[7px] uppercase tracking-[0.12em] opacity-50">
                  <span>Fast</span>
                  <span>Slow</span>
                </div>
              </div>

              <div className="border-2 border-[#ccff00] p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[9px] uppercase tracking-[0.14em]">
                    Movement
                  </p>

                  <span className="text-[8px] uppercase tracking-[0.12em] opacity-60">
                    {movePixels === 0 ? "Off" : `${movePixels} PX`}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((pixels) => (
                    <button
                      key={pixels}
                      type="button"
                      onClick={() => {
                        setMovePixels(pixels);
                        setPreviewFrame(1);

                        if (pixels === 0) {
                          setIsPlaying(false);
                        }
                      }}
                      className={`min-h-10 border-2 border-[#ccff00] text-[8px] uppercase tracking-[0.12em] transition-colors ${
                        movePixels === pixels
                          ? "bg-[#ccff00] text-black"
                          : "bg-black text-[#ccff00] hover:bg-[#ccff00] hover:text-black"
                      }`}
                    >
                      {pixels === 0 ? "Off" : `${pixels} PX`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={!renderedHoodie || movePixels === 0}
              onClick={() => {
                setPreviewFrame(1);
                setIsPlaying((playing) => !playing);
              }}
              className="mt-5 min-h-14 w-full border-2 border-[#ccff00] bg-black px-6 text-[9px] uppercase tracking-[0.16em] text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
            >
              {isPlaying ? "Pause Animation" : "Play Animation"}
            </button>
          </section>

          {error ? (
            <p className="mt-6 border-2 border-[#ccff00] px-4 py-4 text-[9px] uppercase leading-relaxed tracking-[0.12em]">
              {error}
            </p>
          ) : null}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!renderedHoodie || downloading || exportingGif}
              onClick={() => void handleDownload()}
              className="min-h-16 w-full border-2 border-[#ccff00] bg-[#ccff00] px-6 text-[10px] uppercase tracking-[0.18em] text-black transition-colors hover:bg-black hover:text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {downloading ? "Creating PNG..." : "Download PNG"}
            </button>

            <button
              type="button"
              disabled={!renderedHoodie || downloading || exportingGif}
              onClick={() => void handleGifDownload()}
              className="min-h-16 w-full border-2 border-[#ccff00] bg-black px-6 text-[10px] uppercase tracking-[0.18em] text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
            >
              {exportingGif ? "Creating GIF..." : "Download Animated GIF"}
            </button>
          </div>

          <p className="mt-4 text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-55">
            GIF uses the selected speed and movement. Off exports a still four-frame loop.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}