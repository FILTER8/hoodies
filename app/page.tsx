"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import {
  contractExplorerUrl,
  shortAddress,
  siteConfig,
} from "../lib/config";

const API_BASE = "https://api.onchainhoodies.xyz";

type NeighborName = "Builder" | "Collector" | "Flipper" | "HODLer";

type NeighborToken = {
  tokenId: number;
  name: string;
  image: string;
  hoodie: NeighborName;
};

type SearchResult = {
  tokenId: number;
  name?: string;
  image?: string;
  traits?: {
    hoodie?: string;
  };
};

type SearchResponse = {
  total: number;
  results: SearchResult[];
};

type MarketMetric = "floor" | "sales" | "volume" | "holders";
type MarketRange = "7D" | "30D" | "ALL";

type ChartPoint = {
  timestamp: number;
  label: string;
  floor: number;
  sales: number;
  volume: number;
  owners: number | null;
  averageSale: number | null;
  medianSale: number | null;
  highestSale: number | null;
  buyers: number | null;
  sellers: number | null;
};

type MarketSummary = {
  floor: number | null;
  floorCurrency: string;
  bestOffer: number | null;
  bestOfferCurrency: string;
  owners: number | null;
  totalVolume: number | null;
  totalSales: number | null;
};

type UnknownRecord = Record<string, unknown>;

const neighborTypes: NeighborName[] = [
  "Builder",
  "Collector",
  "Flipper",
  "HODLer",
];

const neighborFallbacks: Record<NeighborName, string> = {
  Builder: "/builder.png",
  Collector: "/collector.png",
  Flipper: "/flipper.png",
  HODLer: "/hodler.png",
};

const builds = [
  {
    label: "Live",
    title: "Grid Exporter",
    copy: "Choose the Hoodies in your wallet and export them as one clean, branded square PNG.",
    href: "/tools/export",
    action: "Open exporter",
  },
  {
    label: "Live",
    title: "Hoodie Cam",
    copy: "Capture your surroundings through the black-and-green 1-bit language of the Hood.",
    href: "/cam",
    action: "Open camera",
  },
  {
    label: "Live",
    title: "Hoodie Explorer",
    copy: "Explore traits, Neighborhood Rarity, market data and the on-chain ink inside every Hoodie.",
    href: "/tools/explorer",
    action: "Open explorer",
  },
  {
    label: "Live",
    title: "Builder API",
    copy: "Build with artwork, traits, rarity, ink, market data and collector intelligence. Good builds can earn from the 150 OCH Builder Treasury.",
    href: "/api",
    action: "Build in the Hood",
  },
];

const contracts = [
  { label: "Collection", address: siteConfig.collectionAddress },
  { label: "Renderer", address: siteConfig.rendererAddress },
  { label: "Pixel Data", address: siteConfig.pixelDataAddress },
];

const metricLabels: Record<MarketMetric, string> = {
  floor: "Floor",
  sales: "Sales",
  volume: "Volume",
  holders: "Holders",
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (isRecord(value)) {
    for (const key of ["amount", "value", "eth", "price", "total"]) {
      const nested = numberFrom(value[key]);
      if (nested !== null) return nested;
    }
  }

  return null;
}

function stringFrom(value: unknown, fallback = "ETH") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function findValue(
  object: UnknownRecord,
  paths: string[][],
): unknown {
  for (const path of paths) {
    let current: unknown = object;

    for (const key of path) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }

      current = current[key];
    }

    if (current !== undefined && current !== null) return current;
  }

  return undefined;
}

function unwrapData(value: unknown): UnknownRecord {
  if (!isRecord(value)) return {};
  return isRecord(value.data) ? value.data : value;
}

function normalizeMarketSummary(value: unknown): MarketSummary {
  const data = unwrapData(value);

  const floorValue = findValue(data, [
    ["floor"],
    ["floorPrice"],
    ["floor_price"],
    ["collectionFloor"],
    ["total", "floor_price"],
    ["total", "floorPrice"],
  ]);

  const offerValue = findValue(data, [
    ["bestCollectionOffer"],
    ["bestOffer"],
    ["best_offer"],
    ["offers", "best"],
  ]);

  return {
    floor: numberFrom(floorValue),
    floorCurrency: stringFrom(
      findValue(data, [
        ["floor", "currency"],
        ["floor", "symbol"],
        ["floorCurrency"],
        ["floor_price_symbol"],
        ["total", "floor_price_symbol"],
      ]),
    ),
    bestOffer: numberFrom(offerValue),
    bestOfferCurrency: stringFrom(
      findValue(data, [
        ["bestCollectionOffer", "price", "currency"],
        ["bestCollectionOffer", "currency"],
        ["bestOffer", "price", "currency"],
        ["bestOffer", "currency"],
      ]),
      "WETH",
    ),
    owners: numberFrom(
      findValue(data, [
        ["owners"],
        ["ownerCount"],
        ["owner_count"],
        ["total", "owners"],
        ["total", "num_owners"],
      ]),
    ),
    totalVolume: numberFrom(
      findValue(data, [
        ["volume"],
        ["totalVolume"],
        ["total_volume"],
        ["total", "volume"],
      ]),
    ),
    totalSales: numberFrom(
      findValue(data, [
        ["sales"],
        ["totalSales"],
        ["total_sales"],
        ["total", "sales"],
        ["total", "count"],
      ]),
    ),
  };
}

function collectArrays(value: unknown, output: unknown[][] = []): unknown[][] {
  if (Array.isArray(value)) {
    output.push(value);

    for (const item of value) {
      collectArrays(item, output);
    }

    return output;
  }

  if (isRecord(value)) {
    for (const nested of Object.values(value)) {
      collectArrays(nested, output);
    }
  }

  return output;
}

function timestampFrom(record: UnknownRecord): number | null {
  const raw = findValue(record, [
    ["timestamp"],
    ["time"],
    ["date"],
    ["createdAt"],
    ["created_at"],
    ["eventTimestamp"],
    ["event_timestamp"],
    ["blockTimestamp"],
  ]);

  if (typeof raw === "number") {
    return raw > 10_000_000_000 ? raw : raw * 1000;
  }

  if (typeof raw === "string") {
    const numeric = Number(raw);

    if (Number.isFinite(numeric)) {
      return numeric > 10_000_000_000 ? numeric : numeric * 1000;
    }

    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function priceFromRecord(record: UnknownRecord): number | null {
  return numberFrom(
    findValue(record, [
      ["floor"],
      ["floorPrice"],
      ["floor_price"],
      ["price"],
      ["payment", "quantity"],
      ["payment", "amount"],
      ["payment", "value"],
      ["salePrice"],
      ["sale_price"],
      ["value"],
    ]),
  );
}

function normalizeHistory(value: unknown): ChartPoint[] {
  const root = unwrapData(value);
  const source = Array.isArray(root.points) ? root.points : [];

  return source
    .filter(isRecord)
    .map((point) => {
      const date = typeof point.date === "string" ? point.date : null;
      if (!date) return null;

      const timestamp = Date.parse(`${date}T00:00:00Z`);
      if (!Number.isFinite(timestamp)) return null;

      return {
        timestamp,
        label: new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
        }).format(new Date(timestamp)),
        floor: numberFrom(point.floor) ?? 0,
        sales: numberFrom(point.sales) ?? 0,
        volume: numberFrom(point.volume) ?? 0,
        owners: numberFrom(point.owners),
        averageSale: numberFrom(point.averageSale),
        medianSale: numberFrom(point.medianSale),
        highestSale: numberFrom(point.highestSale),
        buyers: numberFrom(point.buyers),
        sellers: numberFrom(point.sellers),
      };
    })
    .filter((point): point is ChartPoint => point !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
}

function normalizeHoodie(value: string): NeighborName | null {
  const normalized = value.trim().toLowerCase();

  if (normalized === "builder") return "Builder";
  if (normalized === "collector") return "Collector";
  if (normalized === "flipper") return "Flipper";
  if (normalized === "hodler") return "HODLer";

  return null;
}

async function fetchRandomNeighbor(
  hoodie: NeighborName,
  signal?: AbortSignal,
): Promise<NeighborToken> {
  const params = new URLSearchParams({
    hoodie,
    limit: "1",
    offset: "0",
    sort: "token",
  });

  const firstResponse = await fetch(
    `${API_BASE}/v1/search?${params.toString()}`,
    {
      signal,
      cache: "no-store",
    },
  );

  if (!firstResponse.ok) {
    throw new Error(`Could not load ${hoodie} supply.`);
  }

  const firstData = (await firstResponse.json()) as SearchResponse;

  if (!Number.isFinite(firstData.total) || firstData.total < 1) {
    throw new Error(`No ${hoodie} Hoodies found.`);
  }

  const randomOffset = Math.floor(Math.random() * firstData.total);
  params.set("offset", String(randomOffset));

  const tokenResponse = await fetch(
    `${API_BASE}/v1/search?${params.toString()}`,
    {
      signal,
      cache: "no-store",
    },
  );

  if (!tokenResponse.ok) {
    throw new Error(`Could not load a random ${hoodie}.`);
  }

  const tokenData = (await tokenResponse.json()) as SearchResponse;
  const result = tokenData.results?.[0];

  if (!result || typeof result.tokenId !== "number") {
    throw new Error(`The ${hoodie} response was empty.`);
  }

  const resolvedHoodie =
    normalizeHoodie(result.traits?.hoodie ?? "") ?? hoodie;

  return {
    tokenId: result.tokenId,
    name: result.name ?? `OnChainHoodies #${result.tokenId}`,
    image:
      result.image ?? `${API_BASE}/images/${result.tokenId}.svg`,
    hoodie: resolvedHoodie,
  };
}

function compactNumber(value: number | null, digits = 2) {
  if (value === null) return "—";

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

function MarketChart({
  points,
  metric,
}: {
  points: ChartPoint[];
  metric: MarketMetric;
}) {
  const width = 1000;
  const height = 390;
  const paddingLeft = 56;
  const paddingRight = 24;
  const paddingTop = 28;
  const paddingBottom = 48;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const isBarChart = metric === "sales" || metric === "volume";

  const visiblePoints =
    metric === "holders"
      ? points.filter((point) => point.owners !== null)
      : points;

  const getValue = (point: ChartPoint) => {
    if (metric === "holders") return point.owners ?? 0;
    return point[metric];
  };

  const values = visiblePoints.map(getValue);
  const rawMaximum = Math.max(...values, 0);
  const positiveValues = values.filter((value) => value > 0);
  const rawMinimum =
    metric === "floor" || metric === "holders"
      ? Math.min(...positiveValues, rawMaximum || 0)
      : 0;

  const isAutoZoomMetric = metric === "floor" || metric === "holders";
  const rawSpread = Math.max(rawMaximum - rawMinimum, 0);

  const minimumPadding = isAutoZoomMetric
    ? metric === "floor"
      ? Math.max(rawMaximum * 0.01, 0.00025)
      : Math.max(rawMaximum * 0.0025, 1)
    : 0;

  const spreadPadding = isAutoZoomMetric
    ? Math.max(rawSpread * 0.18, minimumPadding)
    : 0;

  const minimum = isAutoZoomMetric
    ? Math.max(0, rawMinimum - spreadPadding)
    : 0;

  const maximum = isAutoZoomMetric
    ? rawMaximum + spreadPadding
    : Math.max(rawMaximum, 1);

  const range = Math.max(
    maximum - minimum,
    isAutoZoomMetric ? minimumPadding * 2 : maximum * 0.08,
    0.000001,
  );

  const xForIndex = (index: number) =>
    visiblePoints.length <= 1
      ? paddingLeft + chartWidth / 2
      : paddingLeft +
        (index / (visiblePoints.length - 1)) * chartWidth;

  const yForValue = (value: number) =>
    paddingTop + chartHeight - ((value - minimum) / range) * chartHeight;

  const coordinates = visiblePoints.map((point, index) => ({
    x: xForIndex(index),
    y: yForValue(getValue(point)),
    value: getValue(point),
    point,
  }));

  const line = coordinates
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const barSlot =
    visiblePoints.length > 0 ? chartWidth / visiblePoints.length : chartWidth;
  const barWidth = Math.max(12, Math.min(86, barSlot * 0.58));

  const formatAxisValue = (value: number) => {
    if (metric === "sales" || metric === "holders") {
      return compactNumber(value, 0);
    }

    return compactNumber(value, value < 1 ? 4 : 2);
  };

  if (visiblePoints.length < (isBarChart ? 1 : 2)) {
    return (
      <div className="grid min-h-[390px] place-items-center border-2 border-[#ccff00] p-8 text-center">
        <div>
          <p className="text-sm uppercase tracking-[0.16em]">
            {metric === "holders"
              ? "Holder history starts now"
              : "Market history is loading"}
          </p>
          <p className="mt-3 max-w-md text-xs leading-relaxed opacity-60">
            {metric === "holders"
              ? "Historical owner counts cannot be reconstructed reliably. The hourly recorder is now building this chart forward."
              : "Live summary data remains available above."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-[#ccff00] p-3 md:p-5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${metricLabels[metric]} market chart`}
        className="h-auto w-full overflow-visible"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const ratio = step / 4;
          const y = paddingTop + ratio * chartHeight;
          const axisValue = maximum - ratio * (maximum - minimum);

          return (
            <g key={step}>
              <line
                x1={paddingLeft}
                x2={paddingLeft + chartWidth}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.16"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 12}
                y={y + 4}
                textAnchor="end"
                fill="currentColor"
                fillOpacity="0.52"
                fontSize="13"
              >
                {formatAxisValue(axisValue)}
              </text>
            </g>
          );
        })}

        {isBarChart ? (
          coordinates.map(({ x, y, value, point }, index) => {
            const baseline = paddingTop + chartHeight;
            const renderedHeight = Math.max(2, baseline - y);

            return (
              <g key={`${point.timestamp}-${index}`}>
                <rect
                  x={x - barWidth / 2}
                  y={baseline - renderedHeight}
                  width={barWidth}
                  height={renderedHeight}
                  fill="currentColor"
                  fillOpacity="0.92"
                >
                  <title>
                    {point.label}: {formatAxisValue(value)}
                    {metric === "sales" ? " sales" : " ETH"}
                  </title>
                </rect>
                <rect
                  x={x - barWidth / 2}
                  y={baseline - renderedHeight}
                  width={barWidth}
                  height={renderedHeight}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </g>
            );
          })
        ) : (
          <>
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinejoin="miter"
              strokeLinecap="square"
            />

            {coordinates.map(({ x, y, value, point }, index) => (
              <circle
                key={`${point.timestamp}-${index}`}
                cx={x}
                cy={y}
                r="5"
                fill="currentColor"
              >
                <title>
                  {point.label}: {formatAxisValue(value)}
                  {metric === "floor"
                    ? " ETH"
                    : metric === "holders"
                      ? " holders"
                      : ""}
                </title>
              </circle>
            ))}
          </>
        )}

        {visiblePoints.map((point, index) => {
          const shouldShow =
            visiblePoints.length <= 8 ||
            index === 0 ||
            index === visiblePoints.length - 1 ||
            index % Math.ceil(visiblePoints.length / 6) === 0;

          if (!shouldShow) return null;

          return (
            <text
              key={`label-${point.timestamp}`}
              x={xForIndex(index)}
              y={height - 15}
              textAnchor="middle"
              fill="currentColor"
              fillOpacity="0.52"
              fontSize="12"
            >
              {point.label.toUpperCase()}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function Home() {
  const [neighbors, setNeighbors] = useState<
    Partial<Record<NeighborName, NeighborToken>>
  >({});
  const [loadingNeighbors, setLoadingNeighbors] = useState<
    Partial<Record<NeighborName, boolean>>
  >({});
  const [marketSummary, setMarketSummary] = useState<MarketSummary>({
    floor: null,
    floorCurrency: "ETH",
    bestOffer: null,
    bestOfferCurrency: "WETH",
    owners: null,
    totalVolume: null,
    totalSales: null,
  });
  const [marketPoints, setMarketPoints] = useState<ChartPoint[]>([]);
  const [marketMetric, setMarketMetric] =
    useState<MarketMetric>("floor");
  const [marketRange, setMarketRange] = useState<MarketRange>("30D");
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState(false);

  const refreshNeighbor = useCallback(
    async (hoodie: NeighborName, signal?: AbortSignal) => {
      setLoadingNeighbors((current) => ({
        ...current,
        [hoodie]: true,
      }));

      try {
        const nextNeighbor = await fetchRandomNeighbor(hoodie, signal);

        setNeighbors((current) => ({
          ...current,
          [hoodie]: nextNeighbor,
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
      } finally {
        if (!signal?.aborted) {
          setLoadingNeighbors((current) => ({
            ...current,
            [hoodie]: false,
          }));
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all(
      neighborTypes.map((hoodie) =>
        refreshNeighbor(hoodie, controller.signal),
      ),
    );

    return () => controller.abort();
  }, [refreshNeighbor]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMarket() {
      setMarketLoading(true);
      setMarketError(false);

      const historyRange =
        marketRange === "7D" ? "7d" : marketRange === "30D" ? "30d" : "all";

      try {
        const [summaryResponse, historyResponse] = await Promise.all([
          fetch(`${API_BASE}/v1/market/collection`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(
            `${API_BASE}/v1/market/history?range=${historyRange}`,
            {
              signal: controller.signal,
              cache: "no-store",
            },
          ),
        ]);

        if (!summaryResponse.ok) {
          throw new Error("Market summary unavailable.");
        }

        const summaryJson: unknown = await summaryResponse.json();
        setMarketSummary(normalizeMarketSummary(summaryJson));

        if (historyResponse.ok) {
          const historyJson: unknown = await historyResponse.json();
          setMarketPoints(normalizeHistory(historyJson));
        } else {
          setMarketPoints([]);
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(error);
        setMarketError(true);
      } finally {
        if (!controller.signal.aborted) {
          setMarketLoading(false);
        }
      }
    }

    void loadMarket();

    return () => controller.abort();
  }, [marketRange]);

  const activePoints = useMemo(() => {
    if (marketPoints.length <= 60) return marketPoints;

    const step = Math.ceil(marketPoints.length / 60);
    return marketPoints.filter(
      (_, index) => index % step === 0 || index === marketPoints.length - 1,
    );
  }, [marketPoints]);

  const selectedMarketStats = useMemo(() => {
    const latestFloor =
      [...activePoints].reverse().find((point) => point.floor > 0)?.floor ??
      marketSummary.floor;

    const latestOwners =
      [...activePoints].reverse().find((point) => point.owners !== null)
        ?.owners ?? marketSummary.owners;

    const totalSales = activePoints.reduce(
      (sum, point) => sum + point.sales,
      0,
    );
    const totalVolume = activePoints.reduce(
      (sum, point) => sum + point.volume,
      0,
    );
    const totalBuyers = activePoints.reduce(
      (sum, point) => sum + (point.buyers ?? 0),
      0,
    );
    const totalSellers = activePoints.reduce(
      (sum, point) => sum + (point.sellers ?? 0),
      0,
    );
    const highestSale = Math.max(
      ...activePoints.map((point) => point.highestSale ?? 0),
      0,
    );
    const weightedAverageSale =
      totalSales > 0 ? totalVolume / totalSales : null;

    return {
      latestFloor,
      latestOwners,
      totalSales,
      totalVolume,
      totalBuyers,
      totalSellers,
      highestSale,
      weightedAverageSale,
    };
  }, [activePoints, marketSummary.floor, marketSummary.owners]);

  const selectedMetricValue =
    marketMetric === "floor"
      ? selectedMarketStats.latestFloor
      : marketMetric === "sales"
        ? selectedMarketStats.totalSales
        : marketMetric === "volume"
          ? selectedMarketStats.totalVolume
          : selectedMarketStats.latestOwners;

  return (
    <main className="bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto flex min-h-screen max-w-[1440px] flex-col items-center justify-center px-6 pb-16 pt-28 text-center">
        <img
          src="/onchainhoodies.gif"
          alt="Animated OnChainHoodie"
          className="image-render-pixel mb-9 w-[220px] md:w-[350px]"
        />

        <h1 className="text-[clamp(4rem,12vw,10rem)] leading-[0.82] tracking-[-0.08em]">
          WELCOME TO
          <br />
          THE HOOD
        </h1>

        <p className="mt-10 max-w-xl text-lg leading-relaxed md:text-2xl">
          A fully on-chain neighborhood.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href="#builds" className="pixel-cta">
            Explore the builds
          </a>
          <a
            href={siteConfig.openSeaUrl}
            target="_blank"
            rel="noreferrer"
            className="pixel-cta pixel-cta-dark"
          >
            View on OpenSea
          </a>
        </div>

        <div className="mt-16 grid w-full max-w-5xl grid-cols-2 border-2 border-black text-[10px] uppercase tracking-[0.16em] md:grid-cols-4">
          {[
            "6,000 Hoodies",
            siteConfig.chainName,
            "Fully On-Chain",
            "CC0",
          ].map((item) => (
            <div
              key={item}
              className="border-black p-4 even:border-l-2 md:border-l-2 md:first:border-l-0"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="collection" className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>01 / Collection</p>
            <p>Meet the Hood</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <h2 className="section-title">
                Four neighbors.
                <br />
                One Hood.
              </h2>

              <p className="mt-8 max-w-xl text-lg leading-relaxed opacity-80 md:text-xl">
                Builders, Collectors, Flippers and HODLers. Familiar faces from
                the on-chain world, hand-drawn in 1-bit and stored fully
                on-chain.
              </p>

              <p className="mt-5 text-[10px] uppercase tracking-[0.16em] opacity-60">
                Tap a neighbor to meet another.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {neighborTypes.map((hoodie) => {
                const neighbor = neighbors[hoodie];
                const isLoading = loadingNeighbors[hoodie] ?? false;
                const image = neighbor?.image ?? neighborFallbacks[hoodie];
                const tokenLabel = neighbor
                  ? `#${neighbor.tokenId}`
                  : "Loading";

                return (
                  <button
                    key={hoodie}
                    type="button"
                    onClick={() => void refreshNeighbor(hoodie)}
                    disabled={isLoading}
                    aria-label={`Load another ${hoodie} Hoodie`}
                    className="border-2 border-[#ccff00] text-left disabled:cursor-wait disabled:opacity-70"
                  >
                    <div className="aspect-square overflow-hidden bg-[#ccff00]">
                      <img
                        src={image}
                        alt={
                          neighbor?.name ??
                          `${hoodie} OnChainHoodie`
                        }
                        className="image-render-pixel h-full w-full object-cover"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t-2 border-[#ccff00] p-3 text-[10px] uppercase tracking-[0.14em]">
                      <span>{hoodie}</span>
                      <span className="opacity-60">{tokenLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="market" className="bg-[#ccff00] px-6 py-24 text-black">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>02 / Market</p>
            <p>Track the Hood</p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="section-title">
                Culture lives.
                <br />
                Markets move.
              </h2>

              <p className="mt-8 max-w-xl text-lg leading-relaxed opacity-75 md:text-xl">
                Follow floor, sales and volume directly from the
                OnChainHoodies market layer.
              </p>

              <div className="mt-9 grid grid-cols-2 border-l-2 border-t-2 border-black">
                {[
                  {
                    label: "Floor",
                    value: marketLoading
                      ? "..."
                      : `${compactNumber(marketSummary.floor, 4)} ${
                          marketSummary.floorCurrency
                        }`,
                  },
                  {
                    label: "Best offer",
                    value: marketLoading
                      ? "..."
                      : `${compactNumber(marketSummary.bestOffer, 4)} ${
                          marketSummary.bestOfferCurrency
                        }`,
                  },
                  {
                    label: "Owners",
                    value: marketLoading
                      ? "..."
                      : compactNumber(marketSummary.owners, 0),
                  },
                  {
                    label: "Total volume",
                    value: marketLoading
                      ? "..."
                      : `${compactNumber(
                          marketSummary.totalVolume,
                          2,
                        )} ETH`,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="border-b-2 border-r-2 border-black p-4"
                  >
                    <p className="text-[8px] uppercase tracking-[0.15em] opacity-55">
                      {stat.label}
                    </p>
                    <p className="mt-3 text-xl leading-none">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <a
                href={siteConfig.openSeaUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-block text-[10px] uppercase tracking-[0.15em] underline underline-offset-4"
              >
                Trade on OpenSea ↗
              </a>
            </div>

            <div className="min-w-0">
              <div className="flex flex-col gap-3 border-2 border-black bg-black p-3 text-[#ccff00] md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap">
                  {(
                    ["floor", "sales", "volume", "holders"] as MarketMetric[]
                  ).map((metric) => (
                    <button
                      key={metric}
                      type="button"
                      onClick={() => setMarketMetric(metric)}
                      className={`border border-[#ccff00] px-4 py-3 text-[9px] uppercase tracking-[0.14em] ${
                        marketMetric === metric
                          ? "bg-[#ccff00] text-black"
                          : ""
                      }`}
                    >
                      {metricLabels[metric]}
                    </button>
                  ))}
                </div>

                <div className="flex">
                  {(["7D", "30D", "ALL"] as MarketRange[]).map(
                    (range) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setMarketRange(range)}
                        className={`border border-[#ccff00] px-4 py-3 text-[9px] uppercase tracking-[0.14em] ${
                          marketRange === range
                            ? "bg-[#ccff00] text-black"
                            : ""
                        }`}
                      >
                        {range}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="bg-black p-4 text-[#ccff00] md:p-6">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">
                      {metricLabels[marketMetric]} · {marketRange} ·{" "}
                      {marketMetric === "sales" || marketMetric === "volume"
                        ? "Period total"
                        : "Latest"}
                    </p>
                    <p className="mt-2 text-4xl leading-none tracking-[-0.05em]">
                      {marketLoading
                        ? "..."
                        : compactNumber(
                            selectedMetricValue,
                            marketMetric === "floor" ? 4 : 2,
                          )}
                      {!marketLoading &&
                      (marketMetric === "floor" || marketMetric === "volume")
                        ? " ETH"
                        : ""}
                    </p>
                  </div>

                  <p className="text-[8px] uppercase tracking-[0.13em] opacity-50">
                    Source · OpenSea via OCH API
                  </p>
                </div>

                {(marketMetric === "floor" ||
                  marketMetric === "holders") &&
                activePoints.length > 0 ? (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-[#ccff00] px-3 py-3 text-[8px] uppercase tracking-[0.13em]">
                    <span className="opacity-55">
                      Auto-zoomed to visible range
                    </span>
                    <span>
                      {marketMetric === "floor"
                        ? `${compactNumber(
                            Math.min(
                              ...activePoints
                                .map((point) => point.floor)
                                .filter((value) => value > 0),
                            ),
                            4,
                          )} — ${compactNumber(
                            Math.max(
                              ...activePoints.map((point) => point.floor),
                            ),
                            4,
                          )} ETH`
                        : `${compactNumber(
                            Math.min(
                              ...activePoints
                                .map((point) => point.owners)
                                .filter(
                                  (value): value is number =>
                                    value !== null,
                                ),
                            ),
                            0,
                          )} — ${compactNumber(
                            Math.max(
                              ...activePoints
                                .map((point) => point.owners)
                                .filter(
                                  (value): value is number =>
                                    value !== null,
                                ),
                            ),
                            0,
                          )} holders`}
                    </span>
                  </div>
                ) : null}

                <div className="mb-4 grid grid-cols-2 border-l border-t border-[#ccff00] md:grid-cols-4">
                  {[
                    {
                      label: "Average sale",
                      value:
                        selectedMarketStats.weightedAverageSale === null
                          ? "—"
                          : `${compactNumber(
                              selectedMarketStats.weightedAverageSale,
                              4,
                            )} ETH`,
                    },
                    {
                      label: "Highest sale",
                      value: `${compactNumber(
                        selectedMarketStats.highestSale,
                        4,
                      )} ETH`,
                    },
                    {
                      label: "Buyers",
                      value: compactNumber(
                        selectedMarketStats.totalBuyers,
                        0,
                      ),
                    },
                    {
                      label: "Sellers",
                      value: compactNumber(
                        selectedMarketStats.totalSellers,
                        0,
                      ),
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="border-b border-r border-[#ccff00] p-3"
                    >
                      <p className="text-[7px] uppercase tracking-[0.14em] opacity-50">
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>

                {marketMetric === "holders" &&
                activePoints.every((point) => point.owners === null) ? (
                  <p className="mb-4 border border-[#ccff00] p-3 text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-60">
                    Holder history is recorded from API v1.5 onward. Earlier
                    daily owner counts are intentionally left blank rather
                    than estimated.
                  </p>
                ) : null}

                {marketError ? (
                  <div className="grid min-h-[390px] place-items-center border-2 border-[#ccff00] p-8 text-center">
                    Market data is temporarily unavailable.
                  </div>
                ) : (
                  <MarketChart
                    points={activePoints}
                    metric={marketMetric}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="och" className="bg-black px-6 py-24 text-[#ccff00]">
  <div className="mx-auto max-w-[1440px]">
    <div className="section-heading-row">
      <p>03 / The Hood Economy</p>
      <p>OCH / Coming Soon</p>
    </div>

    <div className="mt-12 grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
      <div>
        <img
          src="/coin1.gif"
          alt="Animated OCH coin"
          className="image-render-pixel h-36 w-36 object-contain md:h-52 md:w-52"
        />

        <p className="mt-8 text-[10px] uppercase tracking-[0.18em] opacity-60">
          The Currency of the Hood
        </p>

        <h2 className="section-title mt-4">
          $OCH
          <br />
          Built for the Hood.
        </h2>

        <p className="mt-8 max-w-xl text-lg leading-relaxed opacity-75 md:text-xl">
          A fixed-supply ERC-20 planned for citizens, contributors and the
          wider OnChainHoodies ecosystem.
        </p>

        <Link
          href="/och"
          className="mt-10 inline-block text-xs uppercase tracking-[0.18em] underline underline-offset-4"
        >
          Explore the Economy →
        </Link>
      </div>

      <div className="grid gap-10 md:grid-cols-[0.75fr_1.25fr] md:items-center">
        <div className="mx-auto aspect-square w-full max-w-[260px]">
          <svg
            viewBox="0 0 240 240"
            role="img"
            aria-label="Proposed OCH allocation chart"
            className="h-full w-full"
          >
            <circle
              cx="120"
              cy="120"
              r="86"
              fill="none"
              stroke="currentColor"
              strokeWidth="30"
              opacity="0.12"
            />

            <g transform="rotate(-90 120 120)">
              {[
                { dash: "30 70", offset: 0, opacity: 1 },
                { dash: "35 65", offset: -30, opacity: 0.82 },
                { dash: "15 85", offset: -65, opacity: 0.64 },
                { dash: "10 90", offset: -80, opacity: 0.48 },
                { dash: "5 95", offset: -90, opacity: 0.34 },
                { dash: "5 95", offset: -95, opacity: 0.22 },
              ].map((segment, index) => (
                <circle
                  key={index}
                  cx="120"
                  cy="120"
                  r="86"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="30"
                  pathLength="100"
                  strokeDasharray={segment.dash}
                  strokeDashoffset={segment.offset}
                  strokeLinecap="butt"
                  opacity={segment.opacity}
                />
              ))}
            </g>

            <circle
              cx="120"
              cy="120"
              r="58"
              fill="black"
              stroke="currentColor"
              strokeWidth="1"
            />

            <text
              x="120"
              y="111"
              textAnchor="middle"
              fill="currentColor"
              fontSize="10"
              letterSpacing="2"
            >
              PROPOSED
            </text>

            <text
              x="120"
              y="137"
              textAnchor="middle"
              fill="currentColor"
              fontSize="24"
            >
              100M
            </text>
          </svg>
        </div>

        <div className="border-l-2 border-t-2 border-[#ccff00]">
          {[
            ["Citizens", "30%"],
            ["Community Fund", "35%"],
            ["Liquidity", "15%"],
            ["Treasury", "10%"],
            ["Robinhood Ecosystem", "5%"],
            ["Team", "5%"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 border-b-2 border-r-2 border-[#ccff00] p-4"
            >
              <span className="text-sm md:text-base">{label}</span>
              <span className="text-xl leading-none md:text-2xl">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="mt-10 border border-[#ccff00] px-4 py-3 text-center text-[8px] uppercase leading-relaxed tracking-[0.14em] opacity-70">
      No OCH contract has been deployed. Beware of fake tokens and links.
    </div>
  </div>
</section>

      <section id="builds" className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>04 / Builds</p>
            <p>Built in the Hood</p>
          </div>

          <div className="mt-12 grid border-l-2 border-t-2 border-black md:grid-cols-2">
            {builds.map((build, index) => (
              <article
                key={build.title}
                className="flex min-h-[330px] flex-col justify-between border-b-2 border-r-2 border-black p-6 md:p-10"
              >
                <div>
                  <div className="flex items-start justify-between gap-6">
                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span className="border border-black px-2 py-1 text-[9px] uppercase tracking-[0.14em]">
                      {build.label}
                    </span>
                  </div>

                  <h3 className="mt-12 text-4xl leading-none md:text-5xl">
                    {build.title}
                  </h3>

                  <p className="mt-6 max-w-xl text-base leading-relaxed opacity-75 md:text-lg">
                    {build.copy}
                  </p>
                </div>

                <Link
                  href={build.href}
                  className="mt-10 text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                >
                  {build.action} →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="agents" className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-2">
          <div>
            <div className="section-heading-row">
              <p>05 / Agents</p>
              <p>Humans + machines</p>
            </div>

            <h2 className="section-title mt-12">
              Readable by humans.
              <br />
              Ready for agents.
            </h2>
          </div>

          <div className="flex flex-col justify-end">
            <p className="max-w-2xl text-lg leading-relaxed opacity-80 md:text-2xl">
              Fully on-chain data gives collectors, builders and agents an open
              foundation to inspect traits, interpret artwork, read markets and
              create new ways to explore the collection.
            </p>

            <div className="mt-10 grid grid-cols-2 border-l border-t border-[#ccff00] text-[10px] uppercase tracking-[0.14em]">
              {[
                "On-chain metadata",
                "Market intelligence",
                "Machine-readable artwork",
                "Builder API",
              ].map((item) => (
                <div
                  key={item}
                  className="border-b border-r border-[#ccff00] p-4"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contracts" className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>06 / On-chain</p>
            <p>Verify everything</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="section-title">Contracts, not promises.</h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75">
                Collection data, rendering and pixels live on-chain. Inspect
                the contracts, read the code and verify the Hood yourself.
              </p>
            </div>

            <div className="border-l-2 border-t-2 border-black">
              {contracts.map((contract) => {
                const href = contractExplorerUrl(contract.address);

                return (
                  <div
                    key={contract.label}
                    className="grid gap-3 border-b-2 border-r-2 border-black p-5 md:grid-cols-[160px_1fr_auto] md:items-center"
                  >
                    <span className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                      {contract.label}
                    </span>

                    <code className="break-all text-sm">
                      {contract.address || "Add address in .env.local"}
                    </code>

                    {href === "#" ? (
                      <span className="text-[10px] uppercase tracking-[0.14em] opacity-40">
                        {shortAddress(contract.address)}
                      </span>
                    ) : (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] uppercase tracking-[0.14em] underline underline-offset-4"
                      >
                        Explorer ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

            <section className="bg-black px-6 py-7 text-[#ccff00]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 border-y border-[#ccff00] py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
              Community / Discord
            </p>

            <h2 className="mt-2 text-2xl leading-none tracking-[-0.04em] md:text-3xl">
              Build with your neighbors.
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-70 md:text-base">
              Meet builders, collectors and holders inside the Hood. Share what
              you are working on, find collaborators and stay close to what
              ships next.
            </p>
          </div>

          <a
            href="https://discord.gg/onchainhood"
            target="_blank"
            rel="noreferrer"
            className="pixel-cta shrink-0 border-[#ccff00]"
          >
            Join the Hood →
          </a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}