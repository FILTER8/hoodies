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
  Interface,
  JsonRpcProvider,
  formatEther,
  formatUnits,
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

const HOODIE_FLOOR_ADDRESS =
  "0x2602ef74497799D148093C3F1238193E72b22fD8";

const TREASURY_ADDRESS =
  "0xB4C949eF42a39BB1F37e81661Ddf95f08d5965EC";

const HOODIES_ADDRESS =
  "0x9Ec6C5b9f572A9B02138E553BC5F5882Da735F45";

const SEAPORT_ADDRESS =
  "0x0000000000000068F116a894984e2DB1123eB395";

const SEAPORT_SELECTOR =
  "0xe7acab24";

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

const HOODIE_FLOOR_ABI = [
  {
    type:
      "function",

    name:
      "buyFloorHoodie",

    stateMutability:
      "nonpayable",

    inputs: [
      {
        name:
          "tokenId",

        type:
          "uint256",
      },

      {
        name:
          "ethValue",

        type:
          "uint256",
      },

      {
        name:
          "marketplaceCallData",

        type:
          "bytes",
      },
    ],

    outputs: [],
  },

  {
    type:
      "function",

    name:
      "ethBalance",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "ochRewardBalance",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "remainingEpochETH",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "remainingEpochPurchases",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "operatingParameters",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        name:
          "ethPerHoodie",

        type:
          "uint256",
      },

      {
        name:
          "ethPerEpoch",

        type:
          "uint256",
      },

      {
        name:
          "purchasesPerEpoch",

        type:
          "uint256",
      },

      {
        name:
          "ochReward",

        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "currentEpoch",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        name:
          "start",

        type:
          "uint256",
      },

      {
        name:
          "end",

        type:
          "uint256",
      },

      {
        name:
          "ethSpent",

        type:
          "uint256",
      },

      {
        name:
          "purchases",

        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "totalETHSpent",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "totalHoodiesPurchased",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "totalOCHRewardsPaid",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        type:
          "uint256",
      },
    ],
  },

  {
    type:
      "function",

    name:
      "destinationStatus",

    stateMutability:
      "view",

    inputs: [],

    outputs: [
      {
        name:
          "destination",

        type:
          "address",
      },

      {
        name:
          "inventorySyncEnabled",

        type:
          "bool",
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

type FloorState = {
  ethBalance:
    bigint;

  ochBalance:
    bigint;

  maxETHPerHoodie:
    bigint;

  maxETHPerEpoch:
    bigint;

  maxPurchasesPerEpoch:
    bigint;

  triggerReward:
    bigint;

  remainingEpochETH:
    bigint;

  remainingEpochPurchases:
    bigint;

  epochStart:
    bigint;

  epochEnd:
    bigint;

  epochETHSpent:
    bigint;

  epochPurchases:
    bigint;

  totalETHSpent:
    bigint;

  totalHoodiesPurchased:
    bigint;

  totalOCHRewardsPaid:
    bigint;

  destination:
    string;

  inventorySyncEnabled:
    boolean;
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

    openseaUrl?: string;
  };

  listings?: BuyListing[];

  next?: string | null;

  error?: string;
};

type FulfillResponse = {
  ok?: boolean;

  chain?: string;

  chainId?: number;

  orderHash?: string;

  nft?: {
    contract: string;

    tokenId: string;
  };

  fulfillment?: {
    fulfiller: string;

    recipient: string;
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

function formatOCH(
  value: bigint,
  decimals = 2,
) {
  const formatted =
    formatUnits(
      value,
      18,
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
                         LISTING IMAGE
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
      <div className="flex aspect-square items-center justify-center bg-black text-[8px] uppercase text-[#ccff00]">
        Hoodie #{listing.tokenId}
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

export default function FloorOSPage() {
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
    floorState,
    setFloorState,
  ] =
    useState<
      FloorState | null
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
    selectedListing,
    setSelectedListing,
  ] =
    useState<
      BuyListing | null
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

  const [
    floorLoading,
    setFloorLoading,
  ] =
    useState(
      false,
    );

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

  const [
    buying,
    setBuying,
  ] =
    useState(
      false,
    );

  const [
    walletCopied,
    setWalletCopied,
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
                         OWNERSHIP
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

          if (!response.ok) {
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
    let cancelled =
      false;

    queueMicrotask(
      () => {
        if (
          !cancelled
        ) {
          void loadOwnership();
        }
      },
    );

    return () => {
      cancelled =
        true;
    };
  }, [
    loadOwnership,
  ]);

  /*//////////////////////////////////////////////////////////////
                         HOODWALLET
  //////////////////////////////////////////////////////////////*/

  const loadHoodWallet =
    useCallback(
      async (
        tokenId:
          string,
      ) => {
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
      ],
    );

  useEffect(() => {
    let cancelled =
      false;

    queueMicrotask(
      () => {
        if (
          !cancelled &&
          selectedTokenId
        ) {
          void loadHoodWallet(
            selectedTokenId,
          );
        }
      },
    );

    return () => {
      cancelled =
        true;
    };
  }, [
    loadHoodWallet,
    selectedTokenId,
  ]);

  /*//////////////////////////////////////////////////////////////
                       COPY HOODWALLET
  //////////////////////////////////////////////////////////////*/

  const copyHoodWallet =
    useCallback(
      async () => {
        if (
          !selectedWallet
        ) {
          return;
        }

        try {
          await navigator.clipboard.writeText(
            selectedWallet.walletAddress,
          );

          setWalletCopied(
            true,
          );

          window.setTimeout(
            () => {
              setWalletCopied(
                false,
              );
            },
            1500,
          );
        } catch {
          setError(
            "Unable to copy HoodWallet address.",
          );
        }
      },
      [
        selectedWallet,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                         FLOOR STATE
  //////////////////////////////////////////////////////////////*/

  const loadFloorState =
    useCallback(
      async () => {
        if (!provider) {
          return;
        }

        setFloorLoading(
          true,
        );

        try {
          const floor =
            new Contract(
              HOODIE_FLOOR_ADDRESS,

              HOODIE_FLOOR_ABI,

              provider,
            );

          const [
            ethBalance,
            ochBalance,
            remainingETH,
            remainingPurchases,
            operating,
            epoch,
            totalSpent,
            totalPurchased,
            totalRewards,
            destination,
          ] =
            await Promise.all([
              floor.ethBalance(),

              floor.ochRewardBalance(),

              floor.remainingEpochETH(),

              floor.remainingEpochPurchases(),

              floor.operatingParameters(),

              floor.currentEpoch(),

              floor.totalETHSpent(),

              floor.totalHoodiesPurchased(),

              floor.totalOCHRewardsPaid(),

              floor.destinationStatus(),
            ]);

          setFloorState({
            ethBalance:
              BigInt(
                ethBalance,
              ),

            ochBalance:
              BigInt(
                ochBalance,
              ),

            maxETHPerHoodie:
              BigInt(
                operating.ethPerHoodie ??
                operating[0],
              ),

            maxETHPerEpoch:
              BigInt(
                operating.ethPerEpoch ??
                operating[1],
              ),

            maxPurchasesPerEpoch:
              BigInt(
                operating.purchasesPerEpoch ??
                operating[2],
              ),

            triggerReward:
              BigInt(
                operating.ochReward ??
                operating[3],
              ),

            remainingEpochETH:
              BigInt(
                remainingETH,
              ),

            remainingEpochPurchases:
              BigInt(
                remainingPurchases,
              ),

            epochStart:
              BigInt(
                epoch.start ??
                epoch[0],
              ),

            epochEnd:
              BigInt(
                epoch.end ??
                epoch[1],
              ),

            epochETHSpent:
              BigInt(
                epoch.ethSpent ??
                epoch[2],
              ),

            epochPurchases:
              BigInt(
                epoch.purchases ??
                epoch[3],
              ),

            totalETHSpent:
              BigInt(
                totalSpent,
              ),

            totalHoodiesPurchased:
              BigInt(
                totalPurchased,
              ),

            totalOCHRewardsPaid:
              BigInt(
                totalRewards,
              ),

            destination:
              String(
                destination.destination ??
                destination[0],
              ),

            inventorySyncEnabled:
              Boolean(
                destination.inventorySyncEnabled ??
                destination[1],
              ),
          });
        } catch (
          floorError
        ) {
          setError(
            errorMessage(
              floorError,
              "Unable to read FloorOS.",
            ),
          );
        } finally {
          setFloorLoading(
            false,
          );
        }
      },
      [
        provider,
      ],
    );

  useEffect(() => {
    let cancelled =
      false;

    queueMicrotask(
      () => {
        if (
          !cancelled
        ) {
          void loadFloorState();
        }
      },
    );

    return () => {
      cancelled =
        true;
    };
  }, [
    loadFloorState,
  ]);

  /*//////////////////////////////////////////////////////////////
                         LISTINGS
  //////////////////////////////////////////////////////////////*/

  const loadListings =
    useCallback(
      async (
        cursor?: string,
        append = false,
      ) => {
        if (append) {
          setMoreLoading(
            true,
          );
        } else {
          setListingsLoading(
            true,
          );

          setListings(
            [],
          );

          setNextCursor(
            null,
          );
        }

        setError(
          "",
        );

        try {
          const params =
            new URLSearchParams();

          if (cursor) {
            params.set(
              "cursor",
              cursor,
            );
          }

          const response =
            await fetch(
              `/api/flooros/listings${
                params.toString()
                  ? `?${params.toString()}`
                  : ""
              }`,

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
                "Unable to load Hoodie floor.",
            );
          }

          if (
            payload.chain !==
            ROBINHOOD_CHAIN
          ) {
            throw new Error(
              "FloorOS received the wrong chain.",
            );
          }

          if (append) {
            setListings(
              (
                current,
              ) => {
                const existing =
                  new Set(
                    current.map(
                      (
                        item,
                      ) =>
                        item.orderHash,
                    ),
                  );

                const incoming =
                  (
                    payload.listings ||
                    []
                  ).filter(
                    (
                      item,
                    ) =>
                      !existing.has(
                        item.orderHash,
                      ),
                  );

                return [
                  ...current,
                  ...incoming,
                ];
              },
            );
          } else {
            setListings(
              payload.listings ||
                [],
            );
          }

          setNextCursor(
            payload.next ||
              null,
          );
        } catch (
          listingError
        ) {
          setError(
            errorMessage(
              listingError,
              "Unable to load Hoodie floor.",
            ),
          );
        } finally {
          setListingsLoading(
            false,
          );

          setMoreLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    let cancelled =
      false;

    queueMicrotask(
      () => {
        if (
          !cancelled
        ) {
          void loadListings();
        }
      },
    );

    return () => {
      cancelled =
        true;
    };
  }, [
    loadListings,
  ]);

  /*//////////////////////////////////////////////////////////////
                           BUY
  //////////////////////////////////////////////////////////////*/

  const buyFloorHoodie =
    useCallback(
      async () => {
        if (!address) {
          await connect();

          return;
        }

        if (
          !selectedListing ||
          !selectedWallet ||
          !floorState
        ) {
          return;
        }

        if (
          !selectedWallet.active
        ) {
          setError(
            "Activate this HoodWallet before using FloorOS.",
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
          !sameAddress(
            selectedListing.contract,
            HOODIES_ADDRESS,
          )
        ) {
          setError(
            "FloorOS only supports OnChainHoodies.",
          );

          return;
        }

        setBuying(
          true,
        );

        setSuccess(
          "",
        );

        setError(
          "",
        );

        try {
          const response =
            await fetch(
              "/api/flooros/fulfill",
              {
                method:
                  "POST",

                headers: {
                  "content-type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    orderHash:
                      selectedListing.orderHash,

                    protocolAddress:
                      selectedListing.protocolAddress,

                    tokenId:
                      selectedListing.tokenId,
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
                "Unable to prepare FloorOS purchase.",
            );
          }

          if (
            payload.chain !==
            ROBINHOOD_CHAIN
          ) {
            throw new Error(
              "FloorOS fulfillment returned the wrong chain.",
            );
          }

          if (
            !payload.nft ||
            !sameAddress(
              payload.nft.contract,
              HOODIES_ADDRESS,
            ) ||
            payload.nft.tokenId !==
              selectedListing.tokenId
          ) {
            throw new Error(
              "FloorOS fulfillment returned the wrong Hoodie.",
            );
          }

          if (
            !payload.fulfillment ||
            !sameAddress(
              payload.fulfillment.fulfiller,
              HOODIE_FLOOR_ADDRESS,
            ) ||
            !sameAddress(
              payload.fulfillment.recipient,
              TREASURY_ADDRESS,
            )
          ) {
            throw new Error(
              "FloorOS fulfillment addresses are invalid.",
            );
          }

          const execution =
            payload.execution;

          if (
            !sameAddress(
              execution.target,
              SEAPORT_ADDRESS,
            )
          ) {
            throw new Error(
              "FloorOS fulfillment returned the wrong marketplace.",
            );
          }

          if (
            execution.data
              .slice(
                0,
                10,
              )
              .toLowerCase() !==
            SEAPORT_SELECTOR
          ) {
            throw new Error(
              "FloorOS fulfillment returned the wrong Seaport function.",
            );
          }

          const purchaseValue =
            BigInt(
              execution.value,
            );

          if (!provider) {
            throw new Error(
              "RPC provider unavailable.",
            );
          }

          const floor =
            new Contract(
              HOODIE_FLOOR_ADDRESS,

              HOODIE_FLOOR_ABI,

              provider,
            );

          const [
            freshETH,
            freshRemainingETH,
            freshRemainingPurchases,
            freshOperating,
          ] =
            await Promise.all([
              floor.ethBalance(),

              floor.remainingEpochETH(),

              floor.remainingEpochPurchases(),

              floor.operatingParameters(),
            ]);

          const freshMax =
            BigInt(
              freshOperating.ethPerHoodie ??
                freshOperating[0],
            );

          if (
            purchaseValue >
            freshMax
          ) {
            throw new Error(
              `Fresh price ${formatEth(
                purchaseValue,
              )} ETH exceeds the FloorOS maximum of ${formatEth(
                freshMax,
              )} ETH.`,
            );
          }

          if (
            purchaseValue >
            BigInt(
              freshETH,
            )
          ) {
            throw new Error(
              "FloorOS does not have enough ETH for this purchase.",
            );
          }

          if (
            purchaseValue >
            BigInt(
              freshRemainingETH,
            )
          ) {
            throw new Error(
              "This purchase exceeds today's remaining FloorOS budget.",
            );
          }

          if (
            BigInt(
              freshRemainingPurchases,
            ) ===
            BigInt(0)
          ) {
            throw new Error(
              "FloorOS has reached today's purchase limit.",
            );
          }

          const floorInterface =
            new Interface(
              HOODIE_FLOOR_ABI,
            );

          const floorCalldata =
            floorInterface.encodeFunctionData(
              "buyFloorHoodie",
              [
                BigInt(
                  selectedListing.tokenId,
                ),

                purchaseValue,

                execution.data,
              ],
            );

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
                HOODIE_FLOOR_ADDRESS as Address,

                BigInt(
                  0,
                ),

                floorCalldata as Hex,

                OPERATION_CALL,
              ],

              value:
                BigInt(
                  0,
                ),

              account:
                requireWalletAccount(
                  walletClient.account,
                ),
            });

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
              "FloorOS purchase reverted.",
            );
          }

          const workerToken =
            selectedWallet.tokenId;

          const purchasedToken =
            selectedListing.tokenId;

          const reward =
            floorState.triggerReward;

          setSelectedListing(
            null,
          );

          setSuccess(
            `Hoodie #${workerToken} bought Hoodie #${purchasedToken} for the Treasury and earned ${formatOCH(
              reward,
            )} OCH.`,
          );

          await Promise.all([
            loadHoodWallet(
              workerToken,
            ),

            loadFloorState(),

            loadListings(),
          ]);
        } catch (
          buyError
        ) {
          console.error(
            "FloorOS buy:",
            buyError,
          );

          setError(
            errorMessage(
              buyError,
              "FloorOS purchase failed.",
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
        floorState,
        getWalletClient,
        loadFloorState,
        loadHoodWallet,
        loadListings,
        provider,
        selectedListing,
        selectedWallet,
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

  const eligibleListings =
    useMemo(
      () =>
        listings.filter(
          (
            listing,
          ) => {
            if (
              !floorState
            ) {
              return false;
            }

            const price =
              BigInt(
                listing.priceWei,
              );

            return (
              sameAddress(
                listing.contract,
                HOODIES_ADDRESS,
              ) &&
              price <=
                floorState.maxETHPerHoodie &&
              price <=
                floorState.ethBalance &&
              price <=
                floorState.remainingEpochETH &&
              floorState.remainingEpochPurchases >
                BigInt(
                  0,
                )
            );
          },
        ),
      [
        floorState,
        listings,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                              UI
  //////////////////////////////////////////////////////////////*/

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">

      <SiteHeader />

      <section className="mx-auto max-w-[1360px] px-4 pb-24 pt-20 md:px-6 md:pt-24">

        <div className="flex items-center justify-between border-b border-black pb-3">

          <p className="text-[9px] uppercase tracking-[0.16em]">
            HoodOS / FloorOS
          </p>

          <Link
            href="/hoodos"

            className="text-[8px] uppercase underline underline-offset-4"
          >
            Back to HoodOS
          </Link>

        </div>

        <div className="grid gap-8 border-b border-black py-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">

          <div>

            <p className="text-[9px] uppercase tracking-[0.18em] opacity-50">
              HoodOS / Action 03
            </p>

            <h1 className="mt-4 text-[clamp(4rem,10vw,8rem)] leading-[0.78] tracking-[-0.075em]">
              FLOOR
              <br />
              OS
            </h1>

          </div>

          <div>

            <h2 className="text-3xl leading-[0.95] tracking-[-0.045em] md:text-5xl">
              BUY FOR
              <br />
              THE HOOD.
            </h2>

            <p className="mt-5 max-w-lg text-base leading-relaxed opacity-70">
              Your Hoodie triggers a protocol-funded floor purchase. The acquired Hoodie goes to Treasury and your HoodWallet earns OCH.
            </p>

          </div>

        </div>

        <section className="mt-6">

          <div className="flex items-end justify-between border-b border-black pb-3">

            <div>

              <p className="text-[7px] uppercase tracking-[0.16em] opacity-45">
                Protocol buyer
              </p>

              <h2 className="mt-2 text-2xl tracking-[-0.04em]">
                Floor status
              </h2>

            </div>

            <button
              type="button"

              disabled={
                floorLoading
              }

              onClick={() =>
                void loadFloorState()
              }

              className="text-[7px] uppercase underline underline-offset-4 disabled:opacity-30"
            >
              Refresh
            </button>

          </div>

          {floorState && (

            <div className="grid border-x border-b border-black sm:grid-cols-2 lg:grid-cols-5">

              <div className="border-b border-black p-4 lg:border-b-0 lg:border-r">
                <p className="text-[6px] uppercase opacity-45">
                  Available ETH
                </p>

                <p className="mt-2 text-xl">
                  {formatEth(
                    floorState.ethBalance,
                  )} ETH
                </p>
              </div>

              <div className="border-b border-black p-4 lg:border-b-0 lg:border-r">
                <p className="text-[6px] uppercase opacity-45">
                  Max / Hoodie
                </p>

                <p className="mt-2 text-xl">
                  {formatEth(
                    floorState.maxETHPerHoodie,
                  )} ETH
                </p>
              </div>

              <div className="border-b border-black p-4 lg:border-b-0 lg:border-r">
                <p className="text-[6px] uppercase opacity-45">
                  ETH left today
                </p>

                <p className="mt-2 text-xl">
                  {formatEth(
                    floorState.remainingEpochETH,
                  )} ETH
                </p>
              </div>

              <div className="border-b border-black p-4 lg:border-b-0 lg:border-r">
                <p className="text-[6px] uppercase opacity-45">
                  Buys left
                </p>

                <p className="mt-2 text-xl">
                  {floorState.remainingEpochPurchases.toString()}
                </p>
              </div>

              <div className="p-4">
                <p className="text-[6px] uppercase opacity-45">
                  Hoodie reward
                </p>

                <p className="mt-2 text-xl">
                  {formatOCH(
                    floorState.triggerReward,
                  )} OCH
                </p>
              </div>

            </div>

          )}

        </section>

        {!address ? (

          <div className="mt-6 grid min-h-[320px] place-items-center border border-black p-8 text-center">

            <div>

              <h2 className="text-4xl tracking-[-0.05em]">
                PUT YOUR
                <br />
                HOODIE TO WORK
              </h2>

              <button
                type="button"

                onClick={() =>
                  void connect()
                }

                className="mt-6 bg-black px-8 py-4 text-[9px] uppercase text-[#ccff00]"
              >
                Connect wallet
              </button>

            </div>

          </div>

        ) : ownershipLoading ? (

          <div className="mt-6 border border-black p-8 text-center">
            Reading Hoodie ownership…
          </div>

        ) : ownershipChecked &&
          ownedHoodies.length ===
            0 ? (

          <div className="mt-6 border border-black p-8 text-center">
            No Hoodies
          </div>

        ) : (

          <>

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
                  Worker Hoodie
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

                    setWalletCopied(
                      false,
                    );
                  }}

                  className="mt-2 border border-black bg-[#ccff00] px-3 py-3 text-sm"
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

                  <>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[8px] uppercase">

                      <span>
                        {selectedWallet.active
                          ? "● Active"
                          : "○ Inactive"}
                      </span>

                      <span>
                        {formatEth(
                          selectedWallet.nativeBalance,
                          6,
                        )}{" "}
                        ETH
                      </span>

                      <span>
                        {formatOCH(
                          selectedWallet.ochBalance,
                        )}{" "}
                        OCH
                      </span>

                      <span className="opacity-50">
                        {shortAddress(
                          selectedWallet.walletAddress,
                        )}
                      </span>

                      <button
                        type="button"

                        onClick={() =>
                          void copyHoodWallet()
                        }

                        className="border-b border-black text-[7px] uppercase tracking-[0.1em] transition-opacity hover:opacity-50"
                      >
                        {walletCopied
                          ? "Copied ✓"
                          : "Copy wallet"}
                      </button>

                    </div>

                    <p className="mt-2 text-[6px] uppercase tracking-[0.12em] opacity-40">
                      HoodWallet ETH is used for gas only. FloorOS funds the Hoodie purchase.
                    </p>

                  </>

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

                <span className="bg-black px-4 py-3 text-[7px] uppercase text-[#ccff00]">
                  Ready to work
                </span>

              ) : null}

            </section>

            <section className="mt-9">

              <div className="flex items-end justify-between border-b border-black pb-4">

                <div>

                  <p className="text-[7px] uppercase opacity-45">
                    OpenSea · OnChainHoodies
                  </p>

                  <h2 className="mt-2 text-3xl">
                    Eligible floor
                  </h2>

                </div>

                <div className="text-right">

                  <p className="text-[7px] uppercase opacity-45">
                    {eligibleListings.length} eligible loaded
                  </p>

                  <button
                    type="button"

                    onClick={() =>
                      void loadListings()
                    }

                    className="mt-2 text-[7px] uppercase underline"
                  >
                    Refresh
                  </button>

                </div>

              </div>

              {listingsLoading ? (

                <div className="border-x border-b border-black p-8 text-center">
                  Loading floor…
                </div>

              ) : (

                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">

                  {listings.map(
                    (
                      listing,
                    ) => {
                      const price =
                        BigInt(
                          listing.priceWei,
                        );

                      const eligible =
                        Boolean(
                          floorState &&
                          price <=
                            floorState.maxETHPerHoodie &&
                          price <=
                            floorState.ethBalance &&
                          price <=
                            floorState.remainingEpochETH &&
                          floorState.remainingEpochPurchases >
                            BigInt(
                              0,
                            ),
                        );

                      return (
                        <article
                          key={
                            listing.orderHash
                          }

                          className="flex flex-col border border-black"
                        >

                          <ListingImage
                            listing={
                              listing
                            }
                          />

                          <div className="flex flex-1 flex-col p-3">

                            <div className="flex justify-between gap-2">

                              <p className="text-[10px]">
                                Hoodie #{listing.tokenId}
                              </p>

                              <span
                                className={`border border-black px-2 py-1 text-[5px] uppercase ${
                                  eligible
                                    ? "bg-black text-[#ccff00]"
                                    : ""
                                }`}
                              >
                                {eligible
                                  ? "Eligible"
                                  : "Blocked"}
                              </span>

                            </div>

                            <p className="mt-4 text-lg">
                              {listing.priceDisplay} ETH
                            </p>

                            {floorState && (

                              <p className="mt-1 text-[7px] uppercase opacity-50">
                                +{formatOCH(
                                  floorState.triggerReward,
                                )} OCH
                              </p>

                            )}

                            <button
                              type="button"

                              disabled={
                                !eligible ||
                                !selectedWallet ||
                                !selectedWallet.active ||
                                !connectedOwner
                              }

                              onClick={() =>
                                setSelectedListing(
                                  listing,
                                )
                              }

                              className="mt-auto bg-black px-3 py-3 text-[7px] uppercase text-[#ccff00] disabled:opacity-25"
                            >
                              Buy for Treasury →
                            </button>

                          </div>

                        </article>
                      );
                    },
                  )}

                </div>

              )}

              {nextCursor && (

                <div className="mt-7 flex justify-center">

                  <button
                    type="button"

                    disabled={
                      moreLoading
                    }

                    onClick={() =>
                      void loadListings(
                        nextCursor,
                        true,
                      )
                    }

                    className="border border-black px-7 py-4 text-[8px] uppercase"
                  >
                    {moreLoading
                      ? "Loading…"
                      : "Load 10 more"}
                  </button>

                </div>

              )}

            </section>

          </>

        )}

        {floorState && (

          <section className="mt-14 border-t border-black pt-7">

            <p className="text-[7px] uppercase opacity-45">
              FloorOS history
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">

              <div className="border border-black p-5">

                <p className="text-[6px] uppercase opacity-45">
                  Hoodies acquired
                </p>

                <p className="mt-2 text-3xl">
                  {floorState.totalHoodiesPurchased.toString()}
                </p>

              </div>

              <div className="border border-black p-5">

                <p className="text-[6px] uppercase opacity-45">
                  ETH deployed
                </p>

                <p className="mt-2 text-3xl">
                  {formatEth(
                    floorState.totalETHSpent,
                  )} ETH
                </p>

              </div>

              <div className="border border-black p-5">

                <p className="text-[6px] uppercase opacity-45">
                  Reward reserve
                </p>

                <p className="mt-2 text-3xl">
                  {formatOCH(
                    floorState.ochBalance,
                  )} OCH
                </p>

              </div>

            </div>

          </section>

        )}

        {success && (

          <div className="mt-6 bg-black p-4 text-[#ccff00]">
            ✓ {success}
          </div>

        )}

        {error && (

          <div className="mt-6 border border-black p-4">

            <p className="text-[7px] uppercase opacity-45">
              FloorOS
            </p>

            <p className="mt-2 text-[9px]">
              {error}
            </p>

          </div>

        )}

      </section>

      {selectedListing &&
        selectedWallet &&
        floorState && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">

          <div className="w-full max-w-md border border-black bg-[#ccff00]">

            <div className="flex items-center justify-between border-b border-black p-4">

              <p className="text-[9px] uppercase">
                Confirm FloorOS purchase
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

              <h3 className="text-2xl">
                Hoodie #{selectedListing.tokenId}
              </h3>

              <div className="mt-5 border border-black">

                <div className="flex justify-between border-b border-black p-3">
                  <span>Listing</span>
                  <span>{selectedListing.priceDisplay} ETH</span>
                </div>

                <div className="flex justify-between border-b border-black p-3">
                  <span>ETH payer</span>
                  <span>FloorOS</span>
                </div>

                <div className="flex justify-between border-b border-black p-3">
                  <span>Recipient</span>
                  <span>Treasury</span>
                </div>

                <div className="flex justify-between border-b border-black p-3">
                  <span>Worker</span>
                  <span>Hoodie #{selectedWallet.tokenId}</span>
                </div>

                <div className="flex justify-between border-b border-black p-3">
                  <span>Worker gas ETH</span>
                  <span>
                    {formatEth(
                      selectedWallet.nativeBalance,
                      6,
                    )} ETH
                  </span>
                </div>

                <div className="flex justify-between p-3">
                  <span>Reward</span>
                  <span>
                    +{formatOCH(
                      floorState.triggerReward,
                    )} OCH
                  </span>
                </div>

              </div>

              <button
                type="button"

                disabled={
                  buying
                }

                onClick={() =>
                  void buyFloorHoodie()
                }

                className="mt-5 w-full bg-black px-4 py-5 text-[9px] uppercase text-[#ccff00] disabled:opacity-30"
              >
                {buying
                  ? "Buying…"
                  : `Buy #${selectedListing.tokenId} + Earn ${formatOCH(
                      floorState.triggerReward,
                    )} OCH`}
              </button>

            </div>

          </div>

        </div>

      )}

      <SiteFooter />

    </main>
  );
}