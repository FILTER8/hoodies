"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";

import { siteConfig } from "../../lib/config";
import {
  apiConfig,
  collectionApiUrl,
} from "../../lib/api";

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

type HoodWalletStatus =
  | "counterfactual"
  | "active"
  | "unknown";

type HoodWalletAsset = {
  symbol: string;
  name: string;
  balanceRaw: bigint;
  balanceFormatted: string;
  contract?: string;
  kind: "native" | "erc20";
};

type HoodWalletRecord = {
  tokenId: string;
  hoodieName: string;
  artwork: string;

  walletAddress: string;
  status: HoodWalletStatus;

  nativeBalance: bigint;
  goatBalance: bigint;

  assets: HoodWalletAsset[];
};

type HoodOSReadContract = {
  walletOf: (
    tokenId: bigint,
  ) => Promise<string>;
};

/*//////////////////////////////////////////////////////////////
                             CONSTANTS
//////////////////////////////////////////////////////////////*/

const HOOD_OS_ABI = [
  "function walletOf(uint256 tokenId) view returns (address)",
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
];

/*
 * Native currency label.
 *
 * Change this later if Robinhood Chain exposes a finalized
 * public native-token brand/symbol you want to display instead.
 */
const NATIVE_SYMBOL = "ETH";
const NATIVE_NAME = "Native Balance";

/*//////////////////////////////////////////////////////////////
                              HELPERS
//////////////////////////////////////////////////////////////*/

function passthroughImageLoader({
  src,
}: {
  src: string;
}) {
  return src;
}

function normalizeOwnedHoodies(
  items: OwnedHoodie[],
) {
  return Array.from(
    new Map(
      items.map((item) => [
        String(item.tokenId),
        item,
      ]),
    ).values(),
  ).sort((left, right) => {
    const leftId =
      BigInt(left.tokenId);

    const rightId =
      BigInt(right.tokenId);

    return leftId < rightId
      ? -1
      : leftId > rightId
        ? 1
        : 0;
  });
}

function tokenArtworkFallback(
  tokenId: string | number,
) {
  if (apiConfig.isMainnet) {
    return collectionApiUrl(
      `/images/${encodeURIComponent(
        String(tokenId),
      )}.svg`,
    );
  }

  return `/api/hoodies/image?tokenId=${encodeURIComponent(
    String(tokenId),
  )}`;
}

function ownedArtworkUrl(
  hoodie: OwnedHoodie,
) {
  return tokenArtworkFallback(
    hoodie.tokenId,
  );
}

function shortAddress(
  address: string,
) {
  if (!address) {
    return "—";
  }

  return `${address.slice(
    0,
    6,
  )}...${address.slice(-4)}`;
}

function explorerAddressUrl(
  address: string,
) {
  return `${siteConfig.explorerUrl.replace(
    /\/$/,
    "",
  )}/address/${address}`;
}

function formatTokenBalance(
  value: bigint,
  decimals = 18,
  maximumDecimals = 6,
) {
  const formatted =
    formatUnits(
      value,
      decimals,
    );

  const [
    whole,
    fraction = "",
  ] = formatted.split(".");

  if (!fraction) {
    return whole;
  }

  const trimmed =
    fraction
      .slice(
        0,
        maximumDecimals,
      )
      .replace(
        /0+$/,
        "",
      );

  return trimmed
    ? `${whole}.${trimmed}`
    : whole;
}

function statusLabel(
  status: HoodWalletStatus,
) {
  if (
    status === "active"
  ) {
    return "Active";
  }

  if (
    status ===
    "counterfactual"
  ) {
    return "Counterfactual";
  }

  return "Unknown";
}

/*//////////////////////////////////////////////////////////////
                             ARTWORK
//////////////////////////////////////////////////////////////*/

function HoodieArtwork({
  hoodie,
}: {
  hoodie: OwnedHoodie;
}) {
  const [failed, setFailed] =
    useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-4 text-center text-[9px] uppercase tracking-[0.14em] text-[#ccff00]">
        Artwork unavailable
      </div>
    );
  }

  return (
    <Image
      loader={
        passthroughImageLoader
      }
      unoptimized
      src={ownedArtworkUrl(
        hoodie,
      )}
      alt={
        hoodie.name ||
        `OnChainHoodies #${hoodie.tokenId}`
      }
      width={768}
      height={768}
      sizes="(max-width: 768px) 100vw, 320px"
      onError={() =>
        setFailed(true)
      }
      className="image-render-pixel h-full w-full object-cover"
    />
  );
}

/*//////////////////////////////////////////////////////////////
                         LOADING COMPONENT
//////////////////////////////////////////////////////////////*/

function LoadingBlock({
  label,
}: {
  label: string;
}) {
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

function AssetRow({
  asset,
}: {
  asset: HoodWalletAsset;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-[var(--hood-fg)] px-4 py-4 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
          {asset.name}
        </p>

        <p className="mt-1 text-sm uppercase tracking-[0.08em]">
          {asset.symbol}
        </p>
      </div>

      <p className="text-right text-xl leading-none tracking-[-0.04em] md:text-2xl">
        {asset.balanceFormatted}
      </p>
    </div>
  );
}

/*//////////////////////////////////////////////////////////////
                        HOODWALLET CARD
//////////////////////////////////////////////////////////////*/

function HoodWalletCard({
  hoodie,
  wallet,
}: {
  hoodie: OwnedHoodie;
  wallet: HoodWalletRecord;
}) {
  const statusIsActive =
    wallet.status === "active";

  return (
    <article className="border border-[var(--hood-fg)]">
      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Artwork */}

        <div className="border-b border-[var(--hood-fg)] bg-[#ccff00] lg:border-b-0 lg:border-r">
          <div className="aspect-square overflow-hidden">
            <HoodieArtwork
              hoodie={hoodie}
            />
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

        {/* Wallet */}

        <div className="min-w-0">
          <div className="border-b border-[var(--hood-fg)] p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[8px] uppercase tracking-[0.18em] opacity-60">
                  HoodWallet
                </p>

                <h2 className="mt-3 break-all text-2xl leading-none tracking-[-0.04em] md:text-3xl">
                  {shortAddress(
                    wallet.walletAddress,
                  )}
                </h2>
              </div>

              <span
                className={`border border-[var(--hood-fg)] px-3 py-2 text-[8px] uppercase tracking-[0.15em] ${
                  statusIsActive
                    ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                    : ""
                }`}
              >
                {statusLabel(
                  wallet.status,
                )}
              </span>
            </div>

            <div className="mt-5 border border-[var(--hood-fg)]">
              <div className="border-b border-[var(--hood-fg)] px-3 py-2">
                <p className="text-[8px] uppercase tracking-[0.15em] opacity-60">
                  Deterministic address
                </p>
              </div>

              <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="break-all text-[10px] leading-relaxed">
                  {
                    wallet.walletAddress
                  }
                </code>

                <a
                  href={explorerAddressUrl(
                    wallet.walletAddress,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[9px] uppercase tracking-[0.14em] underline underline-offset-4"
                >
                  Explorer ↗
                </a>
              </div>
            </div>

            {wallet.status ===
              "counterfactual" && (
              <p className="mt-4 text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-65">
                This HoodWallet
                already has a
                permanent address.
                Its account contract
                has not been deployed
                yet.
              </p>
            )}

            {wallet.status ===
              "active" && (
              <p className="mt-4 text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-65">
                The ERC-6551 account
                is deployed at this
                address.
              </p>
            )}
          </div>

          {/* Asset balances */}

          <div>
            <div className="flex items-center justify-between border-b border-[var(--hood-fg)] px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.16em]">
                Assets
              </p>

              <p className="text-[8px] uppercase tracking-[0.13em] opacity-60">
                On-chain balance
              </p>
            </div>

            {wallet.assets.map(
              (asset) => (
                <AssetRow
                  key={`${wallet.tokenId}-${asset.symbol}-${asset.contract || "native"}`}
                  asset={asset}
                />
              ),
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
  const {
    address,
    connect,
  } = useWallet();

  const [
    ownedHoodies,
    setOwnedHoodies,
  ] = useState<
    OwnedHoodie[]
  >([]);

  const [
    hoodWallets,
    setHoodWallets,
  ] = useState<
    HoodWalletRecord[]
  >([]);

  const [
    ownershipLoading,
    setOwnershipLoading,
  ] = useState(false);

  const [
    walletLoading,
    setWalletLoading,
  ] = useState(false);

  const [
    ownershipChecked,
    setOwnershipChecked,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const isHolder =
    ownedHoodies.length > 0;

  /*//////////////////////////////////////////////////////////////
                           PROVIDER
  //////////////////////////////////////////////////////////////*/

  const provider =
    useMemo(() => {
      if (
        !siteConfig.rpcUrl
      ) {
        return null;
      }

      return new JsonRpcProvider(
        siteConfig.rpcUrl,
        Number(
          siteConfig.chainId,
        ),
        {
          staticNetwork: true,
        },
      );
    }, []);

  /*//////////////////////////////////////////////////////////////
                      LOAD OWNED HOODIES
  //////////////////////////////////////////////////////////////*/

  const loadOwnership =
    useCallback(async () => {
      if (!address) {
        setOwnedHoodies(
          [],
        );

        setHoodWallets(
          [],
        );

        setOwnershipChecked(
          false,
        );

        setError(null);

        return;
      }

      setOwnershipLoading(
        true,
      );

      setOwnershipChecked(
        false,
      );

      setError(null);

      try {
        const params =
          new URLSearchParams({
            owner:
              address,
          });

        const response =
          await fetch(
            `/api/hoodies?${params.toString()}`,
            {
              cache:
                "no-store",
            },
          );

        const data =
          (await response.json()) as OwnershipResponse;

        if (
          !response.ok
        ) {
          throw new Error(
            data.error ||
              "Unable to read Hoodie ownership.",
          );
        }

        const unique =
          normalizeOwnedHoodies(
            data.items ||
              [],
          );

        setOwnedHoodies(
          unique,
        );
      } catch (
        loadError
      ) {
        setOwnedHoodies(
          [],
        );

        setHoodWallets(
          [],
        );

        setError(
          loadError instanceof
            Error
            ? loadError.message
            : "Unable to read Hoodie ownership.",
        );
      } finally {
        setOwnershipLoading(
          false,
        );

        setOwnershipChecked(
          true,
        );
      }
    }, [address]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOwnership();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    loadOwnership,
    refreshKey,
  ]);

  /*//////////////////////////////////////////////////////////////
                    LOAD HOODWALLET DATA
  //////////////////////////////////////////////////////////////*/

  useEffect(() => {
    let cancelled =
      false;

    async function loadHoodWallets() {
      if (
        !address ||
        !provider ||
        ownedHoodies.length ===
          0
      ) {
        setHoodWallets(
          [],
        );

        return;
      }

      if (
        !siteConfig.hoodOSAddress
      ) {
        setError(
          "HoodOS address is not configured.",
        );

        return;
      }

      if (
        !siteConfig.goatAddress
      ) {
        setError(
          "GOAT token address is not configured.",
        );

        return;
      }

      setWalletLoading(
        true,
      );

      setError(null);

      try {
        const hoodOS =
          new Contract(
            siteConfig.hoodOSAddress,
            HOOD_OS_ABI,
            provider,
          ) as unknown as HoodOSReadContract;

        const goat =
          new Contract(
            siteConfig.goatAddress,
            ERC20_ABI,
            provider,
          );

        const [
          goatName,
          goatSymbol,
          goatDecimalsValue,
        ] =
          await Promise.all([
            goat.name() as Promise<string>,

            goat.symbol() as Promise<string>,

            goat.decimals() as Promise<bigint>,
          ]);

        const goatDecimals =
          Number(
            goatDecimalsValue,
          );

        /*
         * Process sequentially in small chunks.
         *
         * A collector will normally own far fewer
         * than 6,000 Hoodies, but this avoids creating
         * an uncontrolled number of RPC requests for
         * large wallets.
         */
        const results: HoodWalletRecord[] =
          [];

        const concurrency =
          10;

        for (
          let index = 0;
          index <
          ownedHoodies.length;
          index +=
            concurrency
        ) {
          const batch =
            ownedHoodies.slice(
              index,
              index +
                concurrency,
            );

          const batchResults =
            await Promise.all(
              batch.map(
                async (
                  hoodie,
                ) => {
                  const tokenId =
                    BigInt(
                      hoodie.tokenId,
                    );

                  /*
                   * Derive the deterministic
                   * HoodWallet from HoodOS.
                   */
                  const walletAddress =
                    await hoodOS.walletOf(
                      tokenId,
                    );

                  /*
                   * Load account deployment
                   * state + balances.
                   */
                  const [
                    code,
                    nativeBalance,
                    goatBalance,
                  ] =
                    await Promise.all([
                      provider.getCode(
                        walletAddress,
                      ),

                      provider.getBalance(
                        walletAddress,
                      ),

                      goat.balanceOf(
                        walletAddress,
                      ) as Promise<bigint>,
                    ]);

                  const status: HoodWalletStatus =
                    code ===
                    "0x"
                      ? "counterfactual"
                      : "active";

                  const assets: HoodWalletAsset[] =
                    [
                      {
                        symbol:
                          goatSymbol,

                        name:
                          goatName,

                        balanceRaw:
                          goatBalance,

                        balanceFormatted:
                          formatTokenBalance(
                            goatBalance,
                            goatDecimals,
                            6,
                          ),

                        contract:
                          siteConfig.goatAddress,

                        kind:
                          "erc20",
                      },

                      {
                        symbol:
                          NATIVE_SYMBOL,

                        name:
                          NATIVE_NAME,

                        balanceRaw:
                          nativeBalance,

                        balanceFormatted:
                          formatTokenBalance(
                            nativeBalance,
                            18,
                            6,
                          ),

                        kind:
                          "native",
                      },
                    ];

                  return {
                    tokenId:
                      hoodie.tokenId,

                    hoodieName:
                      hoodie.name,

                    artwork:
                      ownedArtworkUrl(
                        hoodie,
                      ),

                    walletAddress,

                    status,

                    nativeBalance,

                    goatBalance,

                    assets,
                  } satisfies HoodWalletRecord;
                },
              ),
            );

          results.push(
            ...batchResults,
          );
        }

        if (!cancelled) {
          setHoodWallets(
            results,
          );
        }
      } catch (
        loadError
      ) {
        console.error(
          loadError,
        );

        if (!cancelled) {
          setHoodWallets(
            [],
          );

          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Unable to load HoodWallet balances.",
          );
        }
      } finally {
        if (!cancelled) {
          setWalletLoading(
            false,
          );
        }
      }
    }

    void loadHoodWallets();

    return () => {
      cancelled = true;
    };
  }, [
    address,
    ownedHoodies,
    provider,
    refreshKey,
  ]);

  /*//////////////////////////////////////////////////////////////
                         PORTFOLIO TOTALS
  //////////////////////////////////////////////////////////////*/

  const totalGoat =
    useMemo(() => {
      return hoodWallets.reduce(
        (
          total,
          wallet,
        ) =>
          total +
          wallet.goatBalance,
        BigInt(0),
      );
    }, [hoodWallets]);

  const totalNative =
    useMemo(() => {
      return hoodWallets.reduce(
        (
          total,
          wallet,
        ) =>
          total +
          wallet.nativeBalance,
        BigInt(0),
      );
    }, [hoodWallets]);

  const activeWalletCount =
    useMemo(() => {
      return hoodWallets.filter(
        (wallet) =>
          wallet.status ===
          "active",
      ).length;
    }, [hoodWallets]);

  /*//////////////////////////////////////////////////////////////
                              UI
  //////////////////////////////////////////////////////////////*/

  return (
    <main
      className="min-h-screen bg-[var(--hood-bg)] text-[var(--hood-fg)]"
      style={
        {
          "--hood-bg":
            "#ccff00",

          "--hood-fg":
            "#000000",
        } as React.CSSProperties
      }
    >
      <SiteHeader />

      <section className="mx-auto max-w-[1500px] px-4 pb-24 pt-20 md:px-6 md:pt-24">
        {/* Header */}

        <div className="section-heading-row border-[var(--hood-fg)]">
          <p>
            Build 04 / ERC-6551
          </p>

          <Link href="/">
            Back to the Hood
          </Link>
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
              Every Hoodie has its
              own deterministic
              on-chain wallet.
              Connect the wallet
              holding your Hoodies
              to inspect what each
              Hoodie owns.
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
                onClick={
                  connect
                }
                className="pixel-cta mt-6 w-full"
              >
                Connect wallet
              </button>
            )}

            {/* Holder summary */}

            {address &&
              !ownershipLoading &&
              isHolder && (
                <>
                  <div className="mt-3 grid grid-cols-2 border border-[var(--hood-fg)]">
                    <div className="border-r border-[var(--hood-fg)] p-3">
                      <p className="text-[8px] uppercase tracking-[0.15em] opacity-60">
                        Hoodies
                      </p>

                      <p className="mt-2 text-3xl leading-none tracking-[-0.05em]">
                        {
                          ownedHoodies.length
                        }
                      </p>
                    </div>

                    <div className="p-3">
                      <p className="text-[8px] uppercase tracking-[0.15em] opacity-60">
                        Active wallets
                      </p>

                      <p className="mt-2 text-3xl leading-none tracking-[-0.05em]">
                        {
                          activeWalletCount
                        }
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setRefreshKey(
                        (
                          current,
                        ) =>
                          current +
                          1,
                      )
                    }
                    disabled={
                      ownershipLoading ||
                      walletLoading
                    }
                    className="mt-2 w-full border border-[var(--hood-fg)] px-3 py-3 text-[9px] uppercase tracking-[0.14em] disabled:opacity-40"
                  >
                    {ownershipLoading ||
                    walletLoading
                      ? "Refreshing"
                      : "Refresh balances"}
                  </button>
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
                    Connect your
                    owner wallet to
                    discover the
                    deterministic
                    HoodWallet behind
                    every Hoodie you
                    own and inspect
                    the assets already
                    waiting there.
                  </p>

                  <button
                    type="button"
                    onClick={
                      connect
                    }
                    className="pixel-cta mt-8"
                  >
                    Connect wallet
                  </button>
                </div>
              </div>
            ) : ownershipLoading ? (
              <LoadingBlock label="Reading Hoodie ownership" />
            ) : ownershipChecked &&
              !isHolder ? (
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
                    This connected
                    wallet does not
                    currently hold an
                    OnChainHoodie.
                  </p>

                  <a
                    href={
                      siteConfig.openSeaUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="pixel-cta mt-8 inline-block border-[#ccff00]"
                  >
                    View on OpenSea
                  </a>
                </div>
              </div>
            ) : walletLoading ? (
              <LoadingBlock label="Loading HoodWallet assets" />
            ) : (
              <>
                {/* Portfolio summary */}

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="border border-[var(--hood-fg)] p-4">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                      HoodWallets
                    </p>

                    <p className="mt-4 text-4xl leading-none tracking-[-0.06em]">
                      {
                        hoodWallets.length
                      }
                    </p>
                  </div>

                  <div className="border border-[var(--hood-fg)] p-4">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                      GOAT across HoodWallets
                    </p>

                    <p className="mt-4 text-3xl leading-none tracking-[-0.05em]">
                      {formatTokenBalance(
                        totalGoat,
                        18,
                        6,
                      )}
                    </p>

                    <p className="mt-2 text-[8px] uppercase tracking-[0.13em] opacity-60">
                      GOAT
                    </p>
                  </div>

                  <div className="border border-[var(--hood-fg)] p-4">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                      Native across HoodWallets
                    </p>

                    <p className="mt-4 text-3xl leading-none tracking-[-0.05em]">
                      {formatTokenBalance(
                        totalNative,
                        18,
                        6,
                      )}
                    </p>

                    <p className="mt-2 text-[8px] uppercase tracking-[0.13em] opacity-60">
                      {
                        NATIVE_SYMBOL
                      }
                    </p>
                  </div>

                  <div className="border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-4 text-[var(--hood-bg)]">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                      Wallet state
                    </p>

                    <p className="mt-4 text-3xl leading-none tracking-[-0.05em]">
                      {
                        activeWalletCount
                      }{" "}
                      /{" "}
                      {
                        hoodWallets.length
                      }
                    </p>

                    <p className="mt-2 text-[8px] uppercase tracking-[0.13em] opacity-60">
                      Active
                    </p>
                  </div>
                </div>

                {/* Explanation */}

                <div className="mt-4 border border-[var(--hood-fg)] p-4 md:p-5">
                  <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
                    <p className="text-[9px] uppercase tracking-[0.18em]">
                      Deterministic by design
                    </p>

                    <p className="text-sm leading-relaxed opacity-75">
                      Assets can be
                      sent to a
                      HoodWallet
                      before its
                      ERC-6551 account
                      is deployed.
                      Activation does
                      not create a new
                      address — it
                      deploys the
                      account at the
                      address the
                      Hoodie already
                      owns.
                    </p>
                  </div>
                </div>

                {/* Wallet list */}

                <div className="mt-8">
                  <div className="section-heading-row border-[var(--hood-fg)]">
                    <p>
                      Your HoodWallets
                    </p>

                    <p>
                      {
                        hoodWallets.length
                      }{" "}
                      Hoodie
                      {hoodWallets.length ===
                      1
                        ? ""
                        : "s"}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-4">
                    {hoodWallets.map(
                      (
                        wallet,
                      ) => {
                        const hoodie =
                          ownedHoodies.find(
                            (
                              item,
                            ) =>
                              item.tokenId ===
                              wallet.tokenId,
                          );

                        if (!hoodie) {
                          return null;
                        }

                        return (
                          <HoodWalletCard
                            key={
                              wallet.tokenId
                            }
                            hoodie={
                              hoodie
                            }
                            wallet={
                              wallet
                            }
                          />
                        );
                      },
                    )}
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