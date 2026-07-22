"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { useWallet } from "../../../components/WalletProvider";
import { apiConfig, collectionApiUrl } from "../../../lib/api";

type Hoodie = {
  tokenId: string;
  name: string;
  image: string;
};

type ApiResponse = {
  items?: Hoodie[];
  count?: number;
  indexedTotal?: number | null;
  pagesRead?: number;
  error?: string;
};

type GridShape = {
  columns: number;
  rows: number;
};

const outputSizes = [1200, 2400, 4800] as const;
const MAX_SPACE_AROUND = 120;
const MAX_SPACE_BETWEEN = 60;
const REFERENCE_OUTPUT_SIZE = 1200;
const GREEN = "#ccff00";
const BLACK = "#000000";
function artworkUrl(hoodie: Hoodie) {
  if (apiConfig.isMainnet) {
    return collectionApiUrl(
      `/images/${encodeURIComponent(hoodie.tokenId)}.svg`,
    );
  }

  return (
    hoodie.image ||
    `/api/hoodies/image?tokenId=${encodeURIComponent(hoodie.tokenId)}`
  );
}

function getGridShape(count: number): GridShape {
  if (count <= 0) return { columns: 1, rows: 1 };

  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);

  return { columns, rows };
}

function scaledSpacing(value: number, outputSize: number) {
  return Math.round((value / REFERENCE_OUTPUT_SIZE) * outputSize);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadArtwork(source: string) {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Artwork could not be loaded."));
    image.src = source;
  });

  return image;
}

function drawTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  fontSize: number,
  tracking: number
) {
  context.font = `${fontSize}px DepartureMono, monospace`;
  context.textAlign = "left";
  context.textBaseline = "middle";

  const characters = Array.from(text);
  const widths = characters.map((character) =>
    context.measureText(character).width
  );
  const totalWidth =
    widths.reduce((sum, width) => sum + width, 0) +
    tracking * Math.max(0, characters.length - 1);

  let x = centerX - totalWidth / 2;

  characters.forEach((character, index) => {
    context.fillText(character, x, y);
    x += widths[index] + tracking;
  });
}

function HoodieArtwork({ hoodie }: { hoodie: Hoodie }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center bg-black p-2 text-center text-[8px] uppercase tracking-[0.1em] text-[#ccff00]">
        Artwork unavailable
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <img
        src={artworkUrl(hoodie)}
        alt={hoodie.name || `OnChainHoodie #${hoodie.tokenId}`}
        loading="lazy"
        decoding="async"
        crossOrigin="anonymous"
        onError={() => setFailed(true)}
        className="image-render-pixel h-full w-full object-cover"
      />
    </div>
  );
}

function CompactToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex min-h-9 items-center justify-between gap-3 border border-black px-3 py-2 text-left text-[9px] uppercase tracking-[0.13em] ${
        checked ? "bg-black text-[#ccff00]" : "bg-[#ccff00] text-black"
      }`}
      aria-pressed={checked}
    >
      <span>{label}</span>
      <span>{checked ? "■" : "□"}</span>
    </button>
  );
}

function CompactOptions<T extends number>({
  label,
  options,
  value,
  suffix = "",
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  suffix?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="border border-black p-2.5">
      <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">{label}</p>
      <div className="mt-2 flex gap-1.5">
        {options.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={`min-w-11 flex-1 border border-black px-2 py-2 text-[9px] uppercase tracking-[0.1em] ${
              value === item ? "bg-black text-[#ccff00]" : ""
            }`}
          >
            {item}
            {suffix}
          </button>
        ))}
      </div>
    </div>
  );
}


function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block border border-black p-2.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[8px] uppercase tracking-[0.14em] opacity-60">
          {label}
        </span>
        <span className="text-[9px] uppercase tracking-[0.12em]">
          {value}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="pixel-slider"
      />
    </label>
  );
}

export default function ExportPage() {
  const { address, connect } = useWallet();
  const [hoodies, setHoodies] = useState<Hoodie[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outputSize, setOutputSize] = useState<(typeof outputSizes)[number]>(2400);
  const [spaceAround, setSpaceAround] = useState(50);
  const [spaceBetween, setSpaceBetween] = useState(20);
  const [showTokenIds, setShowTokenIds] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [indexInfo, setIndexInfo] = useState("");

  const requestHoodies = useCallback(
    async (owner: string, signal?: AbortSignal) => {
      const params = new URLSearchParams({ owner });
      const response = await fetch(`/api/hoodies?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(data.error || "Unable to load your Hoodies.");
      }

      const unique = Array.from(
        new Map((data.items || []).map((item) => [item.tokenId, item])).values()
      ).sort((a, b) => {
        const left = BigInt(a.tokenId);
        const right = BigInt(b.tokenId);
        return left < right ? -1 : left > right ? 1 : 0;
      });

      return { data, unique };
    },
    []
  );

  const applyLoadedHoodies = useCallback(
    (data: ApiResponse, unique: Hoodie[]) => {
      setHoodies(unique);
      setSelected(new Set(unique.map((item) => item.tokenId)));

      if (
        typeof data.indexedTotal === "number" &&
        data.indexedTotal !== unique.length
      ) {
        setIndexInfo(
          `Alchemy reported ${data.indexedTotal} records; ${unique.length} unique Hoodies were loaded.`
        );
      } else {
        setIndexInfo("");
      }
    },
    []
  );

  const loadHoodies = useCallback(async () => {
    if (!address) {
      setHoodies([]);
      setSelected(new Set());
      setIndexInfo("");
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setIndexInfo("");

    try {
      const { data, unique } = await requestHoodies(address);
      applyLoadedHoodies(data, unique);
    } catch (loadError) {
      setHoodies([]);
      setSelected(new Set());
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your Hoodies."
      );
    } finally {
      setLoading(false);
    }
  }, [address, applyLoadedHoodies, requestHoodies]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void Promise.resolve().then(async () => {
      if (!active) return;

      if (!address) {
        setHoodies([]);
        setSelected(new Set());
        setIndexInfo("");
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setIndexInfo("");

      try {
        const { data, unique } = await requestHoodies(
          address,
          controller.signal
        );

        if (!active) return;
        applyLoadedHoodies(data, unique);
      } catch (loadError) {
        if (!active || controller.signal.aborted) return;

        setHoodies([]);
        setSelected(new Set());
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your Hoodies."
        );
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [address, applyLoadedHoodies, requestHoodies]);

  const selectedHoodies = useMemo(
    () => hoodies.filter((hoodie) => selected.has(hoodie.tokenId)),
    [hoodies, selected]
  );

  const gridShape = useMemo(
    () => getGridShape(selectedHoodies.length),
    [selectedHoodies.length]
  );

  function toggleToken(tokenId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tokenId)) next.delete(tokenId);
      else next.add(tokenId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === hoodies.length
        ? new Set()
        : new Set(hoodies.map((hoodie) => hoodie.tokenId))
    );
  }

  async function exportGrid() {
    if (!selectedHoodies.length) return;

    setExporting(true);
    setError(null);
    setProgress("Preparing square");

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const { columns, rows } = gridShape;
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable in this browser.");

      context.imageSmoothingEnabled = false;
      context.fillStyle = GREEN;
      context.fillRect(0, 0, outputSize, outputSize);

      const outerPadding = scaledSpacing(spaceAround, outputSize);
      const gap = scaledSpacing(spaceBetween, outputSize);
      const brandFontSize = Math.max(18, Math.round(outputSize * 0.014));
      const brandHeight = showBranding
        ? Math.max(
            Math.round(outputSize * 0.06),
            Math.round(brandFontSize * 2.4)
          )
        : 0;
      const brandingGap = showBranding
        ? Math.max(8, Math.round(outputSize * 0.012))
        : 0;
      const idFontSize = showTokenIds
        ? Math.max(9, Math.round(outputSize * 0.0105))
        : 0;
      const idGap = showTokenIds
        ? Math.max(4, Math.round(outputSize * 0.0035))
        : 0;
      const idLineHeight = showTokenIds
        ? Math.max(idFontSize + 4, Math.round(idFontSize * 1.4))
        : 0;
      const idHeight = idGap + idLineHeight;

      const contentTop =
        outerPadding + brandHeight + brandingGap;
      const contentBottom = outputSize - outerPadding;
      const contentHeight = contentBottom - contentTop;

      const availableWidth =
        outputSize - outerPadding * 2 - gap * Math.max(0, columns - 1);
      const availableGridHeight =
        contentHeight - gap * Math.max(0, rows - 1);

      const cellByWidth = availableWidth / columns;
      const cellByHeight = availableGridHeight / rows;
      const artworkSize = Math.floor(
        Math.min(cellByWidth, cellByHeight - idHeight)
      );

      if (artworkSize < 8) {
        throw new Error(
          "This selection needs more room. Choose a larger output size or less spacing."
        );
      }

      const cellHeight = artworkSize + idHeight;
      const gridWidth = columns * artworkSize + gap * Math.max(0, columns - 1);
      const gridHeight = rows * cellHeight + gap * Math.max(0, rows - 1);
      const gridLeft = Math.round((outputSize - gridWidth) / 2);
      const gridTop = Math.round(
        contentTop + Math.max(0, (contentHeight - gridHeight) / 2)
      );

      context.fillStyle = BLACK;
      context.textAlign = "center";
      context.textBaseline = "middle";

      for (let index = 0; index < selectedHoodies.length; index += 1) {
        const hoodie = selectedHoodies[index];
        setProgress(`Loading ${index + 1} / ${selectedHoodies.length}`);

        const image = await loadArtwork(artworkUrl(hoodie));
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = gridLeft + column * (artworkSize + gap);
        const y = gridTop + row * (cellHeight + gap);

        context.drawImage(image, x, y, artworkSize, artworkSize);

        if (showTokenIds) {
          context.save();
          context.fillStyle = BLACK;
          context.font = `${idFontSize}px DepartureMono, monospace`;
          context.textAlign = "center";
          context.textBaseline = "top";
          context.fillText(
            `#${hoodie.tokenId}`,
            x + artworkSize / 2,
            y + artworkSize + idGap
          );
          context.restore();
        }
      }

      // Draw the branding last so artwork can never cover it.
      if (showBranding) {
        context.save();
        context.fillStyle = BLACK;

        const brandTracking = Math.max(2, Math.round(outputSize * 0.0035));

        drawTrackedText(
          context,
          "ONCHAINHOODIES",
          outputSize / 2,
          outerPadding + brandHeight / 2,
          brandFontSize,
          brandTracking
        );

        context.restore();
      }

      setProgress("Creating PNG");

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Grid export failed."));
        }, "image/png");
      });

      downloadBlob(
        blob,
        `onchainhoodies-${selectedHoodies.length}-${outputSize}x${outputSize}.png`
      );
      setProgress("Export complete");
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : "Export failed."
      );
      setProgress("");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <style jsx global>{`
        .pixel-slider {
          width: 100%;
          height: 14px;
          appearance: none;
          background: transparent;
          cursor: pointer;
          touch-action: pan-x;
        }

        .pixel-slider::-webkit-slider-runnable-track {
          height: 4px;
          background: #000000;
          border: 0;
        }

        .pixel-slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 22px;
          margin-top: -9px;
          background: #000000;
          border: 0;
          border-radius: 0;
        }

        .pixel-slider::-moz-range-track {
          height: 4px;
          background: #000000;
          border: 0;
        }

        .pixel-slider::-moz-range-thumb {
          width: 16px;
          height: 22px;
          background: #000000;
          border: 0;
          border-radius: 0;
        }
      `}</style>
      <SiteHeader />

      <section className="mx-auto max-w-[1500px] px-4 pb-14 pt-20 md:px-6 md:pt-24">
        <div className="section-heading-row border-black">
          <p>Build 01 / Live</p>
          <Link href="/">Back to the Hood</Link>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
            <p className="text-[9px] uppercase tracking-[0.18em]">Holder tool</p>
            <h1 className="mt-3 text-5xl leading-[0.86] tracking-[-0.06em] md:text-6xl">
              GRID
              <br />
              EXPORTER
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed opacity-75">
              Select your Hoodies and export one automatically arranged square
              PNG.
            </p>

            {!address ? (
              <button type="button" onClick={connect} className="pixel-cta mt-5 w-full">
                Connect wallet
              </button>
            ) : (
              <>
                <div className="mt-5 border border-black">
                  <button
                    type="button"
                    onClick={() => setPickerOpen((current) => !current)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-[10px] uppercase tracking-[0.13em]"
                  >
                    <span>
                      Your Hoodies / {selectedHoodies.length} of {hoodies.length}
                    </span>
                    <span>{pickerOpen ? "−" : "+"}</span>
                  </button>

                  {pickerOpen && (
                    <div className="border-t border-black">
                      <div className="flex items-center justify-between gap-3 border-b border-black px-3 py-2">
                        <button
                          type="button"
                          onClick={toggleAll}
                          className="text-[9px] uppercase tracking-[0.12em] underline underline-offset-4"
                        >
                          {selected.size === hoodies.length ? "Clear all" : "Select all"}
                        </button>
                        <span className="text-[8px] uppercase tracking-[0.12em] opacity-55">
                          Scroll
                        </span>
                      </div>

                      <div className="max-h-[310px] overflow-y-auto overscroll-contain">
                        {loading ? (
                          <div className="p-3 text-[9px] uppercase tracking-[0.12em]">
                            Reading ownership
                          </div>
                        ) : (
                          hoodies.map((hoodie) => {
                            const isSelected = selected.has(hoodie.tokenId);
                            return (
                              <button
                                key={hoodie.tokenId}
                                type="button"
                                onClick={() => toggleToken(hoodie.tokenId)}
                                className={`flex w-full items-center gap-2 border-b border-black/25 p-1.5 text-left last:border-b-0 ${
                                  isSelected ? "bg-black text-[#ccff00]" : ""
                                }`}
                              >
                                <div className="h-9 w-9 shrink-0 overflow-hidden bg-black">
                                  <HoodieArtwork hoodie={hoodie} />
                                </div>
                                <span className="min-w-0 flex-1 truncate text-[8px] uppercase tracking-[0.09em]">
                                  {hoodie.name || `OnChainHoodie #${hoodie.tokenId}`}
                                </span>
                                <span className="text-[10px]">{isSelected ? "■" : "□"}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void loadHoodies()}
                  disabled={loading}
                  className="mt-2 w-full border border-black px-3 py-2.5 text-[9px] uppercase tracking-[0.13em] disabled:opacity-40"
                >
                  {loading ? "Loading ownership" : "Refresh ownership"}
                </button>
              </>
            )}

            {error && (
              <div className="mt-3 border border-black bg-black p-3 text-xs leading-relaxed text-[#ccff00]">
                {error}
              </div>
            )}

            {indexInfo && !error && (
              <div className="mt-3 border border-black p-3 text-[10px] leading-relaxed opacity-70">
                {indexInfo}
              </div>
            )}
          </aside>

          <div className="min-w-0">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <ControlSlider
                label="Space around"
                value={spaceAround}
                min={0}
                max={MAX_SPACE_AROUND}
                step={1}
                onChange={setSpaceAround}
              />
              <ControlSlider
                label="Space between"
                value={spaceBetween}
                min={0}
                max={MAX_SPACE_BETWEEN}
                step={1}
                onChange={setSpaceBetween}
              />
              <CompactOptions
                label="Output"
                options={outputSizes}
                value={outputSize}
                suffix=""
                onChange={setOutputSize}
              />
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <CompactToggle
                checked={showTokenIds}
                label="Token IDs"
                onChange={() => setShowTokenIds((current) => !current)}
              />
              <CompactToggle
                checked={showBranding}
                label="OnChainHoodies branding"
                onChange={() => setShowBranding((current) => !current)}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 border-b border-black pb-2 text-[8px] uppercase tracking-[0.12em] opacity-65">
              <span>
                Auto grid: {gridShape.columns} × {gridShape.rows}
              </span>
              <span>Square output</span>
            </div>

            <div className="mt-3 flex justify-center">
              <div className="w-full max-w-[760px] border border-black bg-black p-1.5">
                <div className="relative aspect-square overflow-hidden bg-[#ccff00]">
                  {selectedHoodies.length > 0 ? (
                    <SquarePreview
                      hoodies={selectedHoodies}
                      columns={gridShape.columns}
                      rows={gridShape.rows}
                      spaceAround={spaceAround}
                      spaceBetween={spaceBetween}
                      showTokenIds={showTokenIds}
                      showBranding={showBranding}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center">
                      <p className="max-w-sm text-[10px] uppercase leading-relaxed tracking-[0.12em] opacity-60">
                        {address
                          ? "Choose at least one Hoodie from the menu."
                          : "Connect the wallet holding your Hoodies."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={exportGrid}
              disabled={exporting || selectedHoodies.length === 0}
              className="mt-3 w-full max-w-[760px] border border-black px-4 py-3 text-[10px] uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-40 xl:mx-auto xl:block"
            >
              {exporting
                ? progress || "Exporting"
                : `Export square / ${selectedHoodies.length} selected`}
            </button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function SquarePreview({
  hoodies,
  columns,
  rows,
  spaceAround,
  spaceBetween,
  showTokenIds,
  showBranding,
}: {
  hoodies: Hoodie[];
  columns: number;
  rows: number;
  spaceAround: number;
  spaceBetween: number;
  showTokenIds: boolean;
  showBranding: boolean;
}) {
  const previewPadding = `${(spaceAround / REFERENCE_OUTPUT_SIZE) * 100}%`;
  const previewGap = `${(spaceBetween / REFERENCE_OUTPUT_SIZE) * 100}cqw`;
  const brandFraction = showBranding ? 0.06 : 0;
  const gridFraction = 1 - brandFraction;

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{
        padding: previewPadding,
        containerType: "inline-size",
      }}
    >
      {showBranding && (
        <div
          className="flex shrink-0 items-center justify-center text-[8px] uppercase tracking-[0.24em] md:text-[9px]"
          style={{ height: `${brandFraction * 100}%` }}
        >
          OnChainHoodies
        </div>
      )}

      <div
        className="grid min-h-0 flex-1 place-content-center"
        style={{
          height: `${gridFraction * 100}%`,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: previewGap,
        }}
      >
        {hoodies.map((hoodie) => (
          <div
            key={hoodie.tokenId}
            className="flex min-h-0 min-w-0 flex-col items-center overflow-hidden"
          >
            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              <div className="aspect-square h-full max-h-full max-w-full overflow-hidden bg-black">
                <HoodieArtwork hoodie={hoodie} />
              </div>
            </div>
            {showTokenIds && (
              <p className="shrink-0 pt-[0.5cqw] text-center text-[clamp(5px,0.9cqw,9px)] leading-none uppercase tracking-[0.08em]">
                #{hoodie.tokenId}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}