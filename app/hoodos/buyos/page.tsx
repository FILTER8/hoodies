"use client";

import Image from "next/image";
import Link from "next/link";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Contract,
  JsonRpcProvider,
  formatEther,
} from "ethers";

import type {
  Address,
  Hex,
} from "viem";

import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";

import {
  useWallet,
} from "../../../components/WalletProvider";

import {
  siteConfig,
} from "../../../lib/config";

import {
  apiConfig,
  collectionApiUrl,
} from "../../../lib/api";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

const OPERATION_CALL =
  0;

const ROBINHOOD_CHAIN =
  "robinhood";

/*//////////////////////////////////////////////////////////////
                              ABIS
//////////////////////////////////////////////////////////////*/

const HOOD_OS_ABI = [
  "function hoodInfo(uint256 tokenId) view returns (" +
    "tuple(" +
      "uint256 tokenId," +
      "address owner," +
      "address wallet," +
      "bool walletDeployed," +
      "bool active," +
      "address activationOwner," +
      "uint64 activatedAt," +
      "uint256 walletState," +
      "uint256 nativeBalance," +
      "uint256 paymentTokenBalance" +
    ") info" +
  ")",
] as const;

const HOOD_WALLET_EXECUTE_ABI = [
  {
    type:
      "function",

    name:
      "execute",

    stateMutability:
      "payable",

    inputs: [
      {
        name:
          "target",

        type:
          "address",
      },

      {
        name:
          "value",

        type:
          "uint256",
      },

      {
        name:
          "data",

        type:
          "bytes",
      },

      {
        name:
          "operation",

        type:
          "uint8",
      },
    ],

    outputs: [
      {
        name:
          "result",

        type:
          "bytes",
      },
    ],
  },
] as const;

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

  error?: string;
};

type HoodWalletState = {
  tokenId: string;

  owner: string;

  walletAddress: string;

  walletDeployed:
    boolean;

  active:
    boolean;

  nativeBalance:
    bigint;

  ochBalance:
    bigint;
};

type BuyListing = {
  orderHash: string;

  chain: string;

  protocolAddress: string;

  contract: string;

  tokenId: string;

  name: string;

  image: string | null;

  priceWei: string;

  priceExact: string;

  priceDisplay: string;

  currency: string;

  decimals: number;

  remainingQuantity: number;

  openseaUrl: string;
};

type ListingsResponse = {
  ok?: boolean;

  chain?: string;

  slug?: string;

  collection?: {
    name: string;

    image?: string | null;

    description?: string;

    openseaUrl?: string;
  };

  listings?: BuyListing[];

  next?: string | null;

  error?: string;
};

type FulfillResponse = {
  ok?: boolean;

  chain?: string;

  orderHash?: string;

  nft?: {
    contract: string;

    tokenId: string;
  };

  execution?: {
    target: string;

    value: string;

    data: Hex;
  };

  error?: string;
};

/*//////////////////////////////////////////////////////////////
                            HELPERS
//////////////////////////////////////////////////////////////*/

function sameAddress(
  a?: string | null,
  b?: string | null,
) {
  return (
    !!a &&
    !!b &&
    a.toLowerCase() ===
      b.toLowerCase()
  );
}

function errorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    typeof error ===
      "object" &&
    error !== null
  ) {
    const candidate =
      error as {
        shortMessage?:
          string;

        message?:
          string;

        cause?: {
          shortMessage?:
            string;

          message?:
            string;
        };
      };

    return (
      candidate.shortMessage ||
      candidate.cause
        ?.shortMessage ||
      candidate.cause
        ?.message ||
      candidate.message ||
      fallback
    );
  }

  return fallback;
}

function requireWalletAccount<T>(
  account: T | undefined,
): T {
  if (!account) {
    throw new Error(
      "Wallet account unavailable.",
    );
  }

  return account;
}

function tokenArtwork(
  tokenId: string,
) {
  if (
    apiConfig.isMainnet
  ) {
    return collectionApiUrl(
      `/images/${encodeURIComponent(
        tokenId,
      )}.svg`,
    );
  }

  return `/api/hoodies/image?tokenId=${encodeURIComponent(
    tokenId,
  )}`;
}

function formatEth(
  value: bigint,
  decimals = 6,
) {
  const formatted =
    formatEther(
      value,
    );

  const [
    whole,
    fraction = "",
  ] =
    formatted.split(
      ".",
    );

  const trimmed =
    fraction
      .slice(
        0,
        decimals,
      )
      .replace(
        /0+$/,
        "",
      );

  return trimmed
    ? `${whole}.${trimmed}`
    : whole;
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
  )}...${address.slice(
    -4,
  )}`;
}

function buyOsImageUrl(
  image: string | null,
) {
  if (!image) {
    return "";
  }

  return `/api/buyos/image?url=${encodeURIComponent(
    image,
  )}`;
}

/*//////////////////////////////////////////////////////////////
                         HOODIE IMAGE
//////////////////////////////////////////////////////////////*/

function HoodieArtwork({
  hoodie,
}: {
  hoodie:
    OwnedHoodie;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-[8px] uppercase text-[#ccff00]">
        Hoodie
      </div>
    );
  }

  return (
    <Image
      unoptimized

      src={
        tokenArtwork(
          hoodie.tokenId,
        )
      }

      alt={
        hoodie.name ||
        `Hoodie #${hoodie.tokenId}`
      }

      width={
        400
      }

      height={
        400
      }

      onError={() =>
        setFailed(
          true,
        )
      }

      className="h-full w-full object-cover"
    />
  );
}

/*//////////////////////////////////////////////////////////////
                           NFT IMAGE
//////////////////////////////////////////////////////////////*/

function ListingImage({
  listing,
}: {
  listing:
    BuyListing;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );

  const source =
    buyOsImageUrl(
      listing.image,
    );

  if (
    !source ||
    failed
  ) {
    return (
      <div className="flex aspect-square items-center justify-center bg-black text-[8px] uppercase tracking-[0.14em] text-[#ccff00]">
        NFT #{listing.tokenId}
      </div>
    );
  }

  return (
    <div className="aspect-square overflow-hidden bg-black">

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={
          source
        }

        alt={
          listing.name
        }

        loading="lazy"

        onError={() =>
          setFailed(
            true,
          )
        }

        className="h-full w-full object-cover"
      />

    </div>
  );
}

/*//////////////////////////////////////////////////////////////
                              PAGE
//////////////////////////////////////////////////////////////*/

export default function BuyOSPage() {
  const {
    address,
    connect,
    ensureRequiredNetwork,
    getWalletClient,
  } =
    useWallet();

  const provider =
    useMemo(
      () =>
        siteConfig.rpcUrl
          ? new JsonRpcProvider(
              siteConfig.rpcUrl,

              Number(
                siteConfig.chainId,
              ),

              {
                staticNetwork:
                  true,
              },
            )
          : null,
      [],
    );

  /*//////////////////////////////////////////////////////////////
                         HOODIE STATE
  //////////////////////////////////////////////////////////////*/

  const [
    ownedHoodies,
    setOwnedHoodies,
  ] =
    useState<
      OwnedHoodie[]
    >([]);

  const [
    selectedTokenId,
    setSelectedTokenId,
  ] =
    useState("");

  const [
    selectedWallet,
    setSelectedWallet,
  ] =
    useState<
      HoodWalletState | null
    >(null);

  const [
    ownershipLoading,
    setOwnershipLoading,
  ] =
    useState(
      false,
    );

  const [
    ownershipChecked,
    setOwnershipChecked,
  ] =
    useState(
      false,
    );

  const [
    walletLoading,
    setWalletLoading,
  ] =
    useState(
      false,
    );

  /*//////////////////////////////////////////////////////////////
                         MARKET STATE
  //////////////////////////////////////////////////////////////*/

  const [
    openSeaUrl,
    setOpenSeaUrl,
  ] =
    useState("");

  const [
    slug,
    setSlug,
  ] =
    useState("");

  const [
    collection,
    setCollection,
  ] =
    useState<
      ListingsResponse["collection"] | null
    >(null);

  const [
    listings,
    setListings,
  ] =
    useState<
      BuyListing[]
    >([]);

  const [
    nextCursor,
    setNextCursor,
  ] =
    useState<
      string | null
    >(null);

  const [
    listingsLoading,
    setListingsLoading,
  ] =
    useState(
      false,
    );

  const [
    moreLoading,
    setMoreLoading,
  ] =
    useState(
      false,
    );

  /*//////////////////////////////////////////////////////////////
                        PURCHASE STATE
  //////////////////////////////////////////////////////////////*/

  const [
    selectedListing,
    setSelectedListing,
  ] =
    useState<
      BuyListing | null
    >(null);

  const [
    buying,
    setBuying,
  ] =
    useState(
      false,
    );

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  /*//////////////////////////////////////////////////////////////
                       LOAD OWNERSHIP
  //////////////////////////////////////////////////////////////*/

  const loadOwnership =
    useCallback(
      async () => {
        if (!address) {
          setOwnedHoodies(
            [],
          );

          setSelectedTokenId(
            "",
          );

          setSelectedWallet(
            null,
          );

          setOwnershipChecked(
            false,
          );

          return;
        }

        setOwnershipLoading(
          true,
        );

        setOwnershipChecked(
          false,
        );

        setError(
          "",
        );

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

          const payload =
            (await response.json()) as
              OwnershipResponse;

          if (
            !response.ok
          ) {
            throw new Error(
              payload.error ||
                "Unable to load Hoodies.",
            );
          }

          const unique =
            Array.from(
              new Map(
                (
                  payload.items ||
                  []
                ).map(
                  (
                    hoodie,
                  ) => [
                    String(
                      hoodie.tokenId,
                    ),

                    {
                      ...hoodie,

                      tokenId:
                        String(
                          hoodie.tokenId,
                        ),
                    },
                  ],
                ),
              ).values(),
            ).sort(
              (
                left,
                right,
              ) => {
                const a =
                  BigInt(
                    left.tokenId,
                  );

                const b =
                  BigInt(
                    right.tokenId,
                  );

                return a < b
                  ? -1
                  : a > b
                    ? 1
                    : 0;
              },
            );

          setOwnedHoodies(
            unique,
          );

          setSelectedTokenId(
            (
              current,
            ) => {
              if (
                current &&
                unique.some(
                  (
                    hoodie,
                  ) =>
                    hoodie.tokenId ===
                    current,
                )
              ) {
                return current;
              }

              return (
                unique[0]
                  ?.tokenId ||
                ""
              );
            },
          );
        } catch (
          loadError
        ) {
          console.error(
            loadError,
          );

          setOwnedHoodies(
            [],
          );

          setSelectedWallet(
            null,
          );

          setError(
            errorMessage(
              loadError,
              "Unable to load Hoodies.",
            ),
          );
        } finally {
          setOwnershipLoading(
            false,
          );

          setOwnershipChecked(
            true,
          );
        }
      },
      [
        address,
      ],
    );

  useEffect(() => {
  let cancelled = false;

  queueMicrotask(() => {
    if (!cancelled) {
      void loadOwnership();
    }
  });

  return () => {
    cancelled = true;
  };
}, [
  loadOwnership,
]);

  /*//////////////////////////////////////////////////////////////
                       LOAD HOODWALLET
  //////////////////////////////////////////////////////////////*/

  const loadHoodWallet =
    useCallback(
      async (
        tokenIdInput?:
          string,
      ) => {
        const tokenId =
          tokenIdInput ||
          selectedTokenId;

        if (
          !provider ||
          !tokenId
        ) {
          return;
        }

        setWalletLoading(
          true,
        );

        try {
          const hoodOS =
            new Contract(
              siteConfig.hoodOSAddress,

              HOOD_OS_ABI,

              provider,
            );

          const info =
            await hoodOS.hoodInfo(
              BigInt(
                tokenId,
              ),
            );

          setSelectedWallet({
            tokenId,

            owner:
              String(
                info.owner,
              ),

            walletAddress:
              String(
                info.wallet,
              ),

            walletDeployed:
              Boolean(
                info.walletDeployed,
              ),

            active:
              Boolean(
                info.active,
              ),

            nativeBalance:
              BigInt(
                info.nativeBalance,
              ),

            ochBalance:
              BigInt(
                info.paymentTokenBalance,
              ),
          });
        } catch (
          walletError
        ) {
          console.error(
            walletError,
          );

          setSelectedWallet(
            null,
          );

          setError(
            errorMessage(
              walletError,
              "Unable to load HoodWallet.",
            ),
          );
        } finally {
          setWalletLoading(
            false,
          );
        }
      },
      [
        provider,
        selectedTokenId,
      ],
    );

 useEffect(() => {
  if (
    !selectedTokenId
  ) {
    return;
  }

  let cancelled = false;

  queueMicrotask(() => {
    if (!cancelled) {
      void loadHoodWallet(
        selectedTokenId,
      );
    }
  });

  return () => {
    cancelled = true;
  };
}, [
  loadHoodWallet,
  selectedTokenId,
]);

  /*//////////////////////////////////////////////////////////////
                       LOAD COLLECTION
  //////////////////////////////////////////////////////////////*/

  const loadCollection =
    useCallback(
      async () => {
        const input =
          openSeaUrl.trim();

        if (!input) {
          setError(
            "Paste an OpenSea collection URL.",
          );

          return;
        }

        setListingsLoading(
          true,
        );

        setError(
          "",
        );

        setSuccess(
          "",
        );

        setSelectedListing(
          null,
        );

        setListings(
          [],
        );

        setNextCursor(
          null,
        );

        setCollection(
          null,
        );

        setSlug(
          "",
        );

        try {
          const params =
            new URLSearchParams({
              url:
                input,
            });

          const response =
            await fetch(
              `/api/buyos/listings?${params.toString()}`,

              {
                cache:
                  "no-store",
              },
            );

          const payload =
            (await response.json()) as
              ListingsResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ||
                "Unable to load OpenSea listings.",
            );
          }

          if (
            payload.chain !==
            ROBINHOOD_CHAIN
          ) {
            throw new Error(
              "BuyOS only supports Robinhood Chain.",
            );
          }

          setSlug(
            payload.slug ||
              "",
          );

          setCollection(
            payload.collection ||
              null,
          );

          setListings(
            payload.listings ||
              [],
          );

          setNextCursor(
            payload.next ||
              null,
          );
        } catch (
          listingError
        ) {
          console.error(
            listingError,
          );

          setError(
            errorMessage(
              listingError,
              "Unable to load listings.",
            ),
          );
        } finally {
          setListingsLoading(
            false,
          );
        }
      },
      [
        openSeaUrl,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                           LOAD MORE
  //////////////////////////////////////////////////////////////*/

  const loadMore =
    useCallback(
      async () => {
        if (
          !slug ||
          !nextCursor
        ) {
          return;
        }

        setMoreLoading(
          true,
        );

        setError(
          "",
        );

        try {
          const params =
            new URLSearchParams({
              slug,

              cursor:
                nextCursor,
            });

          const response =
            await fetch(
              `/api/buyos/listings?${params.toString()}`,

              {
                cache:
                  "no-store",
              },
            );

          const payload =
            (await response.json()) as
              ListingsResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ||
                "Unable to load more.",
            );
          }

          if (
            payload.chain !==
            ROBINHOOD_CHAIN
          ) {
            throw new Error(
              "BuyOS refused a non-Robinhood response.",
            );
          }

          setListings(
            (
              current,
            ) => {
              const existing =
                new Set(
                  current.map(
                    (
                      listing,
                    ) =>
                      listing.orderHash,
                  ),
                );

              const incoming =
                (
                  payload.listings ||
                  []
                ).filter(
                  (
                    listing,
                  ) =>
                    !existing.has(
                      listing.orderHash,
                    ),
                );

              return [
                ...current,
                ...incoming,
              ];
            },
          );

          setNextCursor(
            payload.next ||
              null,
          );
        } catch (
          moreError
        ) {
          setError(
            errorMessage(
              moreError,
              "Unable to load more listings.",
            ),
          );
        } finally {
          setMoreLoading(
            false,
          );
        }
      },
      [
        nextCursor,
        slug,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                              BUY
  //////////////////////////////////////////////////////////////*/

  const buyListing =
    useCallback(
      async () => {
        if (!address) {
          await connect();

          return;
        }

        if (
          !selectedListing ||
          !selectedWallet
        ) {
          return;
        }

        if (
          !selectedWallet.active
        ) {
          setError(
            "Activate this HoodWallet before using BuyOS.",
          );

          return;
        }

        if (
          !sameAddress(
            selectedWallet.owner,
            address,
          )
        ) {
          setError(
            "Connected wallet is not the current Hoodie owner.",
          );

          return;
        }

        if (
          selectedListing.chain !==
          ROBINHOOD_CHAIN
        ) {
          setError(
            "BuyOS only supports Robinhood Chain.",
          );

          return;
        }

        setBuying(
          true,
        );

        setError(
          "",
        );

        setSuccess(
          "",
        );

        try {
          const response =
            await fetch(
              "/api/buyos/fulfill",
              {
                method:
                  "POST",

                headers: {
                  "content-type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    slug,

                    orderHash:
                      selectedListing.orderHash,

                    chain:
                      selectedListing.chain,

                    protocolAddress:
                      selectedListing.protocolAddress,

                    contract:
                      selectedListing.contract,

                    tokenId:
                      selectedListing.tokenId,

                    hoodWallet:
                      selectedWallet.walletAddress,
                  }),
              },
            );

          const payload =
            (await response.json()) as
              FulfillResponse;

          if (
            !response.ok ||
            !payload.ok ||
            !payload.execution
          ) {
            throw new Error(
              payload.error ||
                "Unable to prepare purchase.",
            );
          }

          if (
            payload.chain !==
            ROBINHOOD_CHAIN
          ) {
            throw new Error(
              "Non-Robinhood fulfillment refused.",
            );
          }

          const execution =
            payload.execution;

          const purchaseValue =
            BigInt(
              execution.value,
            );

          if (
            selectedWallet.nativeBalance <
            purchaseValue
          ) {
            throw new Error(
              `HoodWallet needs ${formatEth(
                purchaseValue,
              )} ETH. Current balance is ${formatEth(
                selectedWallet.nativeBalance,
              )} ETH.`,
            );
          }

          await ensureRequiredNetwork();

          const walletClient =
            await getWalletClient();

          const hash =
            await walletClient.writeContract({
              chain:
                null,

              address:
                selectedWallet.walletAddress as Address,

              abi:
                HOOD_WALLET_EXECUTE_ABI,

              functionName:
                "execute",

              args: [
                execution.target as Address,

                purchaseValue,

                execution.data,

                OPERATION_CALL,
              ],

              value:
                BigInt(0),

              account:
                requireWalletAccount(
                  walletClient.account,
                ),
            });

          if (!provider) {
            throw new Error(
              "RPC provider unavailable.",
            );
          }

          const receipt =
            await provider.waitForTransaction(
              hash,
              1,
            );

          if (
            !receipt ||
            receipt.status !==
              1
          ) {
            throw new Error(
              "Purchase transaction reverted.",
            );
          }

          const name =
            selectedListing.name;

          setSelectedListing(
            null,
          );

          setSuccess(
            `${name} purchased by Hoodie #${selectedWallet.tokenId}.`,
          );

          await loadHoodWallet(
            selectedWallet.tokenId,
          );

          await loadCollection();
        } catch (
          buyError
        ) {
          console.error(
            buyError,
          );

          setError(
            errorMessage(
              buyError,
              "Purchase failed.",
            ),
          );
        } finally {
          setBuying(
            false,
          );
        }
      },
      [
        address,
        connect,
        ensureRequiredNetwork,
        getWalletClient,
        loadCollection,
        loadHoodWallet,
        provider,
        selectedListing,
        selectedWallet,
        slug,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                           DERIVED
  //////////////////////////////////////////////////////////////*/

  const selectedHoodie =
    ownedHoodies.find(
      (
        hoodie,
      ) =>
        hoodie.tokenId ===
        selectedTokenId,
    ) ||
    null;

  const connectedOwner =
    Boolean(
      selectedWallet &&
      address &&
      sameAddress(
        selectedWallet.owner,
        address,
      ),
    );

  /*//////////////////////////////////////////////////////////////
                              UI
  //////////////////////////////////////////////////////////////*/

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">

      <SiteHeader />

      <section className="mx-auto max-w-[1360px] px-4 pb-24 pt-20 md:px-6 md:pt-24">

        {/* TOP */}

        <div className="flex items-center justify-between border-b border-black pb-3">

          <p className="text-[9px] uppercase tracking-[0.16em]">
            HoodOS / BuyOS
          </p>

          <div className="flex items-center gap-4">

            <span className="border border-black px-2 py-1 text-[6px] uppercase tracking-[0.14em]">
              Robinhood Only
            </span>

            <Link
              href="/hoodos"

              className="text-[8px] uppercase underline underline-offset-4"
            >
              Back to HoodOS
            </Link>

          </div>

        </div>

        {/* HERO */}

        <div className="grid gap-8 border-b border-black py-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">

          <div>

            <p className="text-[9px] uppercase tracking-[0.18em] opacity-50">
              HoodOS / Action 02
            </p>

            <h1 className="mt-4 text-[clamp(4rem,10vw,8rem)] leading-[0.78] tracking-[-0.075em]">
              BUY
              <br />
              OS
            </h1>

          </div>

          <div>

            <h2 className="text-3xl leading-[0.95] tracking-[-0.045em] md:text-5xl">
              COLLECT AS
              <br />
              YOUR HOODIE.
            </h2>

            <p className="mt-5 max-w-lg text-base leading-relaxed opacity-70">
              Browse Robinhood Chain OpenSea floor listings and buy NFTs directly through your Hoodie&apos;s on-chain wallet.
            </p>

          </div>

        </div>

        {/* CONNECT */}

        {!address ? (

          <div className="mt-6 grid min-h-[350px] place-items-center border border-black p-8 text-center">

            <div>

              <h2 className="text-4xl tracking-[-0.05em]">
                BUY AS
                <br />
                YOUR HOODIE
              </h2>

              <button
                type="button"

                onClick={() =>
                  void connect()
                }

                className="mt-6 bg-black px-8 py-4 text-[9px] uppercase tracking-[0.16em] text-[#ccff00]"
              >
                Connect wallet
              </button>

            </div>

          </div>

        ) : ownershipLoading ? (

          <div className="mt-6 border border-black p-8 text-center">

            <p className="text-[8px] uppercase">
              Reading Hoodie ownership…
            </p>

          </div>

        ) : ownershipChecked &&
          ownedHoodies.length ===
            0 ? (

          <div className="mt-6 border border-black p-8 text-center">

            <h2 className="text-4xl">
              NO HOODIES
            </h2>

          </div>

        ) : (

          <>

            {/* BUYER */}

            <section className="mt-6 grid gap-4 border-b border-black pb-6 md:grid-cols-[100px_minmax(0,1fr)_auto] md:items-center">

              {selectedHoodie && (

                <div className="aspect-square overflow-hidden border border-black bg-black">

                  <HoodieArtwork
                    hoodie={
                      selectedHoodie
                    }
                  />

                </div>

              )}

              <div>

                <p className="text-[7px] uppercase tracking-[0.15em] opacity-50">
                  Buyer
                </p>

                <select
                  value={
                    selectedTokenId
                  }

                  onChange={(
                    event,
                  ) => {
                    setSelectedWallet(
                      null,
                    );

                    setSelectedTokenId(
                      event.target.value,
                    );

                    setSelectedListing(
                      null,
                    );
                  }}

                  className="mt-2 border border-black bg-[#ccff00] px-3 py-3 text-sm outline-none"
                >
                  {ownedHoodies.map(
                    (
                      hoodie,
                    ) => (

                      <option
                        key={
                          hoodie.tokenId
                        }

                        value={
                          hoodie.tokenId
                        }
                      >
                        Hoodie #{hoodie.tokenId}
                      </option>

                    ),
                  )}
                </select>

                {walletLoading ? (

                  <p className="mt-3 text-[7px] uppercase opacity-45">
                    Loading HoodWallet…
                  </p>

                ) : selectedWallet ? (

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-[8px] uppercase">

                    <span>
                      {selectedWallet.active
                        ? "● Active"
                        : "○ Inactive"}
                    </span>

                    <span>
                      {formatEth(
                        selectedWallet.nativeBalance,
                      )}{" "}
                      ETH
                    </span>

                    <span className="opacity-50">
                      {shortAddress(
                        selectedWallet.walletAddress,
                      )}
                    </span>

                  </div>

                ) : null}

              </div>

              {selectedWallet &&
                !selectedWallet.active ? (

                <Link
                  href="/hoodwallet"

                  className="border border-black px-4 py-3 text-[8px] uppercase"
                >
                  Activate →
                </Link>

              ) : selectedWallet &&
                connectedOwner ? (

                <span className="bg-black px-4 py-3 text-[7px] uppercase tracking-[0.14em] text-[#ccff00]">
                  Ready to collect
                </span>

              ) : null}

            </section>

            {/* COLLECTION INPUT */}

            <section className="mt-8">

              <div className="flex flex-col gap-4 border-b border-black pb-4 sm:flex-row sm:items-end sm:justify-between">

                <div>

                  <div className="flex items-center gap-2">

                    <p className="text-[7px] uppercase tracking-[0.16em] opacity-45">
                      OpenSea
                    </p>

                    <span className="border border-black px-2 py-1 text-[6px] uppercase tracking-[0.12em]">
                      Robinhood Chain
                    </span>

                  </div>

                  <h2 className="mt-2 text-2xl tracking-[-0.04em]">
                    Browse collection
                  </h2>

                </div>

                <p className="text-[7px] uppercase opacity-45">
                  Robinhood ETH listings only
                </p>

              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">

                <input
                  value={
                    openSeaUrl
                  }

                  onChange={(
                    event,
                  ) =>
                    setOpenSeaUrl(
                      event.target.value,
                    )
                  }

                  placeholder="https://opensea.io/collection/..."

                  className="min-w-0 flex-1 border border-black bg-transparent p-4 text-[10px] outline-none"
                />

                <button
                  type="button"

                  disabled={
                    listingsLoading
                  }

                  onClick={() =>
                    void loadCollection()
                  }

                  className="bg-black px-7 py-4 text-[8px] uppercase tracking-[0.15em] text-[#ccff00] disabled:opacity-30"
                >
                  {listingsLoading
                    ? "Loading…"
                    : "Load floor"}
                </button>

              </div>

            </section>

            {/* COLLECTION */}

            {collection && (

              <section className="mt-10">

                <div className="flex items-end justify-between gap-5 border-b border-black pb-4">

                  <div>

                    <p className="text-[7px] uppercase tracking-[0.15em] opacity-45">
                      Floor listings · Price ↑
                    </p>

                    <h2 className="mt-2 text-3xl tracking-[-0.045em]">
                      {collection.name}
                    </h2>

                    {listings[0] && (

                      <p className="mt-2 text-[8px] uppercase opacity-50">
                        Floor{" "}
                        {
                          listings[0]
                            .priceDisplay
                        }{" "}
                        ETH
                      </p>

                    )}

                  </div>

                  {collection.openseaUrl && (

                    <a
                      href={
                        collection.openseaUrl
                      }

                      target="_blank"

                      rel="noreferrer"

                      className="text-[7px] uppercase underline underline-offset-4"
                    >
                      View collection
                    </a>

                  )}

                </div>

                {/* CARDS */}

                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">

                  {listings.map(
                    (
                      listing,
                    ) => {
                      const rawPrice =
                        BigInt(
                          listing.priceWei,
                        );

                      const enough =
                        selectedWallet
                          ? selectedWallet.nativeBalance >=
                            rawPrice
                          : false;

                      return (
                        <article
                          key={
                            listing.orderHash
                          }

                          className="flex min-w-0 flex-col border border-black"
                        >

                          <ListingImage
                            listing={
                              listing
                            }
                          />

                          <div className="flex flex-1 flex-col p-3">

                            <p className="truncate text-[10px]">
                              {
                                listing.name
                              }
                            </p>

                            <p className="mt-1 text-[7px] uppercase opacity-45">
                              #
                              {
                                listing.tokenId
                              }
                            </p>

                            <p className="mt-4 text-lg tracking-[-0.03em]">
                              {
                                listing.priceDisplay
                              }{" "}
                              ETH
                            </p>

                            <div className="mt-auto pt-4">

                              <button
                                type="button"

                                disabled={
                                  !selectedWallet ||
                                  !selectedWallet.active ||
                                  !connectedOwner ||
                                  !enough
                                }

                                onClick={() =>
                                  setSelectedListing(
                                    listing,
                                  )
                                }

                                className="w-full bg-black px-3 py-3 text-[7px] uppercase tracking-[0.13em] text-[#ccff00] disabled:opacity-25"
                              >
                                Buy as #
                                {
                                  selectedTokenId
                                }{" "}
                                →
                              </button>

                              {!enough &&
                                selectedWallet && (

                                  <p className="mt-2 text-center text-[6px] uppercase opacity-45">
                                    Not enough HoodWallet ETH
                                  </p>

                                )}

                              <a
                                href={
                                  listing.openseaUrl
                                }

                                target="_blank"

                                rel="noreferrer"

                                className="mt-2 block text-center text-[6px] uppercase opacity-45 underline underline-offset-2"
                              >
                                View on OpenSea
                              </a>

                            </div>

                          </div>

                        </article>
                      );
                    },
                  )}

                </div>

                {nextCursor && (

                  <div className="mt-7 flex justify-center">

                    <button
                      type="button"

                      disabled={
                        moreLoading
                      }

                      onClick={() =>
                        void loadMore()
                      }

                      className="border border-black px-7 py-4 text-[8px] uppercase tracking-[0.14em] hover:bg-black hover:text-[#ccff00] disabled:opacity-30"
                    >
                      {moreLoading
                        ? "Loading…"
                        : "Load 10 more"}
                    </button>

                  </div>

                )}

              </section>

            )}

          </>

        )}

        {success && (

          <div className="mt-6 bg-black p-4 text-[#ccff00]">

            <p className="text-[8px] uppercase">
              ✓ {success}
            </p>

          </div>

        )}

        {error && (

          <div className="mt-6 border border-black p-4">

            <p className="text-[7px] uppercase opacity-45">
              BuyOS
            </p>

            <p className="mt-2 text-[9px]">
              {error}
            </p>

          </div>

        )}

      </section>

      {/* CONFIRM */}

      {selectedListing &&
        selectedWallet && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">

          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto border border-black bg-[#ccff00]">

            <div className="flex items-center justify-between border-b border-black p-4">

              <p className="text-[9px] uppercase">
                Confirm purchase
              </p>

              <button
                type="button"

                disabled={
                  buying
                }

                onClick={() =>
                  setSelectedListing(
                    null,
                  )
                }

                className="text-xl"
              >
                ×
              </button>

            </div>

            <ListingImage
              listing={
                selectedListing
              }
            />

            <div className="p-5">

              <h3 className="text-2xl tracking-[-0.04em]">
                {
                  selectedListing.name
                }
              </h3>

              <div className="mt-5 border border-black">

                <div className="flex justify-between border-b border-black p-3">

                  <span className="text-[7px] uppercase opacity-50">
                    Price
                  </span>

                  <span className="text-[10px]">
                    {
                      selectedListing.priceDisplay
                    }{" "}
                    ETH
                  </span>

                </div>

                <div className="flex justify-between border-b border-black p-3">

                  <span className="text-[7px] uppercase opacity-50">
                    Exact listing price
                  </span>

                  <span className="text-[8px] opacity-60">
                    {
                      selectedListing.priceExact
                    }{" "}
                    ETH
                  </span>

                </div>

                <div className="flex justify-between border-b border-black p-3">

                  <span className="text-[7px] uppercase opacity-50">
                    Buyer
                  </span>

                  <span className="text-[9px]">
                    Hoodie #
                    {
                      selectedWallet.tokenId
                    }
                  </span>

                </div>

                <div className="flex justify-between p-3">

                  <span className="text-[7px] uppercase opacity-50">
                    HoodWallet
                  </span>

                  <span className="text-[9px]">
                    {formatEth(
                      selectedWallet.nativeBalance,
                    )}{" "}
                    ETH
                  </span>

                </div>

              </div>

              <p className="mt-4 text-[7px] uppercase leading-relaxed opacity-50">
                The listing is refreshed before execution.
                The displayed price is rounded like OpenSea.
                The actual transaction uses OpenSea&apos;s fresh on-chain fulfillment value.
              </p>

              <button
                type="button"

                disabled={
                  buying
                }

                onClick={() =>
                  void buyListing()
                }

                className="mt-5 w-full bg-black px-4 py-5 text-[9px] uppercase tracking-[0.16em] text-[#ccff00] disabled:opacity-30"
              >
                {buying
                  ? "Buying…"
                  : `Confirm buy as Hoodie #${selectedWallet.tokenId}`}
              </button>

            </div>

          </div>

        </div>

      )}

      <SiteFooter />

    </main>
  );
}