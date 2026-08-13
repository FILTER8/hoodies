"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";

import { siteConfig } from "../../lib/config";
import { apiConfig, collectionApiUrl } from "../../lib/api";

const BRAND_URL = "ONCHAINHOODIES.XYZ";

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type OwnedHoodie = {
  tokenId: string;
  name: string;
  image?: string;
};

type OwnershipResponse = {
  items?: OwnedHoodie[];
  count?: number;
  indexedTotal?: number | null;
  pagesRead?: number;
  error?: string;
};

type HoodWalletStatus = "counterfactual" | "active" | "unknown";

type HoodWalletAsset = {
  symbol: string;
  name: string;
  balanceRaw: bigint;
  balanceFormatted: string;
  contract?: string;
  decimals: number;
  kind: "native" | "erc20";
  trusted: boolean;
};

type HoodWalletNft = {
  contract: string;
  tokenId: string;
  name: string;
  collectionName: string;
  symbol?: string;
  image?: string;
  balance: string;
  kind: "erc721" | "erc1155";
  trusted: boolean;
  spam: boolean;
  spamClassifications: string[];
};

type HoodWalletRecord = {
  tokenId: string;
  hoodieName: string;
  artwork: string;
  walletAddress: string;
  status: HoodWalletStatus;
  nativeBalance: bigint;
  assets: HoodWalletAsset[];
  nfts: HoodWalletNft[];
};

type HoodWalletAssetApiItem = {
  symbol: string;
  name: string;
  balanceRaw: string;
  balanceFormatted: string;
  contract?: string;
  decimals: number;
  kind: "erc20";
  trusted?: boolean;
};

type HoodWalletNftApiItem = {
  contract: string;
  tokenId: string;
  name: string;
  collectionName: string;
  symbol?: string;
  image?: string;
  balance: string;
  kind: "erc721" | "erc1155";
  trusted?: boolean;
  spam?: boolean;
  spamClassifications?: string[];
};

type HoodWalletAssetApiResponse = {
  assets?: HoodWalletAssetApiItem[];
  nfts?: HoodWalletNftApiItem[];
  warning?: string;
  error?: string;
};

type HoodOSReadContract = {
  walletOf: (tokenId: bigint) => Promise<string>;
};

/*//////////////////////////////////////////////////////////////
                             CONSTANTS
//////////////////////////////////////////////////////////////*/

const HOOD_OS_ABI = [
  "function walletOf(uint256 tokenId) view returns (address)",
];

const NATIVE_SYMBOL = "ETH";
const NATIVE_NAME = "Native Balance";

/*//////////////////////////////////////////////////////////////
                              HELPERS
//////////////////////////////////////////////////////////////*/

function passthroughImageLoader({ src }: { src: string }) {
  return src;
}

function normalizeOwnedHoodies(items: OwnedHoodie[]) {
  return Array.from(
    new Map(items.map((item) => [String(item.tokenId), item])).values(),
  ).sort((left, right) => {
    const leftId = BigInt(left.tokenId);
    const rightId = BigInt(right.tokenId);

    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

function tokenArtworkFallback(tokenId: string | number) {
  if (apiConfig.isMainnet) {
    return collectionApiUrl(
      `/images/${encodeURIComponent(String(tokenId))}.svg`,
    );
  }

  return `/api/hoodies/image?tokenId=${encodeURIComponent(String(tokenId))}`;
}

function ownedArtworkUrl(hoodie: OwnedHoodie) {
  return tokenArtworkFallback(hoodie.tokenId);
}

function shortAddress(address: string) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function explorerAddressUrl(address: string) {
  return `${siteConfig.explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

function explorerTokenUrl(contract: string) {
  return `${siteConfig.explorerUrl.replace(/\/$/, "")}/token/${contract}`;
}

function nftProxyImageUrl(image?: string) {
  if (!image) return "";

  return `/api/hoodwallet/nft-image?url=${encodeURIComponent(image)}`;
}

function formatTokenBalance(
  value: bigint,
  decimals = 18,
  maximumDecimals = 6,
) {
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");

  if (!fraction) return whole;

  const trimmed = fraction
    .slice(0, maximumDecimals)
    .replace(/0+$/, "");

  return trimmed ? `${whole}.${trimmed}` : whole;
}

function statusLabel(status: HoodWalletStatus) {
  if (status === "active") return "Active";
  if (status === "counterfactual") return "Counterfactual";
  return "Unknown";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadCanvasImage(source: string) {
  const response = await fetch(source, {
    headers: {
      accept: "image/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load image (${response.status}).`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new window.Image();
    image.decoding = "sync";

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to render image."));
      image.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchWalletInventory(
  walletAddress: string,
): Promise<{
  assets: HoodWalletAsset[];
  nfts: HoodWalletNft[];
}> {
  const params = new URLSearchParams({
    address: walletAddress,
  });

  const url = `/api/hoodwallet/assets?${params.toString()}`;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      const payload = (await response.json()) as HoodWalletAssetApiResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ||
            `Unable to load HoodWallet inventory (${response.status}).`,
        );
      }

      const assets = (Array.isArray(payload.assets) ? payload.assets : [])
        .map((asset): HoodWalletAsset | null => {
          let balanceRaw: bigint;

          try {
            balanceRaw = BigInt(asset.balanceRaw);
          } catch {
            return null;
          }

          if (balanceRaw <= BigInt(0)) return null;

          return {
            symbol: asset.symbol,
            name: asset.name,
            balanceRaw,
            balanceFormatted: asset.balanceFormatted,
            contract: asset.contract,
            decimals: asset.decimals,
            kind: "erc20",
            trusted: asset.trusted === true,
          };
        })
        .filter((asset): asset is HoodWalletAsset => asset !== null)
        .sort((left, right) => {
          if (left.trusted !== right.trusted) {
            return left.trusted ? -1 : 1;
          }

          return left.symbol.localeCompare(right.symbol);
        });

      const nfts = (Array.isArray(payload.nfts) ? payload.nfts : [])
        .filter(
          (nft) =>
            !!nft.contract &&
            !!nft.tokenId &&
            (nft.kind === "erc721" || nft.kind === "erc1155"),
        )
        .map(
          (nft): HoodWalletNft => ({
            contract: nft.contract,
            tokenId: nft.tokenId,
            name: nft.name || `NFT #${nft.tokenId}`,
            collectionName: nft.collectionName || "NFT Collection",
            symbol: nft.symbol,
            image: nft.image,
            balance: nft.balance || "1",
            kind: nft.kind,
            trusted: nft.trusted === true,
            spam: nft.spam === true,
            spamClassifications: Array.isArray(nft.spamClassifications)
              ? nft.spamClassifications
              : [],
          }),
        );

      if (payload.warning) {
        console.warn(
          `HoodWallet inventory warning for ${walletAddress}: ${payload.warning}`,
        );
      }

      return { assets, nfts };
    } catch (inventoryError) {
      if (attempt === MAX_ATTEMPTS) {
        console.warn(
          `Inventory unavailable for ${walletAddress} after ${MAX_ATTEMPTS} attempts.`,
          inventoryError,
        );

        return {
          assets: [],
          nfts: [],
        };
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 250 * attempt);
      });
    }
  }

  return {
    assets: [],
    nfts: [],
  };
}

/*//////////////////////////////////////////////////////////////
                         PNG EXPORT
//////////////////////////////////////////////////////////////*/

async function downloadHoodWalletPng(
  hoodie: OwnedHoodie,
  wallet: HoodWalletRecord,
  darkHood: boolean,
) {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const width = 2400;
  const height = 1200;
  const sidebarWidth = 660;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  const background = darkHood ? "#000000" : "#ccff00";
  const foreground = darkHood ? "#ccff00" : "#000000";
  const opposite = darkHood ? "#000000" : "#ccff00";

  context.imageSmoothingEnabled = false;
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = foreground;
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(sidebarWidth, 0);
  context.lineTo(sidebarWidth, height);
  context.stroke();

  /* Smaller Hoodie avatar */
  const avatarSize = 520;
  const avatarX = Math.round((sidebarWidth - avatarSize) / 2);
  const avatarY = 58;

  context.fillStyle = "#ccff00";
  context.fillRect(avatarX, avatarY, avatarSize, avatarSize);

  try {
    const artwork = await loadCanvasImage(ownedArtworkUrl(hoodie));
    context.drawImage(artwork, avatarX, avatarY, avatarSize, avatarSize);
  } catch (artworkError) {
    console.warn("Unable to draw Hoodie artwork in export.", artworkError);
    context.fillStyle = foreground;
    context.font = "22px DepartureMono, monospace";
    context.textAlign = "center";
    context.fillText(
      "ARTWORK UNAVAILABLE",
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
    );
  }

  context.fillStyle = foreground;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = "22px DepartureMono, monospace";
  context.fillText("ONCHAINHOODIE", 56, 660);

  context.font = "68px DepartureMono, monospace";
  context.fillText(`#${wallet.tokenId}`, 56, 744);

  context.globalAlpha = 0.62;
  context.font = "20px DepartureMono, monospace";
  context.fillText("HOODWALLET", 56, 810);
  context.globalAlpha = 1;

  context.font = "24px DepartureMono, monospace";
  context.fillText(shortAddress(wallet.walletAddress), 56, 854);

  context.font = "20px DepartureMono, monospace";
  context.fillText(statusLabel(wallet.status).toUpperCase(), 56, 908);

  context.globalAlpha = 0.6;
  context.font = "18px DepartureMono, monospace";
  context.fillText("TRUSTED INVENTORY ONLY", 56, 1010);
  context.globalAlpha = 1;

  context.font = "18px DepartureMono, monospace";
  context.fillText(BRAND_URL.toLowerCase(), 56, height - 58);

  /* Main inventory area */
  const left = sidebarWidth + 70;
  const right = width - 70;

  context.fillStyle = foreground;
  context.textAlign = "left";
  context.font = "25px DepartureMono, monospace";
  context.fillText("HOODWALLET INVENTORY", left, 82);

  context.globalAlpha = 0.6;
  context.font = "18px DepartureMono, monospace";
  context.fillText("DETERMINISTIC ADDRESS", left, 132);
  context.globalAlpha = 1;
  context.font = "21px DepartureMono, monospace";
  context.fillText(wallet.walletAddress, left, 170);

  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(left, 210);
  context.lineTo(right, 210);
  context.stroke();

  const trustedAssets = wallet.assets.filter((asset) => asset.trusted);
  const trustedNfts = wallet.nfts.filter((nft) => nft.trusted);

  context.font = "22px DepartureMono, monospace";
  context.fillText("ASSETS", left, 260);

  const visibleAssets = trustedAssets.slice(0, 4);
  let assetY = 310;

  if (visibleAssets.length === 0) {
    context.globalAlpha = 0.55;
    context.font = "18px DepartureMono, monospace";
    context.fillText("NO TRUSTED TOKEN BALANCES", left, assetY + 20);
    context.globalAlpha = 1;
    assetY += 70;
  } else {
    for (const asset of visibleAssets) {
      context.globalAlpha = 0.58;
      context.font = "17px DepartureMono, monospace";
      context.fillText(asset.name.toUpperCase(), left, assetY);
      context.globalAlpha = 1;

      context.font = "27px DepartureMono, monospace";
      context.fillText(asset.symbol.toUpperCase(), left, assetY + 38);

      context.textAlign = "right";
      context.font = "31px DepartureMono, monospace";
      context.fillText(asset.balanceFormatted, right, assetY + 38);
      context.textAlign = "left";

      assetY += 78;
    }
  }

  if (trustedAssets.length > visibleAssets.length) {
    context.globalAlpha = 0.6;
    context.font = "16px DepartureMono, monospace";
    context.fillText(
      `+${trustedAssets.length - visibleAssets.length} MORE TOKEN ASSET${
        trustedAssets.length - visibleAssets.length === 1 ? "" : "S"
      }`,
      left,
      assetY,
    );
    context.globalAlpha = 1;
    assetY += 38;
  }

  const inventoryTop = Math.max(600, assetY + 35);

  context.beginPath();
  context.moveTo(left, inventoryTop - 35);
  context.lineTo(right, inventoryTop - 35);
  context.stroke();

  context.font = "22px DepartureMono, monospace";
  context.fillText("NFT INVENTORY", left, inventoryTop);

  context.textAlign = "right";
  context.globalAlpha = 0.6;
  context.font = "17px DepartureMono, monospace";
  context.fillText(
    `${trustedNfts.length} ITEM${trustedNfts.length === 1 ? "" : "S"}`,
    right,
    inventoryTop,
  );
  context.globalAlpha = 1;
  context.textAlign = "left";

  if (trustedNfts.length === 0) {
    context.globalAlpha = 0.55;
    context.font = "18px DepartureMono, monospace";
    context.fillText(
      "NO TRUSTED NFTS IN THIS HOODWALLET",
      left,
      inventoryTop + 70,
    );
    context.globalAlpha = 1;
  } else {
    const visibleNfts = trustedNfts.slice(0, 6);
    const gap = 20;
    const tileWidth = Math.floor(
      (right - left - gap * Math.max(0, visibleNfts.length - 1)) /
        Math.max(1, visibleNfts.length),
    );
    const imageSize = Math.min(tileWidth, 230);
    const tileY = inventoryTop + 42;

    for (let index = 0; index < visibleNfts.length; index += 1) {
      const nft = visibleNfts[index];
      const x = left + index * (tileWidth + gap);

      context.strokeStyle = foreground;
      context.lineWidth = 2;
      context.strokeRect(x, tileY, imageSize, imageSize);

      if (nft.image) {
       if (nft.image) {
  try {
    const nftImage = await loadCanvasImage(
      nftProxyImageUrl(nft.image),
    );

    context.drawImage(
      nftImage,
      x,
      tileY,
      imageSize,
      imageSize,
    );
        } catch (nftImageError) {
          console.warn(
            `Unable to draw NFT ${nft.contract}:${nft.tokenId}.`,
            nftImageError,
          );

          context.fillStyle = foreground;
          context.font = "14px DepartureMono, monospace";
          context.textAlign = "center";
          context.fillText(
            "NFT",
            x + imageSize / 2,
            tileY + imageSize / 2,
          );
          context.textAlign = "left";
        }
      } else {
        context.fillStyle = foreground;
        context.font = "14px DepartureMono, monospace";
        context.textAlign = "center";
        context.fillText(
          "NFT",
          x + imageSize / 2,
          tileY + imageSize / 2,
        );
        context.textAlign = "left";
      }

      context.fillStyle = foreground;
      context.globalAlpha = 0.62;
      context.font = "13px DepartureMono, monospace";
      context.fillText(
        nft.collectionName.toUpperCase().slice(0, 20),
        x,
        tileY + imageSize + 28,
      );
      context.globalAlpha = 1;
      context.font = "17px DepartureMono, monospace";
      context.fillText(
        `#${nft.tokenId}`.slice(0, 22),
        x,
        tileY + imageSize + 55,
      );
    }

    if (trustedNfts.length > visibleNfts.length) {
      context.globalAlpha = 0.62;
      context.font = "16px DepartureMono, monospace";
      context.textAlign = "right";
      context.fillText(
        `+${trustedNfts.length - visibleNfts.length} MORE NFT${
          trustedNfts.length - visibleNfts.length === 1 ? "" : "S"
        }`,
        right,
        height - 58,
      );
      context.globalAlpha = 1;
      context.textAlign = "left";
    }
  }

  /* Small trust mark */
  context.fillStyle = foreground;
  context.fillRect(right - 208, 50, 208, 42);
  context.fillStyle = opposite;
  context.font = "15px DepartureMono, monospace";
  context.textAlign = "center";
  context.fillText("TRUSTED VIEW", right - 104, 78);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Unable to create HoodWallet PNG."));
    }, "image/png");
  });

  const filename = `onchainhoodies-${wallet.tokenId}-hoodwallet${
    darkHood ? "-dark" : ""
  }.png`;

  downloadBlob(blob, filename);
}

/*//////////////////////////////////////////////////////////////
                             ARTWORK
//////////////////////////////////////////////////////////////*/

function HoodieArtwork({ hoodie }: { hoodie: OwnedHoodie }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-4 text-center text-[9px] uppercase tracking-[0.14em] text-[#ccff00]">
        Artwork unavailable
      </div>
    );
  }

  return (
    <Image
      loader={passthroughImageLoader}
      unoptimized
      src={ownedArtworkUrl(hoodie)}
      alt={hoodie.name || `OnChainHoodies #${hoodie.tokenId}`}
      width={768}
      height={768}
      sizes="(max-width: 768px) 100vw, 320px"
      onError={() => setFailed(true)}
      className="image-render-pixel h-full w-full object-cover"
    />
  );
}

function NftArtwork({ nft }: { nft: HoodWalletNft }) {
  const [failed, setFailed] = useState(false);

  if (!nft.image || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--hood-fg)] p-3 text-center text-[8px] uppercase tracking-[0.12em] text-[var(--hood-bg)]">
        NFT
      </div>
    );
  }

  return (
    // A normal img is intentional here: NFT image hosts are dynamic and should
    // not require every remote host to be added to next.config remotePatterns.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={nft.image}
      alt={nft.name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

/*//////////////////////////////////////////////////////////////
                         LOADING COMPONENT
//////////////////////////////////////////////////////////////*/

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center border border-[var(--hood-fg)] p-6 text-center">
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-65">
        {label}
      </p>
    </div>
  );
}

/*//////////////////////////////////////////////////////////////
                           ASSET ROW
//////////////////////////////////////////////////////////////*/

function AssetRow({ asset }: { asset: HoodWalletAsset }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-[var(--hood-fg)] px-4 py-4 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[9px] uppercase tracking-[0.15em] opacity-60">
            {asset.name}
          </p>

          {!asset.trusted && asset.kind === "erc20" && (
            <span className="border border-[var(--hood-fg)] px-1.5 py-0.5 text-[7px] uppercase tracking-[0.12em]">
              Unverified
            </span>
          )}
        </div>

        <p className="mt-1 text-sm uppercase tracking-[0.08em]">
          {asset.symbol}
        </p>

        {asset.contract && !asset.trusted && (
          <a
            href={explorerTokenUrl(asset.contract)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-[7px] uppercase tracking-[0.1em] opacity-55 underline underline-offset-2"
          >
            {shortAddress(asset.contract)} ↗
          </a>
        )}
      </div>

      <p className="text-right text-xl leading-none tracking-[-0.04em] md:text-2xl">
        {asset.balanceFormatted}
      </p>
    </div>
  );
}

/*//////////////////////////////////////////////////////////////
                           NFT CARD
//////////////////////////////////////////////////////////////*/

function NftCard({ nft }: { nft: HoodWalletNft }) {
  return (
    <article className="min-w-0 border border-[var(--hood-fg)]">
      <div className="aspect-square overflow-hidden bg-[var(--hood-fg)]">
        <NftArtwork nft={nft} />
      </div>

      <div className="border-t border-[var(--hood-fg)] p-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[8px] uppercase tracking-[0.12em] opacity-60">
            {nft.collectionName}
          </p>

          {!nft.trusted && (
            <span className="shrink-0 border border-[var(--hood-fg)] px-1 py-0.5 text-[6px] uppercase tracking-[0.1em]">
              {nft.spam ? "Spam" : "Unverified"}
            </span>
          )}
        </div>

        <p className="mt-2 truncate text-[11px] uppercase tracking-[0.05em]">
          {nft.name || `#${nft.tokenId}`}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2 text-[7px] uppercase tracking-[0.1em] opacity-60">
          <span>#{nft.tokenId}</span>
          {nft.kind === "erc1155" && <span>× {nft.balance}</span>}
        </div>

        {!nft.trusted && (
          <a
            href={explorerTokenUrl(nft.contract)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block truncate text-[7px] uppercase tracking-[0.1em] opacity-55 underline underline-offset-2"
          >
            {shortAddress(nft.contract)} ↗
          </a>
        )}
      </div>
    </article>
  );
}

/*//////////////////////////////////////////////////////////////
                        HOODWALLET CARD
//////////////////////////////////////////////////////////////*/

function HoodWalletCard({
  hoodie,
  wallet,
  darkHood,
  trustedOnly,
}: {
  hoodie: OwnedHoodie;
  wallet: HoodWalletRecord;
  darkHood: boolean;
  trustedOnly: boolean;
}) {
  const statusIsActive = wallet.status === "active";
  const [downloading, setDownloading] = useState(false);

  const visibleAssets = useMemo(
    () =>
      wallet.assets.filter(
        (asset) => asset.kind === "native" || !trustedOnly || asset.trusted,
      ),
    [trustedOnly, wallet.assets],
  );

  const visibleNfts = useMemo(
    () => wallet.nfts.filter((nft) => !trustedOnly || nft.trusted),
    [trustedOnly, wallet.nfts],
  );

  const hiddenAssetCount =
    wallet.assets.filter(
      (asset) => asset.kind === "erc20" && !asset.trusted,
    ).length + wallet.nfts.filter((nft) => !nft.trusted).length;

  const downloadCard = useCallback(async () => {
    if (downloading) return;

    setDownloading(true);

    try {
      await downloadHoodWalletPng(hoodie, wallet, darkHood);
    } catch (downloadError) {
      console.error(downloadError);
      window.alert(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download HoodWallet PNG.",
      );
    } finally {
      setDownloading(false);
    }
  }, [darkHood, downloading, hoodie, wallet]);

  return (
    <article className="border border-[var(--hood-fg)]">
      <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Smaller Hoodie avatar */}
        <div className="border-b border-[var(--hood-fg)] bg-[#ccff00] lg:border-b-0 lg:border-r">
          <div className="aspect-square overflow-hidden">
            <HoodieArtwork hoodie={hoodie} />
          </div>

          <div className="border-t border-black bg-[#ccff00] px-4 py-3 text-black">
            <p className="text-[8px] uppercase tracking-[0.15em] opacity-60">
              OnChainHoodie
            </p>

            <p className="mt-1 text-xl leading-none tracking-[-0.04em]">
              #{wallet.tokenId}
            </p>
          </div>
        </div>

        {/* Wallet + inventory */}
        <div className="min-w-0">
          <div className="border-b border-[var(--hood-fg)] p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[8px] uppercase tracking-[0.18em] opacity-60">
                  HoodWallet
                </p>

                <h2 className="mt-3 break-all text-2xl leading-none tracking-[-0.04em] md:text-3xl">
                  {shortAddress(wallet.walletAddress)}
                </h2>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void downloadCard()}
                  disabled={downloading}
                  className="border border-[var(--hood-fg)] px-3 py-2 text-[8px] uppercase tracking-[0.15em] disabled:opacity-40"
                >
                  {downloading ? "Creating PNG" : "Download PNG"}
                </button>

                <span
                  className={`border border-[var(--hood-fg)] px-3 py-2 text-[8px] uppercase tracking-[0.15em] ${
                    statusIsActive
                      ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                      : ""
                  }`}
                >
                  {statusLabel(wallet.status)}
                </span>
              </div>
            </div>

            <div className="mt-5 border border-[var(--hood-fg)]">
              <div className="border-b border-[var(--hood-fg)] px-3 py-2">
                <p className="text-[8px] uppercase tracking-[0.15em] opacity-60">
                  Deterministic address
                </p>
              </div>

              <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="break-all text-[10px] leading-relaxed">
                  {wallet.walletAddress}
                </code>

                <a
                  href={explorerAddressUrl(wallet.walletAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[9px] uppercase tracking-[0.14em] underline underline-offset-4"
                >
                  Explorer ↗
                </a>
              </div>
            </div>

            {wallet.status === "counterfactual" && (
              <p className="mt-4 text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-65">
                This HoodWallet already has a permanent address. Its account
                contract has not been deployed yet.
              </p>
            )}

            {wallet.status === "active" && (
              <p className="mt-4 text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-65">
                The ERC-6551 account is deployed at this address.
              </p>
            )}

            {trustedOnly && hiddenAssetCount > 0 && (
              <p className="mt-4 text-[8px] uppercase leading-relaxed tracking-[0.11em] opacity-55">
                {hiddenAssetCount} unverified asset
                {hiddenAssetCount === 1 ? "" : "s"} hidden by Trusted View.
              </p>
            )}
          </div>

          {/* Fungible assets */}
          <div>
            <div className="flex items-center justify-between border-b border-[var(--hood-fg)] px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.16em]">Assets</p>

              <p className="text-[8px] uppercase tracking-[0.13em] opacity-60">
                On-chain balance
              </p>
            </div>

            {visibleAssets.length > 0 ? (
              visibleAssets.map((asset) => (
                <AssetRow
                  key={`${wallet.tokenId}-${asset.contract || asset.symbol}-${asset.kind}`}
                  asset={asset}
                />
              ))
            ) : (
              <div className="px-4 py-5 text-[9px] uppercase tracking-[0.14em] opacity-55">
                No visible token balances.
              </div>
            )}
          </div>

          {/* NFT inventory */}
          <div className="border-t border-[var(--hood-fg)]">
            <div className="flex items-center justify-between border-b border-[var(--hood-fg)] px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.16em]">
                NFT Inventory
              </p>

              <p className="text-[8px] uppercase tracking-[0.13em] opacity-60">
                {visibleNfts.length} item{visibleNfts.length === 1 ? "" : "s"}
              </p>
            </div>

            {visibleNfts.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                {visibleNfts.map((nft) => (
                  <NftCard
                    key={`${wallet.tokenId}-${nft.contract}-${nft.tokenId}-${nft.kind}`}
                    nft={nft}
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-[9px] uppercase tracking-[0.14em] opacity-55">
                No visible NFTs in this HoodWallet.
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/*//////////////////////////////////////////////////////////////
                              PAGE
//////////////////////////////////////////////////////////////*/

export default function HoodWalletPage() {
  const { address, connect } = useWallet();

  const [ownedHoodies, setOwnedHoodies] = useState<OwnedHoodie[]>([]);
  const [hoodWallets, setHoodWallets] = useState<HoodWalletRecord[]>([]);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [ownershipChecked, setOwnershipChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [darkHood, setDarkHood] = useState(false);

  /* Trusted View is deliberately the default. */
  const [trustedOnly, setTrustedOnly] = useState(true);

  const isHolder = ownedHoodies.length > 0;

  /*//////////////////////////////////////////////////////////////
                           PROVIDER
  //////////////////////////////////////////////////////////////*/

  const provider = useMemo(() => {
    if (!siteConfig.rpcUrl) return null;

    return new JsonRpcProvider(
      siteConfig.rpcUrl,
      Number(siteConfig.chainId),
      {
        staticNetwork: true,
      },
    );
  }, []);

  /*//////////////////////////////////////////////////////////////
                      LOAD OWNED HOODIES
  //////////////////////////////////////////////////////////////*/

  const loadOwnership = useCallback(async () => {
    if (!address) {
      setOwnedHoodies([]);
      setHoodWallets([]);
      setOwnershipChecked(false);
      setError(null);
      return;
    }

    setOwnershipLoading(true);
    setOwnershipChecked(false);
    setError(null);

    try {
      const params = new URLSearchParams({
        owner: address,
      });

      const response = await fetch(`/api/hoodies?${params.toString()}`, {
        cache: "no-store",
      });

      const data = (await response.json()) as OwnershipResponse;

      if (!response.ok) {
        throw new Error(data.error || "Unable to read Hoodie ownership.");
      }

      const unique = normalizeOwnedHoodies(data.items || []);
      setOwnedHoodies(unique);
    } catch (loadError) {
      setOwnedHoodies([]);
      setHoodWallets([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to read Hoodie ownership.",
      );
    } finally {
      setOwnershipLoading(false);
      setOwnershipChecked(true);
    }
  }, [address]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOwnership();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadOwnership, refreshKey]);

  /*//////////////////////////////////////////////////////////////
                    LOAD HOODWALLET DATA
  //////////////////////////////////////////////////////////////*/

  useEffect(() => {
    let cancelled = false;

    async function loadHoodWallets() {
      if (!address || !provider || ownedHoodies.length === 0) {
        setHoodWallets([]);
        return;
      }

      if (!siteConfig.hoodOSAddress) {
        setError("HoodOS address is not configured.");
        return;
      }

      setWalletLoading(true);
      setError(null);

      try {
        const hoodOS = new Contract(
          siteConfig.hoodOSAddress,
          HOOD_OS_ABI,
          provider,
        ) as unknown as HoodOSReadContract;

        const results: HoodWalletRecord[] = [];
        const concurrency = 4;

        for (
          let index = 0;
          index < ownedHoodies.length;
          index += concurrency
        ) {
          const batch = ownedHoodies.slice(index, index + concurrency);

          const batchResults = await Promise.all(
            batch.map(async (hoodie) => {
              const tokenId = BigInt(hoodie.tokenId);
              const walletAddress = await hoodOS.walletOf(tokenId);

              const [code, nativeBalance, inventory] = await Promise.all([
                provider.getCode(walletAddress),
                provider.getBalance(walletAddress),
                fetchWalletInventory(walletAddress).catch(
                  (inventoryError) => {
                    console.error(
                      `Unable to load inventory for ${walletAddress}:`,
                      inventoryError,
                    );

                    return {
                      assets: [],
                      nfts: [],
                    };
                  },
                ),
              ]);

              const status: HoodWalletStatus =
                code === "0x" ? "counterfactual" : "active";

              const assets: HoodWalletAsset[] = [
                ...inventory.assets,
                {
                  symbol: NATIVE_SYMBOL,
                  name: NATIVE_NAME,
                  balanceRaw: nativeBalance,
                  balanceFormatted: formatTokenBalance(
                    nativeBalance,
                    18,
                    6,
                  ),
                  decimals: 18,
                  kind: "native",
                  trusted: true,
                },
              ];

              return {
                tokenId: hoodie.tokenId,
                hoodieName: hoodie.name,
                artwork: ownedArtworkUrl(hoodie),
                walletAddress,
                status,
                nativeBalance,
                assets,
                nfts: inventory.nfts,
              } satisfies HoodWalletRecord;
            }),
          );

          results.push(...batchResults);
        }

        if (!cancelled) {
          setHoodWallets(results);
        }
      } catch (loadError) {
        console.error(loadError);

        if (!cancelled) {
          setHoodWallets([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load HoodWallet balances.",
          );
        }
      } finally {
        if (!cancelled) {
          setWalletLoading(false);
        }
      }
    }

    void loadHoodWallets();

    return () => {
      cancelled = true;
    };
  }, [address, ownedHoodies, provider, refreshKey]);

  /*//////////////////////////////////////////////////////////////
                         PORTFOLIO TOTALS
  //////////////////////////////////////////////////////////////*/

  const portfolioTokenTotals = useMemo(() => {
    const totals = new Map<
      string,
      {
        symbol: string;
        name: string;
        contract?: string;
        decimals: number;
        balanceRaw: bigint;
        trusted: boolean;
      }
    >();

    for (const wallet of hoodWallets) {
      for (const asset of wallet.assets) {
        if (asset.kind !== "erc20") continue;
        if (trustedOnly && !asset.trusted) continue;

        const key =
          asset.contract?.toLowerCase() || `${asset.symbol}:${asset.name}`;

        const current = totals.get(key);

        totals.set(key, {
          symbol: asset.symbol,
          name: asset.name,
          contract: asset.contract,
          decimals: asset.decimals,
          balanceRaw: (current?.balanceRaw ?? BigInt(0)) + asset.balanceRaw,
          trusted: asset.trusted,
        });
      }
    }

    return Array.from(totals.values()).sort((left, right) => {
      if (left.trusted !== right.trusted) {
        return left.trusted ? -1 : 1;
      }

      return left.symbol.localeCompare(right.symbol);
    });
  }, [hoodWallets, trustedOnly]);

  const totalNative = useMemo(() => {
    return hoodWallets.reduce(
      (total, wallet) => total + wallet.nativeBalance,
      BigInt(0),
    );
  }, [hoodWallets]);

  const activeWalletCount = useMemo(() => {
    return hoodWallets.filter((wallet) => wallet.status === "active").length;
  }, [hoodWallets]);

  const visibleNftCount = useMemo(() => {
    return hoodWallets.reduce(
      (total, wallet) =>
        total +
        wallet.nfts.filter((nft) => !trustedOnly || nft.trusted).length,
      0,
    );
  }, [hoodWallets, trustedOnly]);

  const hiddenUnverifiedCount = useMemo(() => {
    return hoodWallets.reduce((total, wallet) => {
      const untrustedTokens = wallet.assets.filter(
        (asset) => asset.kind === "erc20" && !asset.trusted,
      ).length;

      const untrustedNfts = wallet.nfts.filter((nft) => !nft.trusted).length;

      return total + untrustedTokens + untrustedNfts;
    }, 0);
  }, [hoodWallets]);

  /*//////////////////////////////////////////////////////////////
                              UI
  //////////////////////////////////////////////////////////////*/

  return (
    <main
      className="min-h-screen bg-[var(--hood-bg)] text-[var(--hood-fg)]"
      style={
        {
          "--hood-bg": darkHood ? "#000000" : "#ccff00",
          "--hood-fg": darkHood ? "#ccff00" : "#000000",
        } as CSSProperties
      }
    >
      <SiteHeader />

      <section className="mx-auto max-w-[1500px] px-4 pb-24 pt-20 md:px-6 md:pt-24">
        {/* Header */}
        <div className="section-heading-row border-[var(--hood-fg)]">
          <p>Build 04 / ERC-6551</p>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDarkHood((current) => !current)}
              className="uppercase"
            >
              {darkHood ? "Lights on" : "Lights off"}
            </button>

            <Link href="/">Back to the Hood</Link>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
            <p className="text-[9px] uppercase tracking-[0.18em]">
              Hoodie infrastructure
            </p>

            <h1 className="mt-3 text-5xl leading-[0.84] tracking-[-0.065em] md:text-6xl">
              HOOD
              <br />
              WALLET
            </h1>

            <p className="mt-5 max-w-md text-sm leading-relaxed opacity-75">
              Every Hoodie has its own deterministic on-chain wallet. Connect
              the wallet holding your Hoodies to inspect what each Hoodie owns.
            </p>

            {/* Connected wallet */}
            {address ? (
              <div className="mt-6 border border-[var(--hood-fg)]">
                <div className="border-b border-[var(--hood-fg)] px-3 py-2">
                  <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                    Connected owner
                  </p>
                </div>

                <div className="px-3 py-3">
                  <p className="break-all text-[10px] leading-relaxed">
                    {address}
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={connect}
                className="pixel-cta mt-6 w-full"
              >
                Connect wallet
              </button>
            )}

            {/* Asset safety switch */}
            {address && isHolder && !ownershipLoading && (
              <div className="mt-3 border border-[var(--hood-fg)]">
                <div className="border-b border-[var(--hood-fg)] px-3 py-2">
                  <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                    Asset view
                  </p>
                </div>

                <div className="grid grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setTrustedOnly(true)}
                    className={`border-r border-[var(--hood-fg)] px-3 py-3 text-[8px] uppercase tracking-[0.14em] ${
                      trustedOnly
                        ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                        : ""
                    }`}
                    aria-pressed={trustedOnly}
                  >
                    {trustedOnly ? "■" : "□"} Trusted
                  </button>

                  <button
                    type="button"
                    onClick={() => setTrustedOnly(false)}
                    className={`px-3 py-3 text-[8px] uppercase tracking-[0.14em] ${
                      !trustedOnly
                        ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                        : ""
                    }`}
                    aria-pressed={!trustedOnly}
                  >
                    {!trustedOnly ? "■" : "□"} All
                  </button>
                </div>

                <div className="border-t border-[var(--hood-fg)] px-3 py-3">
                  <p className="text-[8px] uppercase leading-relaxed tracking-[0.11em] opacity-65">
                    Trusted View only shows contracts approved by OnChainHoodies.
                  </p>
                </div>
              </div>
            )}

            {!trustedOnly && address && isHolder && (
              <div className="mt-2 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-3 text-[var(--hood-bg)]">
                <p className="text-[8px] uppercase tracking-[0.15em]">
                  Unverified mode
                </p>
                <p className="mt-2 text-[8px] uppercase leading-relaxed tracking-[0.1em] opacity-75">
                  Unknown tokens and NFTs can be spam. Do not interact with
                  contracts you do not recognize.
                </p>
              </div>
            )}

            {/* Holder summary */}
            {address && !ownershipLoading && isHolder && (
              <>
                <div className="mt-3 grid grid-cols-2 border border-[var(--hood-fg)]">
                  <div className="border-r border-[var(--hood-fg)] p-3">
                    <p className="text-[8px] uppercase tracking-[0.15em] opacity-60">
                      Hoodies
                    </p>

                    <p className="mt-2 text-3xl leading-none tracking-[-0.05em]">
                      {ownedHoodies.length}
                    </p>
                  </div>

                  <div className="p-3">
                    <p className="text-[8px] uppercase tracking-[0.15em] opacity-60">
                      Active wallets
                    </p>

                    <p className="mt-2 text-3xl leading-none tracking-[-0.05em]">
                      {activeWalletCount}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setRefreshKey((current) => current + 1)}
                  disabled={ownershipLoading || walletLoading}
                  className="mt-2 w-full border border-[var(--hood-fg)] px-3 py-3 text-[9px] uppercase tracking-[0.14em] disabled:opacity-40"
                >
                  {ownershipLoading || walletLoading
                    ? "Refreshing"
                    : "Refresh balances"}
                </button>
              </>
            )}

            {address && !ownershipLoading && isHolder && (
              <>
                <div className="mt-3 border border-[var(--hood-fg)] p-3">
                  <p className="text-[8px] uppercase tracking-[0.16em]">
                    {trustedOnly ? "Trusted inventory" : "All on-chain assets"}
                  </p>

                  <p className="mt-3 text-[9px] leading-relaxed opacity-70">
                    {trustedOnly
                      ? "Trusted View only displays ERC-20 and NFT contracts approved by OnChainHoodies. Native ETH is always visible."
                      : "All View exposes every token and NFT returned by the indexers. Unknown assets can be spam and are not endorsed by OnChainHoodies."}
                  </p>

                  {trustedOnly && hiddenUnverifiedCount > 0 && (
                    <p className="mt-3 text-[8px] uppercase leading-relaxed tracking-[0.11em] opacity-55">
                      {hiddenUnverifiedCount} unverified asset
                      {hiddenUnverifiedCount === 1 ? "" : "s"} currently hidden.
                    </p>
                  )}
                </div>

                <div className="mt-2 border border-[var(--hood-fg)] p-3">
                  <p className="text-[8px] uppercase tracking-[0.16em]">
                    Deterministic by design
                  </p>

                  <p className="mt-3 text-[9px] leading-relaxed opacity-70">
                    Assets can be sent to a HoodWallet before its ERC-6551
                    account is deployed. Activation deploys the account at the
                    address the Hoodie already owns.
                  </p>
                </div>
              </>
            )}

            {error && (
              <div className="mt-3 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-3 text-xs leading-relaxed text-[var(--hood-bg)]">
                {error}
              </div>
            )}
          </aside>

          {/* Main content */}
          <div className="min-w-0">
            {!address ? (
              <div className="grid min-h-[680px] place-items-center border border-[var(--hood-fg)] p-6 text-center">
                <div className="max-w-xl">
                  <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                    ERC-6551 wallet layer
                  </p>

                  <h2 className="mt-6 text-5xl leading-[0.88] tracking-[-0.065em] md:text-7xl">
                    YOUR HOODIES.
                    <br />
                    THEIR WALLETS.
                  </h2>

                  <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed opacity-75 md:text-base">
                    Connect your owner wallet to discover the deterministic
                    HoodWallet behind every Hoodie you own and inspect the
                    assets already waiting there.
                  </p>

                  <button
                    type="button"
                    onClick={connect}
                    className="pixel-cta mt-8"
                  >
                    Connect wallet
                  </button>
                </div>
              </div>
            ) : ownershipLoading ? (
              <LoadingBlock label="Reading Hoodie ownership" />
            ) : ownershipChecked && !isHolder ? (
              <div className="grid min-h-[680px] place-items-center border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-6 text-center text-[var(--hood-bg)]">
                <div className="max-w-xl">
                  <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                    HoodWallet
                  </p>

                  <h2 className="mt-6 text-5xl leading-[0.88] tracking-[-0.065em] md:text-7xl">
                    NO HOODIE.
                    <br />
                    NO HOODWALLET.
                  </h2>

                  <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed opacity-75">
                    This connected wallet does not currently hold an
                    OnChainHoodie.
                  </p>

                  <a
                    href={siteConfig.openSeaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pixel-cta mt-8 inline-block border-[#ccff00]"
                  >
                    View on OpenSea
                  </a>
                </div>
              </div>
            ) : walletLoading ? (
              <LoadingBlock label="Loading HoodWallet inventory" />
            ) : (
              <>
                {/* Portfolio summary */}
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="border border-[var(--hood-fg)] p-4">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                      HoodWallets
                    </p>
                    <p className="mt-4 text-4xl leading-none tracking-[-0.06em]">
                      {hoodWallets.length}
                    </p>
                  </div>

                  <div className="border border-[var(--hood-fg)] p-4">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                      NFT inventory
                    </p>
                    <p className="mt-4 text-4xl leading-none tracking-[-0.06em]">
                      {visibleNftCount}
                    </p>
                    <p className="mt-2 text-[8px] uppercase tracking-[0.13em] opacity-60">
                      {trustedOnly ? "Trusted" : "All visible"}
                    </p>
                  </div>

                  <div className="border border-[var(--hood-fg)] p-4">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                      Native across HoodWallets
                    </p>
                    <p className="mt-4 text-3xl leading-none tracking-[-0.05em]">
                      {formatTokenBalance(totalNative, 18, 6)}
                    </p>
                    <p className="mt-2 text-[8px] uppercase tracking-[0.13em] opacity-60">
                      {NATIVE_SYMBOL}
                    </p>
                  </div>

                  <div className="border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-4 text-[var(--hood-bg)]">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                      Wallet state
                    </p>
                    <p className="mt-4 text-3xl leading-none tracking-[-0.05em]">
                      {activeWalletCount} / {hoodWallets.length}
                    </p>
                    <p className="mt-2 text-[8px] uppercase tracking-[0.13em] opacity-60">
                      Active
                    </p>
                  </div>

                  {portfolioTokenTotals.map((token) => (
                    <div
                      key={token.contract || `${token.symbol}-${token.name}`}
                      className="border border-[var(--hood-fg)] p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[8px] uppercase tracking-[0.16em] opacity-60">
                          {token.name} across HoodWallets
                        </p>

                        {!token.trusted && (
                          <span className="shrink-0 border border-[var(--hood-fg)] px-1 py-0.5 text-[6px] uppercase tracking-[0.1em]">
                            Unverified
                          </span>
                        )}
                      </div>

                      <p className="mt-4 break-all text-3xl leading-none tracking-[-0.05em]">
                        {formatTokenBalance(
                          token.balanceRaw,
                          token.decimals,
                          6,
                        )}
                      </p>

                      <p className="mt-2 text-[8px] uppercase tracking-[0.13em] opacity-60">
                        {token.symbol}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Wallet list */}
                <div className="mt-4">
                  <div className="section-heading-row border-[var(--hood-fg)]">
                    <p>Your HoodWallets</p>
                    <p>
                      {hoodWallets.length} Hoodie
                      {hoodWallets.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-4">
                    {hoodWallets.map((wallet) => {
                      const hoodie = ownedHoodies.find(
                        (item) => item.tokenId === wallet.tokenId,
                      );

                      if (!hoodie) return null;

                      return (
                        <HoodWalletCard
                          key={wallet.tokenId}
                          hoodie={hoodie}
                          wallet={wallet}
                          darkHood={darkHood}
                          trustedOnly={trustedOnly}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}