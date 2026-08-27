"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
  getAddress,
  isAddress,
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

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";

const ROBINHOOD_CHAIN =
  "robinhood";

/*
 * OpenSea SeaDrop.
 *
 * Execution takes place on the Robinhood
 * provider configured by this application.
 */
const SEADROP_ADDRESS =
  "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";

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

const SEADROP_READ_ABI = [
  "function getPublicDrop(address nftContract) view returns (" +
    "tuple(" +
      "uint80 mintPrice," +
      "uint48 startTime," +
      "uint48 endTime," +
      "uint16 maxTotalMintableByWallet," +
      "uint16 feeBps," +
      "bool restrictFeeRecipients" +
    ") publicDrop" +
  ")",

  "function getAllowedFeeRecipients(address nftContract) view returns (address[])",
] as const;

const NFT_READ_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
] as const;

const SEADROP_INTERFACE =
  new Interface([
    "function mintPublic(" +
      "address nftContract," +
      "address feeRecipient," +
      "address minterIfNotPayer," +
      "uint256 quantity" +
    ") payable",
  ]);

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

type MintOSResolveResponse = {
  ok?: boolean;

  source?:
    | "url"
    | "opensea";

  contract?: string;

  chain?:
    string | null;

  tokenId?:
    string | null;

  slug?:
    string | null;

  name?:
    string | null;

  error?: string;
};

type PublicDropState = {
  nftContract: string;

  name: string;

  symbol: string;

  mintPrice: bigint;

  startTime: bigint;

  endTime: bigint;

  maxTotalMintableByWallet:
    number;

  feeBps:
    number;

  restrictFeeRecipients:
    boolean;

  feeRecipient: string;

  active: boolean;
};

type TxState = {
  pending: boolean;

  message: string;
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

function normalizeChain(
  value?: string | null,
) {
  return (
    value
      ?.trim()
      .toLowerCase() ||
    ""
  );
}

function isRobinhoodChain(
  value?: string | null,
) {
  return (
    normalizeChain(
      value,
    ) ===
    ROBINHOOD_CHAIN
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
  )}...${address.slice(
    -4,
  )}`;
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

function explorerAddress(
  address: string,
) {
  return `${siteConfig.explorerUrl.replace(
    /\/$/,
    "",
  )}/address/${address}`;
}

function formatEth(
  value: bigint,
  maxDecimals = 6,
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

  if (!fraction) {
    return whole;
  }

  const trimmed =
    fraction
      .slice(
        0,
        maxDecimals,
      )
      .replace(
        /0+$/,
        "",
      );

  return trimmed
    ? `${whole}.${trimmed}`
    : whole;
}

function formatDate(
  timestamp: bigint,
) {
  if (
    timestamp ===
    BigInt(0)
  ) {
    return "—";
  }

  const date =
    new Date(
      Number(
        timestamp,
      ) * 1000,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return date.toLocaleString();
}

/*//////////////////////////////////////////////////////////////
                            ARTWORK
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
      <div className="flex h-full w-full items-center justify-center bg-black p-4 text-center text-[#ccff00]">

        <p className="text-[8px] uppercase tracking-[0.14em]">
          Artwork unavailable
        </p>

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
        `OnChainHoodie #${hoodie.tokenId}`
      }

      width={
        600
      }

      height={
        600
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
                              PAGE
//////////////////////////////////////////////////////////////*/

export default function MintOSPage() {
  const searchParams = useSearchParams();
  const sharedCollection = searchParams.get("collection") || "";
  const {
    address,
    connect,
    ensureRequiredNetwork,
    getWalletClient,
  } =
    useWallet();

  /*//////////////////////////////////////////////////////////////
                            PROVIDER
  //////////////////////////////////////////////////////////////*/

  const provider =
    useMemo(
      () => {
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
            staticNetwork:
              true,
          },
        );
      },
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
                           RESOLVER
  //////////////////////////////////////////////////////////////*/

  const [
    openSeaUrl,
    setOpenSeaUrl,
  ] =
    useState(() => sharedCollection);

  const [
    resolvedNftContract,
    setResolvedNftContract,
  ] =
    useState("");

  const [
    resolvedCollectionName,
    setResolvedCollectionName,
  ] =
    useState("");

  const [
    resolvedSlug,
    setResolvedSlug,
  ] =
    useState("");

  const [
    resolvedChain,
    setResolvedChain,
  ] =
    useState("");

  const [
    resolvingUrl,
    setResolvingUrl,
  ] =
    useState(
      false,
    );

  /*//////////////////////////////////////////////////////////////
                           DROP STATE
  //////////////////////////////////////////////////////////////*/

  const [
    drop,
    setDrop,
  ] =
    useState<
      PublicDropState | null
    >(null);

  const [
    dropLoading,
    setDropLoading,
  ] =
    useState(
      false,
    );

  const [
    quantity,
    setQuantity,
  ] =
    useState(
      "1",
    );

  /*//////////////////////////////////////////////////////////////
                          GENERAL STATE
  //////////////////////////////////////////////////////////////*/

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    txState,
    setTxState,
  ] =
    useState<TxState>({
      pending:
        false,

      message:
        "",
    });

/*//////////////////////////////////////////////////////////////
                      LOAD HOODIE OWNERSHIP
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
        null,
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
              "Unable to load Hoodie ownership.",
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
        ownershipError
      ) {
        console.error(
          ownershipError,
        );

        setOwnedHoodies(
          [],
        );

        setSelectedWallet(
          null,
        );

        setError(
          errorMessage(
            ownershipError,
            "Unable to load Hoodie ownership.",
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
                  LOAD SELECTED HOODWALLET
//////////////////////////////////////////////////////////////*/

const loadSelectedWallet =
  useCallback(
    async (
      tokenIdInput?:
        string,
    ) => {
      const tokenIdText =
        tokenIdInput ||
        selectedTokenId;

      if (
        !address ||
        !provider ||
        !tokenIdText
      ) {
        return;
      }

      setWalletLoading(
        true,
      );

      setError(
        null,
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
              tokenIdText,
            ),
          );

        setSelectedWallet({
          tokenId:
            tokenIdText,

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
            `Unable to load HoodWallet #${tokenIdText}.`,
          ),
        );
      } finally {
        setWalletLoading(
          false,
        );
      }
    },
    [
      address,
      provider,
      selectedTokenId,
    ],
  );

useEffect(() => {
  if (
    !address ||
    !selectedTokenId
  ) {
    return;
  }

  let cancelled = false;

  queueMicrotask(() => {
    if (!cancelled) {
      void loadSelectedWallet(
        selectedTokenId,
      );
    }
  });

  return () => {
    cancelled = true;
  };
}, [
  address,
  selectedTokenId,
  loadSelectedWallet,
]);

  /*//////////////////////////////////////////////////////////////
                     RESOLVE OPENSEA URL
  //////////////////////////////////////////////////////////////*/

  const resolveOpenSeaUrl =
    useCallback(
      async (
        urlInput?: string,
      ) => {
        const value =
          (urlInput ?? openSeaUrl).trim();

        if (!value) {
          setError(
            "Enter an OpenSea URL.",
          );

          return;
        }

        setResolvingUrl(
          true,
        );

        setResolvedNftContract(
          "",
        );

        setResolvedCollectionName(
          "",
        );

        setResolvedSlug(
          "",
        );

        setResolvedChain(
          "",
        );

        setDrop(
          null,
        );

        setQuantity(
          "1",
        );

        setTxState({
          pending:
            false,

          message:
            "",
        });

        setError(
          null,
        );

        try {
          const params =
            new URLSearchParams({
              url:
                value,
            });

          const response =
            await fetch(
              `/api/mintos/resolve?${params.toString()}`,

              {
                method:
                  "GET",

                cache:
                  "no-store",

                headers: {
                  accept:
                    "application/json",
                },
              },
            );

          const payload =
            (await response.json()) as
              MintOSResolveResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ||
                "Unable to resolve this OpenSea URL.",
            );
          }

          /*
           * Frontend backstop.
           *
           * Server is authoritative, but we
           * still refuse anything that does
           * not explicitly say Robinhood.
           */
          if (
            !isRobinhoodChain(
              payload.chain,
            )
          ) {
            throw new Error(
              "MintOS only supports Robinhood Chain collections.",
            );
          }

          if (
            !payload.contract ||
            !isAddress(
              payload.contract,
            )
          ) {
            throw new Error(
              "OpenSea did not return a valid NFT contract.",
            );
          }

          setResolvedNftContract(
            getAddress(
              payload.contract,
            ),
          );

          setResolvedCollectionName(
            payload.name ||
              payload.slug ||
              "OpenSea Collection",
          );

          setResolvedSlug(
            payload.slug ||
              "",
          );

          setResolvedChain(
            ROBINHOOD_CHAIN,
          );
        } catch (
          resolveError
        ) {
          console.error(
            resolveError,
          );

          setResolvedChain(
            "",
          );

          setError(
            errorMessage(
              resolveError,
              "Unable to resolve this OpenSea URL.",
            ),
          );
        } finally {
          setResolvingUrl(
            false,
          );
        }
      },
      [
        openSeaUrl,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                    SHARED COLLECTION LINK
  //////////////////////////////////////////////////////////////*/

  useEffect(() => {
    const value = sharedCollection.trim();
    if (!value) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void resolveOpenSeaUrl(value);
    });

    return () => {
      cancelled = true;
    };
  }, [resolveOpenSeaUrl, sharedCollection]);

  const shareCollection = useCallback(async () => {
    const value = openSeaUrl.trim();
    if (!value || typeof window === "undefined") return;

    const shareUrl = new URL(
      window.location.pathname,
      window.location.origin,
    );
    shareUrl.searchParams.set("collection", value);

    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      setError(null);
      setTxState({
        pending: false,
        message: "Collection link copied.",
      });
    } catch {
      setError("Unable to copy the collection link.");
    }
  }, [openSeaUrl]);

  /*//////////////////////////////////////////////////////////////
                       READ PUBLIC DROP
  //////////////////////////////////////////////////////////////*/

  const loadPublicDrop =
    useCallback(
      async () => {
        if (!provider) {
          setError(
            "RPC provider unavailable.",
          );

          return;
        }

        /*
         * Never perform an on-chain read unless
         * the resolver explicitly confirmed
         * Robinhood.
         */
        if (
          !isRobinhoodChain(
            resolvedChain,
          )
        ) {
          setError(
            "MintOS only supports Robinhood Chain collections.",
          );

          return;
        }

        if (
          !resolvedNftContract ||
          !isAddress(
            resolvedNftContract,
          )
        ) {
          setError(
            "Resolve a Robinhood Chain OpenSea collection first.",
          );

          return;
        }

        setDropLoading(
          true,
        );

        setDrop(
          null,
        );

        setError(
          null,
        );

        setTxState({
          pending:
            false,

          message:
            "",
        });

        try {
          const seaDrop =
            new Contract(
              SEADROP_ADDRESS,

              SEADROP_READ_ABI,

              provider,
            );

          const publicDrop =
            await seaDrop.getPublicDrop(
              resolvedNftContract,
            );

          const mintPrice =
            BigInt(
              publicDrop.mintPrice,
            );

          const startTime =
            BigInt(
              publicDrop.startTime,
            );

          const endTime =
            BigInt(
              publicDrop.endTime,
            );

          const maxTotalMintableByWallet =
            Number(
              publicDrop.maxTotalMintableByWallet,
            );

          const feeBps =
            Number(
              publicDrop.feeBps,
            );

          const restrictFeeRecipients =
            Boolean(
              publicDrop.restrictFeeRecipients,
            );

          if (
            startTime ===
              BigInt(0) &&
            endTime ===
              BigInt(0) &&
            maxTotalMintableByWallet ===
              0
          ) {
            throw new Error(
              "This Robinhood collection does not currently have a SeaDrop public mint configured.",
            );
          }

          let feeRecipient =
            address ||
            "";

          const allowedRecipients =
            (await seaDrop.getAllowedFeeRecipients(
              resolvedNftContract,
            )) as
              string[];

          if (
            restrictFeeRecipients
          ) {
            if (
              allowedRecipients.length ===
              0
            ) {
              throw new Error(
                "This mint restricts SeaDrop fee recipients, but no allowed fee recipient is configured.",
              );
            }

            feeRecipient =
              String(
                allowedRecipients[
                  0
                ],
              );
          } else if (
            allowedRecipients.length >
              0
          ) {
            feeRecipient =
              String(
                allowedRecipients[
                  0
                ],
              );
          }

          if (
            !feeRecipient ||
            !isAddress(
              feeRecipient,
            ) ||
            sameAddress(
              feeRecipient,
              ZERO_ADDRESS,
            )
          ) {
            throw new Error(
              "Unable to resolve a valid SeaDrop fee recipient.",
            );
          }

          let name =
            resolvedCollectionName ||
            "SeaDrop Collection";

          let symbol =
            "";

          try {
            const nft =
              new Contract(
                resolvedNftContract,

                NFT_READ_ABI,

                provider,
              );

            name =
              String(
                await nft.name(),
              );

            try {
              symbol =
                String(
                  await nft.symbol(),
                );
            } catch {
              symbol =
                "";
            }
          } catch {
            // Display-only metadata.
          }

          const now =
            BigInt(
              Math.floor(
                Date.now() /
                  1000,
              ),
            );

          const active =
            now >=
              startTime &&
            now <=
              endTime;

          setDrop({
            nftContract:
              getAddress(
                resolvedNftContract,
              ),

            name,

            symbol,

            mintPrice,

            startTime,

            endTime,

            maxTotalMintableByWallet,

            feeBps,

            restrictFeeRecipients,

            feeRecipient:
              getAddress(
                feeRecipient,
              ),

            active,
          });
        } catch (
          dropError
        ) {
          console.error(
            dropError,
          );

          setDrop(
            null,
          );

          setError(
            errorMessage(
              dropError,
              "Unable to read this Robinhood SeaDrop public mint.",
            ),
          );
        } finally {
          setDropLoading(
            false,
          );
        }
      },
      [
        address,
        provider,
        resolvedChain,
        resolvedCollectionName,
        resolvedNftContract,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                        WAIT FOR TX
  //////////////////////////////////////////////////////////////*/

  const waitForHash =
    useCallback(
      async (
        hash: string,
      ) => {
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

        if (!receipt) {
          throw new Error(
            "Transaction confirmation not found.",
          );
        }

        if (
          receipt.status !==
          1
        ) {
          throw new Error(
            "Transaction reverted.",
          );
        }

        return receipt;
      },
      [
        provider,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                       MINT AS HOODIE
  //////////////////////////////////////////////////////////////*/

  const mintAsHoodie =
    useCallback(
      async () => {
        if (!address) {
          await connect();

          return;
        }

        if (!selectedWallet) {
          setError(
            "Select a Hoodie first.",
          );

          return;
        }

        if (!drop) {
          setError(
            "Load a public mint first.",
          );

          return;
        }

        /*
         * Hard client-side Robinhood guard.
         */
        if (
          !isRobinhoodChain(
            resolvedChain,
          )
        ) {
          setError(
            "MintOS only supports Robinhood Chain collections.",
          );

          return;
        }

        if (
          !selectedWallet.active
        ) {
          setError(
            "Activate this HoodWallet before using MintOS.",
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

        if (!drop.active) {
          setError(
            "This SeaDrop public mint is not currently active.",
          );

          return;
        }

        let mintQuantity:
          bigint;

        try {
          mintQuantity =
            BigInt(
              quantity.trim(),
            );
        } catch {
          setError(
            "Invalid mint quantity.",
          );

          return;
        }

        if (
          mintQuantity <=
          BigInt(0)
        ) {
          setError(
            "Mint quantity must be at least 1.",
          );

          return;
        }

        if (
          drop.maxTotalMintableByWallet >
            0 &&
          mintQuantity >
            BigInt(
              drop.maxTotalMintableByWallet,
            )
        ) {
          setError(
            `This public mint allows a maximum of ${drop.maxTotalMintableByWallet} mint(s) per wallet.`,
          );

          return;
        }

        const totalPrice =
          drop.mintPrice *
          mintQuantity;

        if (
          selectedWallet.nativeBalance <
          totalPrice
        ) {
          setError(
            `HoodWallet #${selectedWallet.tokenId} needs ${formatEth(
              totalPrice,
            )} ETH for this mint. Current HoodWallet balance is ${formatEth(
              selectedWallet.nativeBalance,
            )} ETH.`,
          );

          return;
        }

        try {
          setError(
            null,
          );

          setTxState({
            pending:
              true,

            message:
              `Preparing Robinhood mint as Hoodie #${selectedWallet.tokenId}…`,
          });

          /*
           * This switches/checks the connected
           * owner wallet against your configured
           * Robinhood network.
           */
          await ensureRequiredNetwork();

          const walletClient =
            await getWalletClient();

          const mintData =
            SEADROP_INTERFACE.encodeFunctionData(
              "mintPublic",

              [
                drop.nftContract,

                drop.feeRecipient,

                ZERO_ADDRESS,

                mintQuantity,
              ],
            ) as
              Hex;

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
                SEADROP_ADDRESS as Address,

                totalPrice,

                mintData,

                OPERATION_CALL,
              ],

              /*
               * Holder EOA pays gas only.
               *
               * HoodWallet supplies the SeaDrop
               * mint value from its own balance.
               */
              value:
                BigInt(0),

              account:
                requireWalletAccount(
                  walletClient.account,
                ),
            });

          setTxState({
            pending:
              true,

            message:
              `Mint submitted ${shortAddress(
                hash,
              )}. Waiting for confirmation…`,
          });

          await waitForHash(
            hash,
          );

          await loadSelectedWallet(
            selectedWallet.tokenId,
          );

          setTxState({
            pending:
              false,

            message:
              `${mintQuantity.toString()} NFT${
                mintQuantity ===
                BigInt(1)
                  ? ""
                  : "s"
              } minted on Robinhood Chain as Hoodie #${selectedWallet.tokenId}.`,
          });
        } catch (
          transactionError
        ) {
          console.error(
            transactionError,
          );

          const message =
            errorMessage(
              transactionError,
              "Mint transaction failed.",
            );

          setTxState({
            pending:
              false,

            message,
          });

          setError(
            message,
          );
        }
      },
      [
        address,
        connect,
        drop,
        ensureRequiredNetwork,
        getWalletClient,
        loadSelectedWallet,
        quantity,
        resolvedChain,
        selectedWallet,
        waitForHash,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                       DERIVED STATE
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

  const quantityBigInt =
    useMemo(
      () => {
        try {
          const parsed =
            BigInt(
              quantity,
            );

          return parsed >
            BigInt(0)
            ? parsed
            : BigInt(1);
        } catch {
          return BigInt(1);
        }
      },
      [
        quantity,
      ],
    );

  const totalMintPrice =
    drop
      ? drop.mintPrice *
        quantityBigInt
      : BigInt(0);

  const hasEnoughMintEth =
    selectedWallet
      ? selectedWallet.nativeBalance >=
        totalMintPrice
      : false;

  const connectedWalletOwnsSelectedHoodie =
    selectedWallet &&
    address
      ? sameAddress(
          selectedWallet.owner,
          address,
        )
      : false;

  const robinhoodResolved =
    isRobinhoodChain(
      resolvedChain,
    );

  const canMint =
    Boolean(
      address &&
      selectedWallet &&
      connectedWalletOwnsSelectedHoodie &&
      selectedWallet.active &&
      robinhoodResolved &&
      drop &&
      drop.active &&
      hasEnoughMintEth &&
      !txState.pending,
    );

  /*//////////////////////////////////////////////////////////////
                                UI
  //////////////////////////////////////////////////////////////*/

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">

      <SiteHeader />

      <section className="mx-auto max-w-[1200px] px-4 pb-24 pt-20 md:px-6 md:pt-24">

        {/* TOP BAR */}

        <div className="flex items-center justify-between gap-4 border-b border-black pb-3">

          <p className="text-[9px] uppercase tracking-[0.16em]">
            HoodOS / MintOS
          </p>

          <div className="flex items-center gap-4">

            <span className="border border-black px-2 py-1 text-[6px] uppercase tracking-[0.14em]">
              Robinhood Only
            </span>

            <Link
              href="/hoodos"

              className="text-[9px] uppercase underline underline-offset-4"
            >
              Back to HoodOS
            </Link>

          </div>

        </div>

        {/* HERO */}

        <div className="grid gap-8 border-b border-black py-10 md:grid-cols-[1fr_0.8fr] md:items-end">

          <div>

            <p className="text-[9px] uppercase tracking-[0.18em] opacity-55">
              HoodOS / Action 01
            </p>

            <h1 className="mt-4 text-[clamp(4rem,10vw,8rem)] leading-[0.78] tracking-[-0.075em]">
              MINT
              <br />
              OS
            </h1>

          </div>

          <div>

            <p className="max-w-lg text-lg leading-relaxed md:text-xl">
              Mint public OpenSea drops directly as your Hoodie.
            </p>

            <p className="mt-4 max-w-lg text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-55">
              Robinhood Chain only.
              You sign.
              Your HoodWallet executes.
              Your Hoodie receives the NFT.
            </p>

          </div>

        </div>

        {/* NO WALLET */}

        {!address ? (

          <div className="mt-6 grid min-h-[420px] place-items-center border border-black p-8 text-center">

            <div>

              <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">
                Step 01
              </p>

              <h2 className="mt-4 text-5xl tracking-[-0.06em]">
                CONNECT
                <br />
                YOUR WALLET
              </h2>

              <p className="mx-auto mt-5 max-w-sm text-sm leading-relaxed opacity-65">
                Connect the EVM wallet currently holding your OnChainHoodie.
              </p>

              <button
                type="button"

                onClick={() =>
                  void connect()
                }

                className="mt-6 border border-black bg-black px-8 py-4 text-[9px] uppercase tracking-[0.16em] text-[#ccff00]"
              >
                Connect wallet
              </button>

            </div>

          </div>

        ) : ownershipLoading ? (

          <div className="mt-6 border border-black p-8 text-center">

            <p className="text-[9px] uppercase tracking-[0.15em]">
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

            <p className="mt-4 text-sm opacity-65">
              This connected wallet does not currently own an OnChainHoodie.
            </p>

          </div>

        ) : (

          <div className="mt-6 grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">

            {/* HOODIE */}

            <aside>

              <div className="border border-black">

                <div className="border-b border-black px-3 py-2">

                  <p className="text-[8px] uppercase tracking-[0.14em]">
                    01 / Choose Hoodie
                  </p>

                </div>

                {selectedHoodie && (

                  <div className="aspect-square bg-black">

                    <HoodieArtwork
                      hoodie={
                        selectedHoodie
                      }
                    />

                  </div>

                )}

                <div className="border-t border-black p-3">

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

                      setDrop(
                        null,
                      );

                      setTxState({
                        pending:
                          false,

                        message:
                          "",
                      });
                    }}

                    className="w-full border border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase outline-none"
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
                          Hoodie #
                          {
                            hoodie.tokenId
                          }
                        </option>

                      ),
                    )}
                  </select>

                </div>

                {walletLoading ? (

                  <div className="border-t border-black p-4">

                    <p className="text-[8px] uppercase">
                      Loading HoodWallet…
                    </p>

                  </div>

                ) : selectedWallet ? (

                  <>

                    <div className="border-t border-black p-4">

                      <div className="flex items-center justify-between gap-3">

                        <p className="text-[7px] uppercase opacity-55">
                          HoodWallet
                        </p>

                        <span
                          className={`border border-black px-2 py-1 text-[7px] uppercase ${
                            selectedWallet.active
                              ? "bg-black text-[#ccff00]"
                              : ""
                          }`}
                        >
                          {selectedWallet.active
                            ? "● Active"
                            : "○ Inactive"}
                        </span>

                      </div>

                      <a
                        href={
                          explorerAddress(
                            selectedWallet.walletAddress,
                          )
                        }

                        target="_blank"

                        rel="noreferrer"

                        className="mt-3 block break-all text-[8px] underline underline-offset-2"
                      >
                        {
                          selectedWallet.walletAddress
                        }
                      </a>

                    </div>

                    <div className="grid grid-cols-2 border-t border-black">

                      <div className="p-3">

                        <p className="text-[7px] uppercase opacity-55">
                          HoodWallet ETH
                        </p>

                        <p className="mt-2 text-xl">
                          {formatEth(
                            selectedWallet.nativeBalance,
                          )}
                        </p>

                      </div>

                      <div className="border-l border-black p-3">

                        <p className="text-[7px] uppercase opacity-55">
                          Network
                        </p>

                        <p className="mt-2 text-[9px] uppercase">
                          Robinhood
                        </p>

                      </div>

                    </div>

                    {!selectedWallet.active && (

                      <div className="border-t border-black bg-black p-4 text-[#ccff00]">

                        <p className="text-[8px] uppercase leading-relaxed">
                          MintOS requires an activated HoodWallet.
                        </p>

                        <Link
                          href="/hoodwallet"

                          className="mt-3 inline-block text-[8px] uppercase underline underline-offset-4"
                        >
                          Activate HoodWallet →
                        </Link>

                      </div>

                    )}

                  </>

                ) : null}

              </div>

            </aside>

            {/* MINT */}

            <section className="min-w-0">

              <div className="border border-black">

                <div className="flex items-center justify-between gap-3 border-b border-black px-4 py-3">

                  <p className="text-[8px] uppercase tracking-[0.14em]">
                    02 / OpenSea public mint
                  </p>

                  <span className="border border-black px-2 py-1 text-[6px] uppercase tracking-[0.12em]">
                    Robinhood Chain
                  </span>

                </div>

                <div className="p-4">

                  <label className="text-[7px] uppercase tracking-[0.14em] opacity-55">
                    OpenSea URL
                  </label>

                  <input
                    type="url"

                    spellCheck={
                      false
                    }

                    value={
                      openSeaUrl
                    }

                    onChange={(
                      event,
                    ) => {
                      setOpenSeaUrl(
                        event.target.value,
                      );

                      setResolvedNftContract(
                        "",
                      );

                      setResolvedCollectionName(
                        "",
                      );

                      setResolvedSlug(
                        "",
                      );

                      setResolvedChain(
                        "",
                      );

                      setDrop(
                        null,
                      );

                      setQuantity(
                        "1",
                      );

                      setError(
                        null,
                      );

                      setTxState({
                        pending:
                          false,

                        message:
                          "",
                      });
                    }}

                    placeholder="https://opensea.io/collection/..."

                    className="mt-2 w-full border border-black bg-transparent p-4 text-[10px] outline-none placeholder:text-black/35"
                  />

                  <p className="mt-2 text-[7px] uppercase leading-relaxed opacity-45">
                    Only Robinhood Chain OpenSea collections are supported.
                  </p>

                  <button
                    type="button"

                    disabled={
                      resolvingUrl ||
                      !openSeaUrl.trim()
                    }

                    onClick={() =>
                      void resolveOpenSeaUrl()
                    }

                    className="mt-3 w-full bg-black px-4 py-4 text-[9px] uppercase tracking-[0.16em] text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {resolvingUrl
                      ? "Finding collection…"
                      : "Find public mint"}
                  </button>

                  <button
                    type="button"
                    disabled={!openSeaUrl.trim()}
                    onClick={() => void shareCollection()}
                    className="mt-2 w-full border border-black px-4 py-4 text-[8px] uppercase tracking-[0.15em] disabled:opacity-30"
                  >
                    Share collection
                  </button>

                </div>

              </div>

              {/* RESOLVED */}

              {resolvedNftContract &&
                robinhoodResolved && (

                <div className="mt-4 border border-black">

                  <div className="flex items-center justify-between gap-3 border-b border-black px-4 py-3">

                    <p className="text-[8px] uppercase tracking-[0.14em]">
                      Collection found
                    </p>

                    <span className="bg-black px-2 py-1 text-[7px] uppercase text-[#ccff00]">
                      ● Robinhood
                    </span>

                  </div>

                  <div className="p-4">

                    <p className="text-2xl tracking-[-0.04em]">
                      {resolvedCollectionName ||
                        "OpenSea Collection"}
                    </p>

                    {resolvedSlug && (

                      <p className="mt-2 text-[7px] uppercase opacity-50">
                        {
                          resolvedSlug
                        }
                      </p>

                    )}

                    <div className="mt-4 border border-black p-3">

                      <p className="text-[7px] uppercase opacity-55">
                        NFT contract
                      </p>

                      <p className="mt-2 break-all text-[8px]">
                        {
                          resolvedNftContract
                        }
                      </p>

                    </div>

                    <button
                      type="button"

                      disabled={
                        dropLoading
                      }

                      onClick={() =>
                        void loadPublicDrop()
                      }

                      className="mt-3 w-full bg-black px-4 py-4 text-[9px] uppercase tracking-[0.16em] text-[#ccff00] disabled:opacity-30"
                    >
                      {dropLoading
                        ? "Reading SeaDrop…"
                        : "Load mint"}
                    </button>

                  </div>

                </div>

              )}

              {/* DROP */}

              {drop && (

                <div className="mt-4 border border-black">

                  <div className="flex items-center justify-between gap-4 border-b border-black px-4 py-3">

                    <p className="text-[8px] uppercase tracking-[0.14em]">
                      03 / Mint details
                    </p>

                    <span
                      className={`border border-black px-2 py-1 text-[7px] uppercase ${
                        drop.active
                          ? "bg-black text-[#ccff00]"
                          : ""
                      }`}
                    >
                      {drop.active
                        ? "● Public live"
                        : "○ Not active"}
                    </span>

                  </div>

                  <div className="p-4">

                    <div className="grid border-l border-t border-black sm:grid-cols-2">

                      <div className="border-b border-r border-black p-4">

                        <p className="text-[7px] uppercase opacity-55">
                          Collection
                        </p>

                        <p className="mt-2 text-2xl tracking-[-0.04em]">
                          {
                            drop.name
                          }
                        </p>

                        {drop.symbol && (

                          <p className="mt-1 text-[8px] uppercase opacity-50">
                            {
                              drop.symbol
                            }
                          </p>

                        )}

                      </div>

                      <div className="border-b border-r border-black p-4">

                        <p className="text-[7px] uppercase opacity-55">
                          Network
                        </p>

                        <p className="mt-2 text-[10px] uppercase">
                          Robinhood Chain
                        </p>

                      </div>

                      <div className="border-b border-r border-black p-4">

                        <p className="text-[7px] uppercase opacity-55">
                          Price each
                        </p>

                        <p className="mt-2 text-2xl tracking-[-0.04em]">
                          {drop.mintPrice ===
                          BigInt(0)
                            ? "FREE"
                            : `${formatEth(
                                drop.mintPrice,
                              )} ETH`}
                        </p>

                      </div>

                      <div className="border-b border-r border-black p-4">

                        <p className="text-[7px] uppercase opacity-55">
                          Wallet limit
                        </p>

                        <p className="mt-2 text-2xl">
                          {drop.maxTotalMintableByWallet >
                          0
                            ? drop.maxTotalMintableByWallet
                            : "—"}
                        </p>

                      </div>

                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">

                      <div className="border border-black p-3">

                        <p className="text-[7px] uppercase opacity-55">
                          Starts
                        </p>

                        <p className="mt-2 text-[8px]">
                          {formatDate(
                            drop.startTime,
                          )}
                        </p>

                      </div>

                      <div className="border border-black p-3">

                        <p className="text-[7px] uppercase opacity-55">
                          Ends
                        </p>

                        <p className="mt-2 text-[8px]">
                          {formatDate(
                            drop.endTime,
                          )}
                        </p>

                      </div>

                    </div>

                    <div className="mt-5">

                      <label className="text-[7px] uppercase tracking-[0.14em] opacity-55">
                        Quantity
                      </label>

                      <input
                        type="number"

                        min="1"

                        max={
                          drop.maxTotalMintableByWallet >
                          0
                            ? drop.maxTotalMintableByWallet
                            : undefined
                        }

                        step="1"

                        value={
                          quantity
                        }

                        onChange={(
                          event,
                        ) =>
                          setQuantity(
                            event.target.value,
                          )
                        }

                        className="mt-2 w-full border border-black bg-transparent p-4 text-2xl outline-none"
                      />

                    </div>

                    <div className="mt-5 border border-black">

                      <div className="border-b border-black px-3 py-2">

                        <p className="text-[7px] uppercase tracking-[0.14em] opacity-55">
                          Mint execution
                        </p>

                      </div>

                      <div className="grid sm:grid-cols-2">

                        <div className="border-b border-black p-3 sm:border-b-0 sm:border-r">

                          <p className="text-[7px] uppercase opacity-55">
                            Minter
                          </p>

                          <p className="mt-2 text-[11px] uppercase">
                            Hoodie #
                            {
                              selectedWallet
                                ?.tokenId ||
                              "—"
                            }
                          </p>

                          <p className="mt-2 break-all text-[7px] opacity-55">
                            {
                              selectedWallet
                                ?.walletAddress ||
                              "—"
                            }
                          </p>

                        </div>

                        <div className="p-3">

                          <p className="text-[7px] uppercase opacity-55">
                            Total mint price
                          </p>

                          <p className="mt-2 text-xl">
                            {totalMintPrice ===
                            BigInt(0)
                              ? "FREE"
                              : `${formatEth(
                                  totalMintPrice,
                                )} ETH`}
                          </p>

                          <p className="mt-2 text-[7px] uppercase opacity-55">
                            Paid from HoodWallet
                          </p>

                        </div>

                      </div>

                    </div>

                    <div className="mt-3 grid grid-cols-3 border border-black text-center">

                      <div className="p-3">

                        <p className="text-[7px] uppercase opacity-50">
                          01
                        </p>

                        <p className="mt-2 text-[8px] uppercase">
                          You sign
                        </p>

                      </div>

                      <div className="border-l border-black p-3">

                        <p className="text-[7px] uppercase opacity-50">
                          02
                        </p>

                        <p className="mt-2 text-[8px] uppercase">
                          Hoodie mints
                        </p>

                      </div>

                      <div className="border-l border-black p-3">

                        <p className="text-[7px] uppercase opacity-50">
                          03
                        </p>

                        <p className="mt-2 text-[8px] uppercase">
                          Hoodie owns
                        </p>

                      </div>

                    </div>

                    {selectedWallet &&
                      !hasEnoughMintEth && (

                      <div className="mt-3 bg-black p-4 text-[#ccff00]">

                        <p className="text-[8px] uppercase leading-relaxed">
                          HoodWallet #
                          {
                            selectedWallet.tokenId
                          }{" "}
                          needs{" "}
                          {formatEth(
                            totalMintPrice,
                          )}{" "}
                          ETH for this mint.
                        </p>

                        <p className="mt-2 text-[8px] uppercase leading-relaxed opacity-65">
                          Current balance:{" "}
                          {formatEth(
                            selectedWallet.nativeBalance,
                          )}{" "}
                          ETH
                        </p>

                      </div>

                    )}

                    {selectedWallet &&
                      !selectedWallet.active && (

                      <div className="mt-3 bg-black p-4 text-[#ccff00]">

                        <p className="text-[8px] uppercase leading-relaxed">
                          Activate HoodWallet #
                          {
                            selectedWallet.tokenId
                          }{" "}
                          before using MintOS.
                        </p>

                        <Link
                          href="/hoodwallet"

                          className="mt-3 inline-block text-[8px] uppercase underline underline-offset-4"
                        >
                          Open HoodWallet →
                        </Link>

                      </div>

                    )}

                    <button
                      type="button"

                      disabled={
                        !canMint
                      }

                      onClick={() =>
                        void mintAsHoodie()
                      }

                      className="mt-4 w-full bg-black px-4 py-6 text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-30"
                    >

                      <span className="block text-[11px] uppercase tracking-[0.18em]">

                        {txState.pending
                          ? "Minting…"
                          : selectedWallet
                            ? `Mint as Hoodie #${selectedWallet.tokenId}`
                            : "Mint as Hoodie"}

                      </span>

                      <span className="mx-auto mt-3 block max-w-lg text-[7px] uppercase leading-relaxed opacity-65">

                        Robinhood Chain only.
                        Your connected wallet pays network gas.
                        The HoodWallet pays the mint price.
                        The NFT is minted directly to the HoodWallet.

                      </span>

                    </button>

                  </div>

                </div>

              )}

              {txState.message && (

                <div className="mt-4 bg-black p-4 text-[#ccff00]">

                  <p className="text-[8px] uppercase leading-relaxed tracking-[0.08em]">
                    {
                      txState.message
                    }
                  </p>

                </div>

              )}

              {error && (

                <div className="mt-4 border border-black p-4">

                  <p className="text-[7px] uppercase tracking-[0.14em] opacity-50">
                    MintOS
                  </p>

                  <p className="mt-2 text-[9px] leading-relaxed">
                    {
                      error
                    }
                  </p>

                </div>

              )}

              <div className="mt-4 border border-black p-4">

                <div className="flex flex-wrap items-center gap-2">

                  <span className="border border-black px-2 py-1 text-[6px] uppercase tracking-[0.14em]">
                    MintOS V1
                  </span>

                  <span className="border border-black px-2 py-1 text-[6px] uppercase tracking-[0.14em]">
                    Robinhood Chain Only
                  </span>

                  <span className="border border-black px-2 py-1 text-[6px] uppercase tracking-[0.14em]">
                    SeaDrop Public
                  </span>

                </div>

                <p className="mt-4 max-w-2xl text-[9px] leading-relaxed opacity-65">

                  MintOS supports public OpenSea SeaDrop mints on
                  Robinhood Chain only. Ethereum, Base, Arbitrum
                  and other networks are rejected. Allowlist,
                  signed, token-gated and custom contract mints
                  are intentionally not supported in V1.

                </p>

              </div>

            </section>

          </div>

        )}

      </section>

      <SiteFooter />

    </main>
  );
}