"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 675;
const EXPORT_SCALE = 2;
const BACKGROUND = "#ccff00";
const FOREGROUND = "#000000";

const PIXEL_FONT_FAMILY = "DepartureMono";
const PIXEL_FONT_URL = "/fonts/DepartureMono-Regular.woff";

const AVATAR = {
  src: "/avatar.png",
  x: 78,
  defaultBottom: 585,
  minBottom: 520,
  maxBottom: 620,
  targetWidth: 470,
  maxHeight: 505,
} as const;

// QUICK TUNING:
// - border controls speech-bubble outline thickness
// - textThickness controls DepartureMono visual weight
const BUBBLE = {
  x: 535,

  // Dynamic vertical position:
  // 1 line uses the original higher position.
  // 5+ lines use the lowered position with enough top clearance.
  bottomOneLine: 348,
  bottomFiveLines: 470,

  minWidth: 330,
  maxWidth: 585,
  minHeight: 116,
  paddingX: 34,
  paddingTop: 26,
  paddingBottom: 28,
  border: 14,
  corner: 22,
  step: 4,
  tailX: 46,
  tailWidth: 76,
  tailHeight: 52,
  fontSize: 64,
  lineHeight: 76,
  textThickness: 2,
} as const;

const FOOTER = {
  y: 650,
  fontSize: 23,
  letterSpacing: 1,
  textThickness: 2,
} as const;

const FOOTER_OPTIONS = [
  "ONCHAINHOODIES ♥ ROBINHOOD",
  "ONCHAINHOODIES.XYZ",
  "ON-CHAIN ON ROBINHOOD",
] as const;

type FooterOption = (typeof FOOTER_OPTIONS)[number];

type BubbleLayout = {
  lines: string[];
  width: number;
  height: number;
  top: number;
  bottom: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${source}.`));
    image.src = source;
  });
}

let avatarPromise: Promise<HTMLImageElement> | null = null;

function getAvatar(): Promise<HTMLImageElement> {
  if (!avatarPromise) {
    avatarPromise = loadImage(AVATAR.src);
  }

  return avatarPromise;
}

let pixelFontPromise: Promise<void> | null = null;

async function ensurePixelFont(): Promise<void> {
  if (typeof document === "undefined") {
    return;
  }

  if (!pixelFontPromise) {
    pixelFontPromise = (async () => {
      if (document.fonts.check(`16px "${PIXEL_FONT_FAMILY}"`)) {
        await document.fonts.load(`16px "${PIXEL_FONT_FAMILY}"`);
        return;
      }

      const fontFace = new FontFace(
        PIXEL_FONT_FAMILY,
        `url(${PIXEL_FONT_URL}) format("woff")`,
        {
          style: "normal",
          weight: "400",
          display: "block",
        },
      );

      const loadedFont = await fontFace.load();
      document.fonts.add(loadedFont);
      await document.fonts.load(`16px "${PIXEL_FONT_FAMILY}"`);
    })();
  }

  await pixelFontPromise;
}

function getCanvasFont(fontSize: number): string {
  return `400 ${fontSize}px "${PIXEL_FONT_FAMILY}", monospace`;
}

function measureTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number,
): number {
  if (!text) {
    return 0;
  }

  const chars = Array.from(text);
  let width = 0;

  chars.forEach((char, index) => {
    width += context.measureText(char).width;
    if (index < chars.length - 1) {
      width += letterSpacing;
    }
  });

  return width;
}

function drawWeightedGlyph(
  context: CanvasRenderingContext2D,
  glyph: string,
  x: number,
  y: number,
  thickness: number,
): void {
  const weight = Math.max(1, Math.round(thickness));

  // DepartureMono only ships as Regular in /public/fonts. Instead of asking
  // the browser to synthesize a fake bold face, stamp the same glyph over a
  // tiny integer-pixel square. This preserves the original glyph design while
  // making its strokes visibly heavier.
  for (let offsetY = 0; offsetY < weight; offsetY += 1) {
    for (let offsetX = 0; offsetX < weight; offsetX += 1) {
      context.fillText(glyph, Math.round(x) + offsetX, Math.round(y) + offsetY);
    }
  }
}

function drawTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
  thickness = 1,
): void {
  let cursorX = x;

  Array.from(text).forEach((char) => {
    drawWeightedGlyph(context, char, cursorX, y, thickness);
    cursorX += context.measureText(char).width + letterSpacing;
  });
}

function breakLongWord(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const char of Array.from(word)) {
    const candidate = current + char;

    if (current && context.measureText(candidate).width > maxWidth) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function wrapParagraph(
  context: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number,
): string[] {
  if (paragraph.trim() === "") {
    return [""];
  }

  const words = paragraph.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const pieces =
      context.measureText(word).width <= maxWidth
        ? [word]
        : breakLongWord(context, word, maxWidth);

    for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;

      if (!current || context.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = piece;
      }
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

function getBubbleBottom(lineCount: number): number {
  const clampedLines = clamp(lineCount, 1, 5);

  const progress = (clampedLines - 1) / 4;

  return Math.round(
    BUBBLE.bottomOneLine +
      (BUBBLE.bottomFiveLines - BUBBLE.bottomOneLine) * progress,
  );
}

function getBubbleLayout(
  context: CanvasRenderingContext2D,
  text: string,
): BubbleLayout {
  context.font = getCanvasFont(BUBBLE.fontSize);
  context.textBaseline = "alphabetic";

  const maxTextWidth = BUBBLE.maxWidth - BUBBLE.paddingX * 2;
  const explicitParagraphs = text.replace(/\r/g, "").split("\n");
  const lines = explicitParagraphs.flatMap((paragraph) =>
    wrapParagraph(context, paragraph, maxTextWidth),
  );

  const safeLines = lines.length ? lines : [""];
  const measuredTextWidth = safeLines.reduce(
    (widest, line) => Math.max(widest, context.measureText(line).width),
    0,
  );

  const width = clamp(
    roundUp(measuredTextWidth + BUBBLE.paddingX * 2, BUBBLE.step),
    BUBBLE.minWidth,
    BUBBLE.maxWidth,
  );

  const contentHeight = safeLines.length * BUBBLE.lineHeight;
  const height = Math.max(
    BUBBLE.minHeight,
    roundUp(
      contentHeight + BUBBLE.paddingTop + BUBBLE.paddingBottom,
      BUBBLE.step,
    ),
  );

  const bottom = getBubbleBottom(safeLines.length);

  return {
    lines: safeLines,
    width,
    height,
    top: bottom - height,
    bottom,
  };
}

function drawPixelBubble(
  context: CanvasRenderingContext2D,
  layout: BubbleLayout,
): void {
  const { x, border } = BUBBLE;
  const { width, height, top, bottom } = layout;
  const right = x + width;
  const p = border;

  context.save();
  context.imageSmoothingEnabled = false;

  // ------------------------------------------------------------
  // PIXEL-PERFECT BUBBLE BODY
  // ------------------------------------------------------------
  // Every corner and border segment now uses the exact same unit
  // as the outline thickness. With border = 14, every step is 14px.
  //
  //      +--------------------+
  //    +                        +
  //   |                          |
  //    +                        +
  //      +--------------------+
  //
  // The tail below is intentionally left exactly as you tuned it.

  context.fillStyle = BACKGROUND;

  // Main green interior.
  context.fillRect(
    x + p,
    top + p,
    width - p * 2,
    height - p * 2,
  );

  // Fill the areas behind the straight top/bottom runs.
  context.fillRect(
    x + p * 2,
    top,
    width - p * 4,
    height,
  );

  context.fillStyle = FOREGROUND;

  // Top horizontal run.
  context.fillRect(
    x + p * 2,
    top,
    width - p * 4,
    p,
  );

  // Top-left single pixel stair.
  context.fillRect(
    x + p,
    top + p,
    p,
    p,
  );

  // Top-right single pixel stair.
  context.fillRect(
    right - p * 2,
    top + p,
    p,
    p,
  );

  // Left vertical run.
  context.fillRect(
    x,
    top + p * 2,
    p,
    height - p * 4,
  );

  // Right vertical run.
  context.fillRect(
    right - p,
    top + p * 2,
    p,
    height - p * 4,
  );

  // Bottom-left single pixel stair.
  context.fillRect(
    x + p,
    bottom - p * 2,
    p,
    p,
  );

  // Bottom-right single pixel stair.
  context.fillRect(
    right - p * 2,
    bottom - p * 2,
    p,
    p,
  );

  // Bottom horizontal run.
  context.fillRect(
    x + p * 2,
    bottom - p,
    width - p * 4,
    p,
  );

  // ------------------------------------------------------------
  // SIMPLE PIXEL SPEECH TAIL
  // ------------------------------------------------------------
  // DO NOT CHANGE: this is your manually tuned final tail.
  const tailX = x + BUBBLE.tailX;

  // Open only the part of the bottom border occupied by the tail.
  context.fillStyle = BACKGROUND;
  context.fillRect(tailX, bottom - border, p * 5, border);

  context.fillStyle = FOREGROUND;

  // Straight vertical stroke down from the bubble.
  context.fillRect(tailX, bottom - border, p, p * 4);

  // Three staircase pixels back up to the bottom border.
  context.fillRect(tailX + p, bottom + p * 2, p, p);
  context.fillRect(tailX + p * 2, bottom + p * 1, p, p);
  context.fillRect(tailX + p * 3, bottom + p * 0, p, p);

  // Restore the bottom border on both sides of the tail.
  context.fillRect(
    x + p * 2,
    bottom - border,
    tailX - (x + p * 2),
    border,
  );

  context.fillRect(
    tailX + p * 4,
    bottom - border,
    right - p * 2 - (tailX + p * 4),
    border,
  );

  context.restore();
}

function drawBubbleText(
  context: CanvasRenderingContext2D,
  layout: BubbleLayout,
): void {
  context.save();
  context.fillStyle = FOREGROUND;
  context.font = getCanvasFont(BUBBLE.fontSize);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  const contentHeight = layout.lines.length * BUBBLE.lineHeight;
  const availableHeight =
    layout.height - BUBBLE.paddingTop - BUBBLE.paddingBottom;
  const verticalOffset = Math.max(0, (availableHeight - contentHeight) / 2);
  const firstBaseline =
    layout.top +
    BUBBLE.paddingTop +
    verticalOffset +
    BUBBLE.fontSize;

  layout.lines.forEach((line, index) => {
    drawTrackedText(
      context,
      line,
      BUBBLE.x + BUBBLE.paddingX,
      firstBaseline + index * BUBBLE.lineHeight,
      0,
      BUBBLE.textThickness,
    );
  });

  context.restore();
}

function drawFooterSticker(
  context: CanvasRenderingContext2D,
  footerText: string,
): void {
  context.save();
  context.fillStyle = FOREGROUND;
  context.font = getCanvasFont(FOOTER.fontSize);
  context.textBaseline = "alphabetic";
  context.textAlign = "left";

  const width = measureTrackedText(context, footerText, FOOTER.letterSpacing);
  const x = (CANVAS_WIDTH - width) / 2;

  drawTrackedText(
    context,
    footerText,
    x,
    FOOTER.y,
    FOOTER.letterSpacing,
    FOOTER.textThickness,
  );

  context.restore();
}

async function drawComposition(
  context: CanvasRenderingContext2D,
  phrase: string,
  footerText: string,
  avatarBottom: number,
): Promise<void> {
  context.save();
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const avatar = await getAvatar();

  // Preserve avatar.png's intrinsic aspect ratio. We size it by width first,
  // then cap the height only if necessary. This prevents any stretching.
  const sourceRatio = avatar.naturalWidth / avatar.naturalHeight;
  let avatarWidth = AVATAR.targetWidth;
  let avatarHeight = avatarWidth / sourceRatio;

  if (avatarHeight > AVATAR.maxHeight) {
    avatarHeight = AVATAR.maxHeight;
    avatarWidth = avatarHeight * sourceRatio;
  }

  const avatarY = avatarBottom - avatarHeight;

  context.drawImage(
    avatar,
    AVATAR.x,
    avatarY,
    avatarWidth,
    avatarHeight,
  );

  const layout = getBubbleLayout(context, phrase || " ");
  drawPixelBubble(context, layout);
  drawBubbleText(context, layout);
  drawFooterSticker(context, footerText);

  context.restore();
}

async function composeCanvas(
  canvas: HTMLCanvasElement,
  phrase: string,
  footerText: string,
  avatarBottom: number,
): Promise<void> {
  await ensurePixelFont();

  const frame = document.createElement("canvas");
  frame.width = CANVAS_WIDTH;
  frame.height = CANVAS_HEIGHT;

  const frameContext = frame.getContext("2d");

  if (!frameContext) {
    throw new Error("Canvas is unavailable.");
  }

  await drawComposition(frameContext, phrase, footerText, avatarBottom);

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
  context.drawImage(frame, 0, 0);
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

async function downloadPNG(
  phrase: string,
  footerText: string,
  avatarBottom: number,
): Promise<void> {
  await ensurePixelFont();

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = CANVAS_WIDTH;
  sourceCanvas.height = CANVAS_HEIGHT;

  const sourceContext = sourceCanvas.getContext("2d");

  if (!sourceContext) {
    throw new Error("Canvas is unavailable.");
  }

  await drawComposition(sourceContext, phrase, footerText, avatarBottom);

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
  link.download = "onchainhoodies-say-it.png";
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function getReadableError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "The image could not be created.";
}

export default function SayItPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phrase, setPhrase] = useState("$OCH AUG 18th");
  const [footerText, setFooterText] = useState<FooterOption>(FOOTER_OPTIONS[0]);
  const [avatarBottom, setAvatarBottom] = useState(AVATAR.defaultBottom);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const characterCount = phrase.length;
  const lineCount = useMemo(
    () => Math.max(1, phrase.replace(/\r/g, "").split("\n").length),
    [phrase],
  );

  const redraw = useCallback(async () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    try {
      setError("");
      await composeCanvas(canvas, phrase, footerText, avatarBottom);
    } catch (renderError) {
      console.error(renderError);
      setError(getReadableError(renderError));
    }
  }, [avatarBottom, footerText, phrase]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let cancelled = false;

    void composeCanvas(canvas, phrase, footerText, avatarBottom).catch((renderError) => {
      if (cancelled) {
        return;
      }

      console.error(renderError);
      setError(getReadableError(renderError));
    });

    return () => {
      cancelled = true;
    };
  }, [avatarBottom, footerText, phrase]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void redraw();
  }

  async function handleDownload() {
    if (downloading) {
      return;
    }

    setDownloading(true);
    setError("");

    try {
      await downloadPNG(phrase, footerText, avatarBottom);
    } catch (downloadError) {
      console.error(downloadError);
      setError(getReadableError(downloadError));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-[#ccff00]">
      <SiteHeader />

      <section className="px-4 pb-24 pt-28 md:px-6 md:pt-32">
        <div className="mx-auto max-w-5xl text-center">
          <div className="border-b-2 border-[#ccff00] pb-8">
            <p className="text-[8px] uppercase tracking-[0.18em] opacity-60">
              Hood Tool / Say It
            </p>

            <h1 className="mt-5 text-[clamp(2.8rem,8vw,6rem)] leading-[0.86] tracking-[-0.06em]">
              SAY IT
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed opacity-75 md:text-base">
              Put words in the Hoodie&apos;s mouth. The pixel bubble grows with your message.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="border-b-2 border-[#ccff00] py-8">
            <div className="flex items-center justify-between gap-4 text-left">
              <h2 className="text-[10px] uppercase tracking-[0.16em]">
                Message
              </h2>

              <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                {characterCount} chars / {lineCount} manual line{lineCount === 1 ? "" : "s"}
              </p>
            </div>

            <label className="mt-5 block text-left">
              <span className="sr-only">Speech bubble text</span>
              <textarea
                value={phrase}
                rows={4}
                spellCheck={false}
                onChange={(event) => {
                  setPhrase(event.target.value);
                  setError("");
                }}
                placeholder="Type what your Hoodie should say..."
                className="w-full resize-y border-2 border-[#ccff00] bg-black px-5 py-4 text-sm uppercase leading-relaxed text-[#ccff00] outline-none placeholder:text-[#ccff00]/40"
              />
            </label>

          </form>

          <section className="border-b-2 border-[#ccff00] py-8">
            <div className="flex items-center justify-between gap-4 text-left">
              <h2 className="text-[10px] uppercase tracking-[0.16em]">
                Preview
              </h2>

              <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                1200 × 675 PX
              </p>
            </div>

            <div className="mt-5 flex items-center justify-center border-2 border-[#ccff00] bg-[#ccff00] p-3 md:p-6">
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="block h-auto w-full bg-[#ccff00]"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          </section>

          <section className="border-b-2 border-[#ccff00] py-8">
            <div className="flex items-center justify-between gap-4 text-left">
              <h2 className="text-[10px] uppercase tracking-[0.16em]">
                Hoodie Position
              </h2>

              <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                {avatarBottom} PX
              </p>
            </div>

            <div className="mt-5 border-2 border-[#ccff00] p-5">
              <input
                type="range"
                min={AVATAR.minBottom}
                max={AVATAR.maxBottom}
                step="1"
                value={avatarBottom}
                onChange={(event) => {
                  setAvatarBottom(Number(event.target.value));
                  setError("");
                }}
                className="w-full accent-[#ccff00]"
                aria-label="Hoodie vertical position"
              />

              <div className="mt-3 flex justify-between text-[7px] uppercase tracking-[0.12em] opacity-55">
                <span>Higher</span>
                <span>Lower</span>
              </div>
            </div>
          </section>

          <section className="border-b-2 border-[#ccff00] py-8">
            <div className="text-left">
              <h2 className="text-[10px] uppercase tracking-[0.16em]">
                Bottom Sticker
              </h2>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {FOOTER_OPTIONS.map((option) => {
                  const active = footerText === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFooterText(option)}
                      className={`min-h-14 border-2 border-[#ccff00] px-4 text-[8px] uppercase leading-relaxed tracking-[0.1em] transition-colors ${
                        active
                          ? "bg-[#ccff00] text-black"
                          : "bg-black text-[#ccff00] hover:bg-[#ccff00] hover:text-black"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {error ? (
            <p className="mt-6 border-2 border-[#ccff00] px-4 py-4 text-[9px] uppercase leading-relaxed tracking-[0.12em]">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={downloading || phrase.trim() === ""}
            onClick={() => void handleDownload()}
            className="mt-8 min-h-16 w-full border-2 border-[#ccff00] bg-[#ccff00] px-6 text-[10px] uppercase tracking-[0.18em] text-black transition-colors hover:bg-black hover:text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {downloading ? "Creating PNG..." : "Download PNG"}
          </button>

          <p className="mt-4 text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-55">
            The tail and bottom anchor stay fixed. The bubble grows right and upward as needed.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
