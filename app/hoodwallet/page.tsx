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

import {
  Contract,
  Interface,
  JsonRpcProvider,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
} from "ethers";

import type {
  Address,
  Hex,
} from "viem";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";

import { siteConfig } from "../../lib/config";

import {
  apiConfig,
  collectionApiUrl,
} from "../../lib/api";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

const NATIVE_SYMBOL =
  "ETH";

const NATIVE_NAME =
  "Native Balance";

const OPERATION_CALL =
  0;

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";

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

  "function activationCost() view returns (uint256)",

  "function activationEnabled() view returns (bool)",

  "function activate(uint256 tokenId)",
] as const;

const OCH_READ_ABI = [
  "function balanceOf(address account) view returns (uint256)",

  "function allowance(address owner,address spender) view returns (uint256)",
] as const;

const REWARDS_ABI = [
  "function everActivated(uint256 tokenId) view returns (bool)",

  "function hasClaimed(uint256 tokenId) view returns (bool)",

  "function rewardAvailable(uint256 tokenId) view returns (bool)",

  "function canClaim(uint256 tokenId) view returns (bool)",

  "function claim(uint256 tokenId)",
] as const;

const PING_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
] as const;

const ERC20_INTERFACE =
  new Interface([
    "function transfer(address to,uint256 amount) returns (bool)",
  ]);

const ERC721_INTERFACE =
  new Interface([
    "function safeTransferFrom(address from,address to,uint256 tokenId)",
  ]);

const ERC1155_INTERFACE =
  new Interface([
    "function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)",
  ]);

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

type HoodWalletAsset = {
  symbol: string;

  name: string;

  balanceRaw: bigint;

  balanceFormatted: string;

  contract?: string;

  decimals: number;

  kind:
    | "native"
    | "erc20";

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

  kind:
    | "erc721"
    | "erc1155";

  trusted: boolean;

  spam: boolean;

  spamClassifications:
    string[];
};

type HoodWalletState = {
  tokenId: string;

  owner: string;

  walletAddress: string;

  walletDeployed:
    boolean;

  active:
    boolean;

  activationOwner:
    string;

  activatedAt:
    bigint;

  walletState:
    bigint;

  nativeBalance:
    bigint;

  ochBalance:
    bigint;

  pingEverActivated:
    boolean;

  pingClaimed:
    boolean;

  pingAvailable:
    boolean;

  pingCanClaim:
    boolean;
};

type InventoryResponse = {
  assets?: Array<{
    symbol: string;

    name: string;

    balanceRaw: string;

    balanceFormatted: string;

    contract?: string;

    decimals: number;

    kind: "erc20";

    trusted?: boolean;
  }>;

  nfts?: Array<{
    contract: string;

    tokenId: string;

    name: string;

    collectionName: string;

    symbol?: string;

    image?: string;

    balance: string;

    kind:
      | "erc721"
      | "erc1155";

    trusted?: boolean;

    spam?: boolean;

    spamClassifications?:
      string[];
  }>;

  warning?: string;

  error?: string;
};

type TxAction =
  | "activate"
  | "claim"
  | "send"
  | "send-nft"
  | null;

type TxState = {
  action:
    TxAction;

  message:
    string;
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

function formatBalance(
  value: bigint,
  decimals = 18,
  maxDecimals = 6,
) {
  const formatted =
    formatUnits(
      value,
      decimals,
    );

  const [
    whole,
    fraction = "",
  ] =
    formatted.split(".");

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

function explorerToken(
  address: string,
) {
  return `${siteConfig.explorerUrl.replace(
    /\/$/,
    "",
  )}/token/${address}`;
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

function assetKey(
  asset:
    HoodWalletAsset,
) {
  if (
    asset.kind ===
    "native"
  ) {
    return "native";
  }

  return (
    asset.contract
      ?.toLowerCase() ||
    `${asset.symbol}:${asset.name}`
  );
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
    useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-[#ccff00]">

        <p className="text-[9px] uppercase tracking-[0.15em]">
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
        `OnChainHoodies #${hoodie.tokenId}`
      }

      width={768}

      height={768}

      onError={() =>
        setFailed(
          true,
        )
      }

      className="h-full w-full object-cover"
    />
  );
}

function NftArtwork({
  nft,
}: {
  nft:
    HoodWalletNft;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(false);

  if (
    !nft.image ||
    failed
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-3 text-center text-[#ccff00]">

        <p className="text-[8px] uppercase tracking-[0.14em]">
          {
            nft.collectionName
          }

          <br />

          #
          {
            nft.tokenId
          }
        </p>

      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={
        nft.image.startsWith("ipfs://")
          ? `https://ipfs.io/ipfs/${nft.image.slice("ipfs://".length)}`
          : nft.image
      }

      alt={
        nft.name
      }

      loading="lazy"

      referrerPolicy="no-referrer"

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

export default function HoodWalletPage() {
  const {
    address,
    connect,
    ensureRequiredNetwork,
    getWalletClient,
  } =
    useWallet();

  /*//////////////////////////////////////////////////////////////
                        OWNERSHIP STATE
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
    useState(false);

  const [
    ownershipChecked,
    setOwnershipChecked,
  ] =
    useState(false);

  const [
    stateLoading,
    setStateLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    darkHood,
    setDarkHood,
  ] =
    useState(false);

  /*//////////////////////////////////////////////////////////////
                        OWNER ECONOMY
  //////////////////////////////////////////////////////////////*/

  const [
    activationCost,
    setActivationCost,
  ] =
    useState<bigint>(
      BigInt(0),
    );

  const [
    activationEnabled,
    setActivationEnabled,
  ] =
    useState(false);

  const [
    ownerOCHBalance,
    setOwnerOCHBalance,
  ] =
    useState<bigint>(
      BigInt(0),
    );

  const [
    ownerAllowance,
    setOwnerAllowance,
  ] =
    useState<bigint>(
      BigInt(0),
    );

  /*//////////////////////////////////////////////////////////////
                        INVENTORY STATE
  //////////////////////////////////////////////////////////////*/

  const [
    inventoryAssets,
    setInventoryAssets,
  ] =
    useState<
      HoodWalletAsset[]
    >([]);

  const [
    inventoryNfts,
    setInventoryNfts,
  ] =
    useState<
      HoodWalletNft[]
    >([]);

  const [
    inventoryLoading,
    setInventoryLoading,
  ] =
    useState(false);

  const [
    inventoryLoaded,
    setInventoryLoaded,
  ] =
    useState(false);

  const [
    trustedOnly,
    setTrustedOnly,
  ] =
    useState(true);

  /*//////////////////////////////////////////////////////////////
                         TOKEN SEND STATE
  //////////////////////////////////////////////////////////////*/

  const [
    sendAssetKey,
    setSendAssetKey,
  ] =
    useState("och");

  const [
    sendRecipient,
    setSendRecipient,
  ] =
    useState("");

  const [
    sendAmount,
    setSendAmount,
  ] =
    useState("");

  /*//////////////////////////////////////////////////////////////
                          NFT SEND STATE
  //////////////////////////////////////////////////////////////*/

  const [
    selectedNftToSend,
    setSelectedNftToSend,
  ] =
    useState<
      HoodWalletNft | null
    >(null);

  const [
    nftRecipient,
    setNftRecipient,
  ] =
    useState("");

  const [
    nftAmount,
    setNftAmount,
  ] =
    useState("1");

  /*//////////////////////////////////////////////////////////////
                         TRANSACTION STATE
  //////////////////////////////////////////////////////////////*/

  const [
    txState,
    setTxState,
  ] =
    useState<TxState>({
      action:
        null,

      message:
        "",
    });

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
          staticNetwork:
            true,
        },
      );
    }, []);

  /*//////////////////////////////////////////////////////////////
                         OWNERSHIP LOAD
  //////////////////////////////////////////////////////////////*/

  const loadOwnership =
    useCallback(
      async () => {
        if (
          !address
        ) {
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
                   OWNER BALANCE + ALLOWANCE
  //////////////////////////////////////////////////////////////*/

  const refreshOwnerEconomy =
    useCallback(
      async () => {
        if (
          !address ||
          !provider
        ) {
          return;
        }

        const hoodOS =
          new Contract(
            siteConfig.hoodOSAddress,

            HOOD_OS_ABI,

            provider,
          );

        const och =
          new Contract(
            siteConfig.ochAddress,

            OCH_READ_ABI,

            provider,
          );

        /*
         * Sequential intentionally.
         */

        const cost =
          (await hoodOS.activationCost()) as
            bigint;

        const enabled =
          (await hoodOS.activationEnabled()) as
            boolean;

        const balance =
          (await och.balanceOf(
            address,
          )) as bigint;

        const allowance =
          (await och.allowance(
            address,

            siteConfig.hoodOSAddress,
          )) as bigint;

        setActivationCost(
          cost,
        );

        setActivationEnabled(
          enabled,
        );

        setOwnerOCHBalance(
          balance,
        );

        setOwnerAllowance(
          allowance,
        );
      },
      [
        address,
        provider,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                    LOAD SELECTED WALLET
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

        setStateLoading(
          true,
        );

        setError(null);

        /*
         * Selecting / refreshing a Hoodie
         * NEVER scans arbitrary assets.
         */

        setInventoryAssets(
          [],
        );

        setInventoryNfts(
          [],
        );

        setInventoryLoaded(
          false,
        );

        setSelectedNftToSend(
          null,
        );

        try {
          const tokenId =
            BigInt(
              tokenIdText,
            );

          const hoodOS =
            new Contract(
              siteConfig.hoodOSAddress,

              HOOD_OS_ABI,

              provider,
            );

          const rewards =
            new Contract(
              siteConfig.pingRewardVaultAddress,

              REWARDS_ABI,

              provider,
            );

          await refreshOwnerEconomy();

          const info =
            await hoodOS.hoodInfo(
              tokenId,
            );

          const pingEverActivated =
            (await rewards.everActivated(
              tokenId,
            )) as boolean;

          const pingClaimed =
            (await rewards.hasClaimed(
              tokenId,
            )) as boolean;

          const pingAvailable =
            (await rewards.rewardAvailable(
              tokenId,
            )) as boolean;

          const pingCanClaim =
            (await rewards.canClaim(
              tokenId,
            )) as boolean;

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

            activationOwner:
              String(
                info.activationOwner,
              ),

            activatedAt:
              BigInt(
                info.activatedAt,
              ),

            walletState:
              BigInt(
                info.walletState,
              ),

            nativeBalance:
              BigInt(
                info.nativeBalance,
              ),

            ochBalance:
              BigInt(
                info.paymentTokenBalance,
              ),

            pingEverActivated,

            pingClaimed,

            pingAvailable,

            pingCanClaim,
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
          setStateLoading(
            false,
          );
        }
      },
      [
        address,
        provider,
        refreshOwnerEconomy,
        selectedTokenId,
      ],
    );

  /*
   * Hoodie selection loads
   * lightweight state only.
   */

  useEffect(() => {
    if (
      !selectedTokenId ||
      !address
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
                       MANUAL INVENTORY
  //////////////////////////////////////////////////////////////*/

  const loadInventory =
    useCallback(
      async () => {
        if (
          !selectedWallet ||
          !provider
        ) {
          return;
        }

        if (
          inventoryLoading
        ) {
          return;
        }

        setInventoryLoading(
          true,
        );

        setError(null);

        try {
          const params =
            new URLSearchParams({
              address:
                selectedWallet.walletAddress,
            });

          /*
           * This is the ONLY arbitrary
           * inventory request.
           */

          const response =
            await fetch(
              `/api/hoodwallet/assets?${params.toString()}`,

              {
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
              InventoryResponse;

          if (
            !response.ok
          ) {
            throw new Error(
              payload.error ||
                "Unable to load HoodWallet inventory.",
            );
          }

          const assets:
            HoodWalletAsset[] =
            [];

          for (
            const rawAsset of
            payload.assets ||
            []
          ) {
            try {
              const balanceRaw =
                BigInt(
                  rawAsset.balanceRaw,
                );

              if (
                balanceRaw <=
                BigInt(0)
              ) {
                continue;
              }

              /*
               * OCH already exists
               * in lightweight state.
               */

              if (
                rawAsset.contract &&
                sameAddress(
                  rawAsset.contract,

                  siteConfig.ochAddress,
                )
              ) {
                continue;
              }

              assets.push({
                symbol:
                  rawAsset.symbol,

                name:
                  rawAsset.name,

                balanceRaw,

                balanceFormatted:
                  rawAsset.balanceFormatted,

                contract:
                  rawAsset.contract,

                decimals:
                  rawAsset.decimals,

                kind:
                  "erc20",

                trusted:
                  rawAsset.trusted ===
                  true,
              });
            } catch {
              continue;
            }
          }

          const nfts:
            HoodWalletNft[] =
            (
              payload.nfts ||
              []
            ).map(
              (
                rawNft,
              ) => ({
                contract:
                  rawNft.contract,

                tokenId:
                  String(
                    rawNft.tokenId,
                  ),

                name:
                  rawNft.name ||
                  `NFT #${rawNft.tokenId}`,

                collectionName:
                  rawNft.collectionName ||
                  "NFT",

                symbol:
                  rawNft.symbol,

                image:
                  rawNft.image,

                balance:
                  rawNft.balance ||
                  "1",

                kind:
                  rawNft.kind,

                trusted:
                  rawNft.trusted ===
                  true,

                spam:
                  rawNft.spam ===
                  true,

                spamClassifications:
                  rawNft.spamClassifications ||
                  [],
              }),
            );

          /*////////////////////////////////////////////////////////
                       DIRECT PING CHECK

            Ping #N should belong to
            HoodWallet #N.

            Do not depend only on
            indexer freshness.
          ////////////////////////////////////////////////////////*/

          try {
            const ping =
              new Contract(
                siteConfig.pingAddress,

                PING_ABI,

                provider,
              );

            const pingOwner =
              String(
                await ping.ownerOf(
                  BigInt(
                    selectedWallet.tokenId,
                  ),
                ),
              );

            if (
              sameAddress(
                pingOwner,

                selectedWallet.walletAddress,
              )
            ) {
              const alreadyPresent =
                nfts.some(
                  (
                    nft,
                  ) =>
                    sameAddress(
                      nft.contract,

                      siteConfig.pingAddress,
                    ) &&
                    nft.tokenId ===
                      selectedWallet.tokenId,
                );

              if (
                !alreadyPresent
              ) {
                nfts.unshift({
                  contract:
                    siteConfig.pingAddress,

                  tokenId:
                    selectedWallet.tokenId,

                  name:
                    `Ping #${selectedWallet.tokenId}`,

                  collectionName:
                    "Ping",

                  symbol:
                    "PING",

                  balance:
                    "1",

                  kind:
                    "erc721",

                  trusted:
                    true,

                  spam:
                    false,

                  spamClassifications:
                    [],
                });
              }
            }
          } catch (
            pingError
          ) {
            console.debug(
              "Direct Ping ownership check unavailable.",

              pingError,
            );
          }

          setInventoryAssets(
            assets,
          );

          setInventoryNfts(
            nfts,
          );

          setInventoryLoaded(
            true,
          );

          if (
            payload.warning
          ) {
            console.warn(
              payload.warning,
            );
          }
        } catch (
          inventoryError
        ) {
          console.error(
            inventoryError,
          );

          setError(
            errorMessage(
              inventoryError,

              "Unable to load token + NFT inventory.",
            ),
          );
        } finally {
          setInventoryLoading(
            false,
          );
        }
      },
      [
        inventoryLoading,
        provider,
        selectedWallet,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                      WAIT FOR TRANSACTION
  //////////////////////////////////////////////////////////////*/

  const waitForHash =
    useCallback(
      async (
        hash: string,
      ) => {
        if (
          !provider
        ) {
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
          !receipt
        ) {
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
                    SINGLE ACTIVATION FLOW
  //////////////////////////////////////////////////////////////*/

  const activateHoodWallet =
    useCallback(
      async () => {
        if (
          !address
        ) {
          await connect();

          return;
        }

        if (
          !selectedWallet
        ) {
          return;
        }

        if (
          selectedWallet.active
        ) {
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
          !activationEnabled
        ) {
          setError(
            "HoodWallet activation is currently disabled.",
          );

          return;
        }

        if (
          ownerOCHBalance <
          activationCost
        ) {
          setError(
            `You need ${formatBalance(
              activationCost,
            )} OCH to activate this HoodWallet.`,
          );

          return;
        }

        try {
          setError(null);

          setTxState({
            action:
              "activate",

            message:
              "Preparing HoodWallet activation…",
          });

          await ensureRequiredNetwork();

          const walletClient =
            await getWalletClient();

          /*
           * Authorization step is hidden
           * behind the one activation flow.
           */

          if (
            ownerAllowance <
            activationCost
          ) {
            setTxState({
              action:
                "activate",

              message:
                `Authorize ${formatBalance(
                  activationCost,
                )} OCH in your wallet. Activation will continue automatically afterward.`,
            });

            const approvalHash =
              await walletClient.writeContract({
                chain: null,
                address:
                  siteConfig.ochAddress as Address,

                abi: [
                  {
                    type:
                      "function",

                    name:
                      "approve",

                    stateMutability:
                      "nonpayable",

                    inputs: [
                      {
                        name:
                          "spender",

                        type:
                          "address",
                      },

                      {
                        name:
                          "amount",

                        type:
                          "uint256",
                      },
                    ],

                    outputs: [
                      {
                        name:
                          "",

                        type:
                          "bool",
                      },
                    ],
                  },
                ] as const,

                functionName:
                  "approve",

                args: [
                  siteConfig.hoodOSAddress as Address,

                  activationCost,
                ],

                account:
                  requireWalletAccount(
                    walletClient.account,
                  ),
              });

            setTxState({
              action:
                "activate",

              message:
                `OCH authorization submitted ${shortAddress(
                  approvalHash,
                )}. Waiting for confirmation…`,
            });

            await waitForHash(
              approvalHash,
            );

            const och =
              new Contract(
                siteConfig.ochAddress,

                OCH_READ_ABI,

                provider,
              );

            const freshAllowance =
              (await och.allowance(
                address,

                siteConfig.hoodOSAddress,
              )) as bigint;

            if (
              freshAllowance <
              activationCost
            ) {
              throw new Error(
                "OCH authorization confirmed but allowance is still below the activation cost.",
              );
            }

            setOwnerAllowance(
              freshAllowance,
            );

            setTxState({
              action:
                "activate",

              message:
                "OCH authorized. Confirm HoodWallet activation.",
            });
          }

          const activationHash =
            await walletClient.writeContract({
                chain: null,
              address:
                siteConfig.hoodOSAddress as Address,

              abi: [
                {
                  type:
                    "function",

                  name:
                    "activate",

                  stateMutability:
                    "nonpayable",

                  inputs: [
                    {
                      name:
                        "tokenId",

                      type:
                        "uint256",
                    },
                  ],

                  outputs:
                    [],
                },
              ] as const,

              functionName:
                "activate",

              args: [
                BigInt(
                  selectedWallet.tokenId,
                ),
              ],

              account:
                requireWalletAccount(
                  walletClient.account,
                ),
            });

          setTxState({
            action:
              "activate",

            message:
              `Activation submitted ${shortAddress(
                activationHash,
              )}. Waiting for confirmation…`,
          });

          await waitForHash(
            activationHash,
          );

          await loadSelectedWallet(
            selectedWallet.tokenId,
          );

          await refreshOwnerEconomy();

          setTxState({
            action:
              null,

            message:
              `HoodWallet #${selectedWallet.tokenId} activated successfully.`,
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

              "HoodWallet activation failed.",
            );

          setTxState({
            action:
              null,

            message,
          });

          setError(
            message,
          );
        }
      },
      [
        activationCost,
        activationEnabled,
        address,
        connect,
        ensureRequiredNetwork,
        getWalletClient,
        loadSelectedWallet,
        ownerAllowance,
        ownerOCHBalance,
        provider,
        refreshOwnerEconomy,
        selectedWallet,
        waitForHash,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                          CLAIM PING
  //////////////////////////////////////////////////////////////*/

  const claimPing =
    useCallback(
      async () => {
        if (
          !selectedWallet
        ) {
          return;
        }

        if (
          selectedWallet.pingClaimed
        ) {
          return;
        }

        if (
          !selectedWallet.pingCanClaim
        ) {
          setError(
            "Ping is not currently claimable.",
          );

          return;
        }

        try {
          setError(null);

          setTxState({
            action:
              "claim",

            message:
              `Preparing Ping #${selectedWallet.tokenId} claim…`,
          });

          await ensureRequiredNetwork();

          const walletClient =
            await getWalletClient();

          const hash =
            await walletClient.writeContract({
                chain: null,
              address:
                siteConfig.pingRewardVaultAddress as Address,

              abi: [
                {
                  type:
                    "function",

                  name:
                    "claim",

                  stateMutability:
                    "nonpayable",

                  inputs: [
                    {
                      name:
                        "tokenId",

                      type:
                        "uint256",
                    },
                  ],

                  outputs:
                    [],
                },
              ] as const,

              functionName:
                "claim",

              args: [
                BigInt(
                  selectedWallet.tokenId,
                ),
              ],

              account:
                requireWalletAccount(
                  walletClient.account,
                ),
            });

          setTxState({
            action:
              "claim",

            message:
              `Ping claim submitted ${shortAddress(
                hash,
              )}.`,
          });

          await waitForHash(
            hash,
          );

          await loadSelectedWallet(
            selectedWallet.tokenId,
          );

          /*
           * Inventory is intentionally
           * NOT rescanned automatically.
           */

          setInventoryLoaded(
            false,
          );

          setInventoryAssets(
            [],
          );

          setInventoryNfts(
            [],
          );

          setSelectedNftToSend(
            null,
          );

          setTxState({
            action:
              null,

            message:
              `Ping #${selectedWallet.tokenId} claimed. Load the inventory below to display it.`,
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

              "Ping claim failed.",
            );

          setTxState({
            action:
              null,

            message,
          });

          setError(
            message,
          );
        }
      },
      [
        ensureRequiredNetwork,
        getWalletClient,
        loadSelectedWallet,
        selectedWallet,
        waitForHash,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                     CORE SENDABLE ASSETS
  //////////////////////////////////////////////////////////////*/

  const coreAssets =
    useMemo(() => {
      if (
        !selectedWallet
      ) {
        return [];
      }

      const assets:
        HoodWalletAsset[] =
        [];

      assets.push({
        symbol:
          "OCH",

        name:
          "OnChainHoodies",

        balanceRaw:
          selectedWallet.ochBalance,

        balanceFormatted:
          formatBalance(
            selectedWallet.ochBalance,
          ),

        contract:
          siteConfig.ochAddress,

        decimals:
          18,

        kind:
          "erc20",

        trusted:
          true,
      });

      assets.push({
        symbol:
          NATIVE_SYMBOL,

        name:
          NATIVE_NAME,

        balanceRaw:
          selectedWallet.nativeBalance,

        balanceFormatted:
          formatBalance(
            selectedWallet.nativeBalance,
          ),

        decimals:
          18,

        kind:
          "native",

        trusted:
          true,
      });

      return assets;
    }, [
      selectedWallet,
    ]);

  /*
   * SECURITY:
   *
   * Untrusted ERC20s can be DISPLAYED
   * in the All inventory view.
   *
   * They can NEVER enter this
   * transaction selector.
   */

  const sendableAssets =
    useMemo(
      () => [
        ...coreAssets,

        ...inventoryAssets.filter(
          (
            asset,
          ) =>
            asset.trusted ===
            true,
        ),
      ],
      [
        coreAssets,
        inventoryAssets,
      ],
    );

  const selectedSendAsset =
    useMemo(
      () =>
        sendableAssets.find(
          (
            asset,
          ) =>
            assetKey(
              asset,
            ) ===
            sendAssetKey,
        ) ||
        sendableAssets[0],
      [
        sendAssetKey,
        sendableAssets,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                  SEND TOKEN / ETH FROM WALLET
  //////////////////////////////////////////////////////////////*/

  const sendFromWallet =
    useCallback(
      async () => {
        if (
          !selectedWallet ||
          !selectedSendAsset ||
          !address
        ) {
          return;
        }

        /*
         * SECURITY BACKSTOP.
         *
         * Never transact with an
         * untrusted arbitrary ERC20.
         */

        if (
          selectedSendAsset.kind ===
            "erc20" &&
          !selectedSendAsset.trusted
        ) {
          setError(
            "Untrusted tokens cannot be sent through the HoodWallet interface.",
          );

          return;
        }

        if (
          !selectedWallet.active
        ) {
          setError(
            "Activate HoodWallet before sending.",
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

        const recipient =
          sendRecipient.trim();

        if (
          !isAddress(
            recipient,
          )
        ) {
          setError(
            "Invalid recipient address.",
          );

          return;
        }

        if (
          sameAddress(
            recipient,

            ZERO_ADDRESS,
          )
        ) {
          setError(
            "Cannot send to the zero address.",
          );

          return;
        }

        let amountWei:
          bigint;

        try {
          amountWei =
            parseUnits(
              sendAmount.trim(),

              selectedSendAsset.decimals,
            );
        } catch {
          setError(
            "Invalid amount.",
          );

          return;
        }

        if (
          amountWei <=
          BigInt(0)
        ) {
          setError(
            "Amount must be greater than zero.",
          );

          return;
        }

        if (
          amountWei >
          selectedSendAsset.balanceRaw
        ) {
          setError(
            `Insufficient ${selectedSendAsset.symbol} balance.`,
          );

          return;
        }

        let target:
          Address;

        let value:
          bigint;

        let data:
          Hex;

        if (
          selectedSendAsset.kind ===
          "native"
        ) {
          target =
            getAddress(
              recipient,
            ) as Address;

          value =
            amountWei;

          data =
            "0x";
        } else {
          if (
            !selectedSendAsset.contract
          ) {
            setError(
              "Token contract unavailable.",
            );

            return;
          }

          target =
            getAddress(
              selectedSendAsset.contract,
            ) as Address;

          value =
            BigInt(0);

          data =
            ERC20_INTERFACE.encodeFunctionData(
              "transfer",

              [
                getAddress(
                  recipient,
                ),

                amountWei,
              ],
            ) as Hex;
        }

        try {
          setError(null);

          setTxState({
            action:
              "send",

            message:
              `Preparing ${selectedSendAsset.symbol} transfer…`,
          });

          await ensureRequiredNetwork();

          const walletClient =
            await getWalletClient();

          const hash =
            await walletClient.writeContract({
                chain: null,
              address:
                selectedWallet.walletAddress as Address,

              abi: [
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
              ] as const,

              functionName:
                "execute",

              args: [
                target,

                value,

                data,

                OPERATION_CALL,
              ],

              value:
                BigInt(0),

              account:
                requireWalletAccount(
                  walletClient.account,
                ),
            });

          setTxState({
            action:
              "send",

            message:
              `Transfer submitted ${shortAddress(
                hash,
              )}.`,
          });

          await waitForHash(
            hash,
          );

          await loadSelectedWallet(
            selectedWallet.tokenId,
          );

          setInventoryLoaded(
            false,
          );

          setInventoryAssets(
            [],
          );

          setInventoryNfts(
            [],
          );

          setSelectedNftToSend(
            null,
          );

          setSendAmount(
            "",
          );

          setSendRecipient(
            "",
          );

          setTxState({
            action:
              null,

            message:
              `${selectedSendAsset.symbol} transfer confirmed.`,
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

              "Transfer failed.",
            );

          setTxState({
            action:
              null,

            message,
          });

          setError(
            message,
          );
        }
      },
      [
        address,
        ensureRequiredNetwork,
        getWalletClient,
        loadSelectedWallet,
        selectedSendAsset,
        selectedWallet,
        sendAmount,
        sendRecipient,
        waitForHash,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                     SEND NFT FROM WALLET
  //////////////////////////////////////////////////////////////*/

  const sendNftFromWallet =
    useCallback(
      async () => {
        if (
          !selectedWallet ||
          !selectedNftToSend ||
          !address
        ) {
          return;
        }

        if (
          !selectedWallet.active
        ) {
          setError(
            "Activate HoodWallet before sending NFTs.",
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

        const recipient =
          nftRecipient.trim();

        if (
          !isAddress(
            recipient,
          )
        ) {
          setError(
            "Invalid NFT recipient address.",
          );

          return;
        }

        if (
          sameAddress(
            recipient,

            ZERO_ADDRESS,
          )
        ) {
          setError(
            "Cannot send an NFT to the zero address.",
          );

          return;
        }

        if (
          !isAddress(
            selectedNftToSend.contract,
          )
        ) {
          setError(
            "Invalid NFT contract.",
          );

          return;
        }

        const target =
          getAddress(
            selectedNftToSend.contract,
          ) as Address;

        let data:
          Hex;

        if (
          selectedNftToSend.kind ===
          "erc721"
        ) {
          data =
            ERC721_INTERFACE.encodeFunctionData(
              "safeTransferFrom",

              [
                getAddress(
                  selectedWallet.walletAddress,
                ),

                getAddress(
                  recipient,
                ),

                BigInt(
                  selectedNftToSend.tokenId,
                ),
              ],
            ) as Hex;
        } else {
          let amount:
            bigint;

          try {
            amount =
              BigInt(
                nftAmount.trim(),
              );
          } catch {
            setError(
              "Invalid ERC-1155 amount.",
            );

            return;
          }

          if (
            amount <=
            BigInt(0)
          ) {
            setError(
              "NFT amount must be greater than zero.",
            );

            return;
          }

          let available =
            BigInt(1);

          try {
            available =
              BigInt(
                selectedNftToSend.balance ||
                "1",
              );
          } catch {
            available =
              BigInt(1);
          }

          if (
            amount >
            available
          ) {
            setError(
              `Only ${available.toString()} available.`,
            );

            return;
          }

          data =
            ERC1155_INTERFACE.encodeFunctionData(
              "safeTransferFrom",

              [
                getAddress(
                  selectedWallet.walletAddress,
                ),

                getAddress(
                  recipient,
                ),

                BigInt(
                  selectedNftToSend.tokenId,
                ),

                amount,

                "0x",
              ],
            ) as Hex;
        }

        try {
          setError(null);

          setTxState({
            action:
              "send-nft",

            message:
              `Preparing ${selectedNftToSend.name} transfer…`,
          });

          await ensureRequiredNetwork();

          const walletClient =
            await getWalletClient();

          const hash =
            await walletClient.writeContract({
                chain: null,
              address:
                selectedWallet.walletAddress as Address,

              abi: [
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
              ] as const,

              functionName:
                "execute",

              args: [
                target,

                BigInt(0),

                data,

                OPERATION_CALL,
              ],

              value:
                BigInt(0),

              account:
                requireWalletAccount(
                  walletClient.account,
                ),
            });

          setTxState({
            action:
              "send-nft",

            message:
              `NFT transfer submitted ${shortAddress(
                hash,
              )}.`,
          });

          await waitForHash(
            hash,
          );

          await loadSelectedWallet(
            selectedWallet.tokenId,
          );

          /*
           * Do not automatically rescan
           * inventory after NFT transfer.
           */

          setInventoryLoaded(
            false,
          );

          setInventoryAssets(
            [],
          );

          setInventoryNfts(
            [],
          );

          setSelectedNftToSend(
            null,
          );

          setNftRecipient(
            "",
          );

          setNftAmount(
            "1",
          );

          setTxState({
            action:
              null,

            message:
              `${selectedNftToSend.name} sent successfully. Reload inventory to refresh the NFT list.`,
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

              "NFT transfer failed.",
            );

          setTxState({
            action:
              null,

            message,
          });

          setError(
            message,
          );
        }
      },
      [
        address,
        ensureRequiredNetwork,
        getWalletClient,
        loadSelectedWallet,
        nftAmount,
        nftRecipient,
        selectedNftToSend,
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

  const ownerHasEnough =
    ownerOCHBalance >=
    activationCost;

  const processing =
    txState.action !==
    null;

  const visibleInventoryAssets =
    inventoryAssets.filter(
      (
        asset,
      ) =>
        !trustedOnly ||
        asset.trusted,
    );

  const visibleInventoryNfts =
    inventoryNfts.filter(
      (
        nft,
      ) =>
        !trustedOnly ||
        nft.trusted,
    );

  /*//////////////////////////////////////////////////////////////
                               UI
  //////////////////////////////////////////////////////////////*/

  return (
    <main
      className="min-h-screen bg-[var(--hood-bg)] text-[var(--hood-fg)]"

      style={
        {
          "--hood-bg":
            darkHood
              ? "#000000"
              : "#ccff00",

          "--hood-fg":
            darkHood
              ? "#ccff00"
              : "#000000",
        } as CSSProperties
      }
    >
      <SiteHeader />

      <section className="mx-auto max-w-[1400px] px-4 pb-24 pt-20 md:px-6 md:pt-24">

        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-[var(--hood-fg)] pb-3">

          <p className="text-[9px] uppercase tracking-[0.16em]">
            HoodWallet /
            ERC-6551
          </p>

          <div className="flex gap-4">

            <button
              type="button"

              onClick={() =>
                setDarkHood(
                  (
                    current,
                  ) =>
                    !current,
                )
              }

              className="text-[9px] uppercase"
            >
              {darkHood
                ? "Lights on"
                : "Lights off"}
            </button>

            <Link
              href="/"

              className="text-[9px] uppercase"
            >
              Back
            </Link>

          </div>

        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">

          {/* SIDEBAR */}

          <aside className="lg:sticky lg:top-20 lg:self-start">

            <p className="text-[8px] uppercase tracking-[0.18em] opacity-60">
              Hoodie infrastructure
            </p>

            <h1 className="mt-3 text-5xl leading-[0.85] tracking-[-0.06em]">
              HOOD
              <br />
              WALLET
            </h1>

            <p className="mt-5 text-sm leading-relaxed opacity-70">
              One Hoodie.
              One deterministic
              on-chain wallet.
            </p>

            {!address ? (

              <button
                type="button"

                onClick={() =>
                  void connect()
                }

                className="mt-6 w-full border border-[var(--hood-fg)] px-4 py-4 text-[9px] uppercase tracking-[0.15em]"
              >
                Connect wallet
              </button>

            ) : (

              <>

                {/* EVM OWNER */}

                <div className="mt-6 border border-[var(--hood-fg)]">

                  <div className="border-b border-[var(--hood-fg)] px-3 py-2">

                    <p className="text-[7px] uppercase tracking-[0.14em] opacity-60">
                      Connected EVM wallet
                    </p>

                  </div>

                  <div className="p-3">

                    <p className="break-all text-[9px]">
                      {
                        address
                      }
                    </p>

                  </div>

                  <div className="border-t border-[var(--hood-fg)] p-3">

                    <p className="text-[7px] uppercase tracking-[0.14em] opacity-60">
                      EVM wallet OCH
                    </p>

                    <p className="mt-2 text-3xl tracking-[-0.05em]">
                      {formatBalance(
                        ownerOCHBalance,
                      )}
                    </p>

                    <p className="mt-1 text-[8px] uppercase">
                      OCH
                    </p>

                  </div>

                </div>

                {/* HOODIE SELECT */}

                <div className="mt-3 border border-[var(--hood-fg)]">

                  <div className="border-b border-[var(--hood-fg)] px-3 py-2">

                    <p className="text-[7px] uppercase tracking-[0.14em] opacity-60">
                      Select Hoodie
                    </p>

                  </div>

                  <div className="p-3">

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

                        setSelectedNftToSend(
                          null,
                        );

                        setSelectedTokenId(
                          event
                            .target
                            .value,
                        );
                      }}

                      className="w-full border border-[var(--hood-fg)] bg-[var(--hood-bg)] px-3 py-3 text-[10px] uppercase text-[var(--hood-fg)] outline-none"
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

                </div>

                {selectedWallet && (

                  <button
                    type="button"

                    disabled={
                      stateLoading
                    }

                    onClick={() =>
                      void loadSelectedWallet()
                    }

                    className="mt-3 w-full border border-[var(--hood-fg)] px-4 py-3 text-[8px] uppercase tracking-[0.14em] disabled:opacity-40"
                  >
                    {stateLoading
                      ? "Refreshing state…"
                      : "Refresh selected HoodWallet"}
                  </button>

                )}

              </>

            )}

            {error && (

              <div className="mt-3 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-3 text-[var(--hood-bg)]">

                <p className="text-[8px] leading-relaxed">
                  {
                    error
                  }
                </p>

              </div>

            )}

          </aside>

          {/* MAIN */}

          <section className="min-w-0">

            {!address ? (

              <div className="grid min-h-[600px] place-items-center border border-[var(--hood-fg)] p-8 text-center">

                <div>

                  <h2 className="text-5xl tracking-[-0.06em]">
                    CONNECT
                    <br />
                    YOUR WALLET
                  </h2>

                  <p className="mt-5 text-sm opacity-65">
                    Connect the EVM
                    wallet holding
                    your Hoodie.
                  </p>

                </div>

              </div>

            ) : ownershipLoading ? (

              <div className="border border-[var(--hood-fg)] p-8 text-center">

                <p className="text-[9px] uppercase tracking-[0.15em]">
                  Reading Hoodie ownership…
                </p>

              </div>

            ) : ownershipChecked &&
              ownedHoodies.length ===
                0 ? (

              <div className="border border-[var(--hood-fg)] p-8 text-center">

                <h2 className="text-4xl">
                  NO HOODIES
                </h2>

                <p className="mt-4 text-sm opacity-65">
                  This wallet does
                  not currently own
                  an OnChainHoodie.
                </p>

              </div>

            ) : stateLoading &&
              !selectedWallet ? (

              <div className="border border-[var(--hood-fg)] p-8 text-center">

                <p className="text-[9px] uppercase tracking-[0.15em]">
                  Loading Hoodie #
                  {
                    selectedTokenId
                  }
                </p>

                <p className="mt-2 text-[7px] uppercase opacity-50">
                  Lightweight protocol state only
                </p>

              </div>

            ) : selectedWallet &&
              selectedHoodie ? (

              <>

                {/* HOODIE / WALLET */}

                <div className="grid border border-[var(--hood-fg)] md:grid-cols-[260px_minmax(0,1fr)]">

                  <div className="border-b border-[var(--hood-fg)] bg-[#ccff00] md:border-b-0 md:border-r">

                    <div className="aspect-square">

                      <HoodieArtwork
                        hoodie={
                          selectedHoodie
                        }
                      />

                    </div>

                    <div className="border-t border-black bg-[#ccff00] p-4 text-black">

                      <p className="text-[8px] uppercase tracking-[0.14em]">
                        OnChainHoodie
                      </p>

                      <p className="mt-1 text-3xl">
                        #
                        {
                          selectedWallet.tokenId
                        }
                      </p>

                    </div>

                  </div>

                  <div className="min-w-0 p-5">

                    <div className="flex items-start justify-between gap-4">

                      <div>

                        <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                          HoodWallet
                        </p>

                        <p className="mt-2 text-2xl">
                          {shortAddress(
                            selectedWallet.walletAddress,
                          )}
                        </p>

                      </div>

                      <div
                        className={`border border-[var(--hood-fg)] px-3 py-2 text-[8px] uppercase ${
                          selectedWallet.active
                            ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                            : ""
                        }`}
                      >
                        {selectedWallet.active
                          ? "● Active"
                          : "○ Inactive"}
                      </div>

                    </div>

                    <div className="mt-5 border border-[var(--hood-fg)]">

                      <div className="border-b border-[var(--hood-fg)] px-3 py-2">

                        <p className="text-[7px] uppercase tracking-[0.14em] opacity-60">
                          Deterministic address
                        </p>

                      </div>

                      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">

                        <code className="break-all text-[9px]">
                          {
                            selectedWallet.walletAddress
                          }
                        </code>

                        <a
                          href={
                            explorerAddress(
                              selectedWallet.walletAddress,
                            )
                          }

                          target="_blank"

                          rel="noreferrer"

                          className="text-[8px] uppercase underline"
                        >
                          Explorer ↗
                        </a>

                      </div>

                    </div>

                    {/* BALANCES */}

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">

                      <div className="border border-[var(--hood-fg)] p-4">

                        <p className="text-[7px] uppercase opacity-55">
                          HoodWallet OCH
                        </p>

                        <p className="mt-2 text-3xl">
                          {formatBalance(
                            selectedWallet.ochBalance,
                          )}
                        </p>

                        <p className="mt-1 text-[8px] uppercase">
                          OCH
                        </p>

                      </div>

                      <div className="border border-[var(--hood-fg)] p-4">

                        <p className="text-[7px] uppercase opacity-55">
                          HoodWallet ETH
                        </p>

                        <p className="mt-2 text-3xl">
                          {formatBalance(
                            selectedWallet.nativeBalance,
                          )}
                        </p>

                        <p className="mt-1 text-[8px] uppercase">
                          ETH
                        </p>

                      </div>

                      <div className="border border-[var(--hood-fg)] p-4">

                        <p className="text-[7px] uppercase opacity-55">
                          Contract
                        </p>

                        <p className="mt-3 text-[9px] uppercase">
                          {selectedWallet.walletDeployed
                            ? "Deployed"
                            : "Counterfactual"}
                        </p>

                      </div>

                    </div>

                  </div>

                </div>

                {/* ACTIVATION */}

                <div className="mt-4 border border-[var(--hood-fg)]">

                  <div className="flex items-center justify-between border-b border-[var(--hood-fg)] px-4 py-3">

                    <p className="text-[9px] uppercase tracking-[0.15em]">
                      HoodWallet Activation
                    </p>

                    <p className="text-[8px] uppercase opacity-60">
                      {formatBalance(
                        activationCost,
                      )}{" "}
                      OCH
                    </p>

                  </div>

                  <div className="p-4">

                    {selectedWallet.active ? (

                      <div className="bg-[var(--hood-fg)] p-5 text-[var(--hood-bg)]">

                        <p className="text-[11px] uppercase">
                          ✓ HoodWallet active
                        </p>

                      </div>

                    ) : !activationEnabled ? (

                      <p className="text-[9px] uppercase">
                        Activation currently disabled.
                      </p>

                    ) : (

                      <>

                        <div className="grid gap-2 sm:grid-cols-2">

                          <div className="border border-[var(--hood-fg)] p-4">

                            <p className="text-[7px] uppercase opacity-55">
                              Your EVM wallet
                            </p>

                            <p className="mt-2 text-2xl">
                              {formatBalance(
                                ownerOCHBalance,
                              )}
                            </p>

                            <p className="mt-1 text-[8px] uppercase">
                              OCH available
                            </p>

                          </div>

                          <div className="border border-[var(--hood-fg)] p-4">

                            <p className="text-[7px] uppercase opacity-55">
                              Activation cost
                            </p>

                            <p className="mt-2 text-2xl">
                              {formatBalance(
                                activationCost,
                              )}
                            </p>

                            <p className="mt-1 text-[8px] uppercase">
                              OCH
                            </p>

                          </div>

                        </div>

                        {!ownerHasEnough && (

                          <p className="mt-3 border border-[var(--hood-fg)] p-3 text-[8px] uppercase">
                            Insufficient OCH for activation.
                          </p>

                        )}

                        <button
                          type="button"

                          disabled={
                            processing ||
                            !ownerHasEnough
                          }

                          onClick={() =>
                            void activateHoodWallet()
                          }

                          className="mt-3 w-full bg-[var(--hood-fg)] px-4 py-5 text-[var(--hood-bg)] disabled:opacity-35"
                        >

                          <span className="block text-[11px] uppercase tracking-[0.16em]">
                            {txState.action ===
                            "activate"
                              ? "Activating HoodWallet…"
                              : "Activate HoodWallet"}
                          </span>

                          <span className="mt-2 block text-[18px]">
                            {formatBalance(
                              activationCost,
                            )}{" "}
                            OCH
                          </span>

                          <span className="mx-auto mt-3 block max-w-xl text-[7px] uppercase leading-relaxed opacity-65">
                            Uses{" "}
                            {formatBalance(
                              activationCost,
                            )}{" "}
                            OCH from your connected EVM wallet.
                            {ownerAllowance <
                            activationCost
                              ? " Your wallet may first request OCH authorization, then the activation confirmation."
                              : " OCH authorization already exists."}
                          </span>

                        </button>

                      </>

                    )}

                  </div>

                </div>

                {/* PING */}

                <div className="mt-4 border border-[var(--hood-fg)]">

                  <div className="flex items-center justify-between border-b border-[var(--hood-fg)] px-4 py-3">

                    <p className="text-[9px] uppercase tracking-[0.15em]">
                      Activation Ping
                    </p>

                    <p className="text-[8px] uppercase opacity-60">
                      Ping #
                      {
                        selectedWallet.tokenId
                      }
                    </p>

                  </div>

                  <div className="p-4">

                    {selectedWallet.pingClaimed ? (

                      <div className="bg-[var(--hood-fg)] p-4 text-[var(--hood-bg)]">

                        <p className="text-[10px] uppercase">
                          ✓ Ping claimed
                        </p>

                        <p className="mt-2 text-[8px] uppercase opacity-70">
                          Load inventory below to display it.
                        </p>

                      </div>

                    ) : selectedWallet.pingCanClaim ? (

                      <button
                        type="button"

                        disabled={
                          processing
                        }

                        onClick={() =>
                          void claimPing()
                        }

                        className="w-full bg-[var(--hood-fg)] px-4 py-5 text-[var(--hood-bg)] disabled:opacity-35"
                      >
                        <span className="block text-[10px] uppercase">
                          {txState.action ===
                          "claim"
                            ? "Claiming Ping…"
                            : `Claim Ping #${selectedWallet.tokenId}`}
                        </span>

                        <span className="mt-2 block text-[7px] uppercase opacity-65">
                          Sends the matching Ping directly into this HoodWallet
                        </span>

                      </button>

                    ) : (

                      <p className="text-[9px] uppercase">
                        {selectedWallet.pingEverActivated
                          ? "Ping currently unavailable."
                          : "Activate this HoodWallet to unlock its Ping."}
                      </p>

                    )}

                  </div>

                </div>

                {/* STATUS */}

                {txState.message && (

                  <div className="mt-4 bg-[var(--hood-fg)] p-4 text-[var(--hood-bg)]">

                    <p className="text-[8px] uppercase leading-relaxed">
                      {
                        txState.message
                      }
                    </p>

                  </div>

                )}

                {/* TOKEN / ETH SEND */}

                <div className="mt-4 border border-[var(--hood-fg)]">

                  <div className="border-b border-[var(--hood-fg)] px-4 py-3">

                    <p className="text-[9px] uppercase tracking-[0.15em]">
                      Send funds from HoodWallet
                    </p>

                  </div>

                  <div className="p-4">

                    {!selectedWallet.active ? (

                      <p className="text-[9px] uppercase">
                        Activate this HoodWallet before sending.
                      </p>

                    ) : (

                      <>

                        <label className="text-[7px] uppercase opacity-60">
                          Trusted asset
                        </label>

                        <select
                          value={
                            sendAssetKey
                          }

                          onChange={(
                            event,
                          ) =>
                            setSendAssetKey(
                              event.target.value,
                            )
                          }

                          className="mt-2 w-full border border-[var(--hood-fg)] bg-[var(--hood-bg)] p-3 text-[9px] text-[var(--hood-fg)]"
                        >
                          {sendableAssets.map(
                            (
                              asset,
                            ) => (

                              <option
                                key={
                                  assetKey(
                                    asset,
                                  )
                                }

                                value={
                                  assetKey(
                                    asset,
                                  )
                                }
                              >
                                {
                                  asset.symbol
                                }{" "}
                                —{" "}
                                {
                                  asset.balanceFormatted
                                }
                              </option>

                            ),
                          )}
                        </select>

                        <p className="mt-2 text-[7px] uppercase opacity-55">
                          Untrusted tokens are never available for sending.
                        </p>

                        <label className="mt-4 block text-[7px] uppercase opacity-60">
                          Recipient
                        </label>

                        <input
                          value={
                            sendRecipient
                          }

                          onChange={(
                            event,
                          ) =>
                            setSendRecipient(
                              event.target.value,
                            )
                          }

                          placeholder="0x..."

                          className="mt-2 w-full border border-[var(--hood-fg)] bg-transparent p-3 text-[9px]"
                        />

                        <div className="mt-4 flex items-center justify-between">

                          <label className="text-[7px] uppercase opacity-60">
                            Amount
                          </label>

                          {selectedSendAsset && (

                            <button
                              type="button"

                              onClick={() =>
                                setSendAmount(
                                  formatUnits(
                                    selectedSendAsset.balanceRaw,

                                    selectedSendAsset.decimals,
                                  ),
                                )
                              }

                              className="text-[7px] uppercase underline"
                            >
                              Max
                            </button>

                          )}

                        </div>

                        <input
                          value={
                            sendAmount
                          }

                          onChange={(
                            event,
                          ) =>
                            setSendAmount(
                              event.target.value,
                            )
                          }

                          inputMode="decimal"

                          placeholder="0.0"

                          className="mt-2 w-full border border-[var(--hood-fg)] bg-transparent p-3 text-[9px]"
                        />

                        <button
                          type="button"

                          disabled={
                            processing ||
                            !sendRecipient ||
                            !sendAmount
                          }

                          onClick={() =>
                            void sendFromWallet()
                          }

                          className="mt-4 w-full bg-[var(--hood-fg)] px-4 py-4 text-[9px] uppercase text-[var(--hood-bg)] disabled:opacity-30"
                        >
                          {txState.action ===
                          "send"
                            ? "Sending…"
                            : "Send from HoodWallet"}
                        </button>

                      </>

                    )}

                  </div>

                </div>

                {/* MANUAL INVENTORY */}

                <div className="mt-4 border border-[var(--hood-fg)]">

                  <div className="border-b border-[var(--hood-fg)] px-4 py-3">

                    <div className="flex items-center justify-between">

                      <p className="text-[9px] uppercase tracking-[0.15em]">
                        Token + NFT Inventory
                      </p>

                      <p className="text-[7px] uppercase opacity-55">
                        Manual only
                      </p>

                    </div>

                  </div>

                  <div className="p-4">

                    <button
                      type="button"

                      disabled={
                        inventoryLoading
                      }

                      onClick={() =>
                        void loadInventory()
                      }

                      className="w-full border border-[var(--hood-fg)] px-4 py-5 text-[9px] uppercase tracking-[0.14em] disabled:opacity-35"
                    >
                      {inventoryLoading
                        ? "Loading selected HoodWallet inventory…"
                        : inventoryLoaded
                          ? "Refresh token + NFT inventory"
                          : "Load token + NFT inventory"}
                    </button>

                    <p className="mt-3 text-[7px] uppercase leading-relaxed opacity-55">
                      Only this selected HoodWallet is scanned.
                    </p>

                    {inventoryLoaded && (

                      <>

                        {/* FILTER */}

                        <div className="mt-4 grid grid-cols-2 border border-[var(--hood-fg)]">

                          <button
                            type="button"

                            onClick={() =>
                              setTrustedOnly(
                                true,
                              )
                            }

                            className={`p-3 text-[8px] uppercase ${
                              trustedOnly
                                ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                                : ""
                            }`}
                          >
                            Trusted
                          </button>

                          <button
                            type="button"

                            onClick={() =>
                              setTrustedOnly(
                                false,
                              )
                            }

                            className={`border-l border-[var(--hood-fg)] p-3 text-[8px] uppercase ${
                              !trustedOnly
                                ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                                : ""
                            }`}
                          >
                            All
                          </button>

                        </div>

                        {/* ADDITIONAL TOKENS */}

                        <div className="mt-5">

                          <p className="text-[8px] uppercase tracking-[0.14em]">
                            Additional tokens
                          </p>

                          {visibleInventoryAssets.length ===
                          0 ? (

                            <p className="mt-3 text-[8px] uppercase opacity-50">
                              No additional token balances.
                            </p>

                          ) : (

                            <div className="mt-2 border border-[var(--hood-fg)]">

                              {visibleInventoryAssets.map(
                                (
                                  asset,
                                ) => (

                                  <div
                                    key={
                                      assetKey(
                                        asset,
                                      )
                                    }

                                    className="flex items-center justify-between border-b border-[var(--hood-fg)] p-3 last:border-b-0"
                                  >

                                    <div>

                                      <p className="text-[9px] uppercase">
                                        {
                                          asset.symbol
                                        }
                                      </p>

                                      {asset.trusted ? (

                                        <p className="mt-1 text-[6px] uppercase opacity-50">
                                          Trusted
                                        </p>

                                      ) : (

                                        <>

                                          <p className="mt-1 text-[6px] uppercase opacity-50">
                                            Untrusted · sending disabled
                                          </p>

                                          {asset.contract && (

                                            <a
                                              href={
                                                explorerToken(
                                                  asset.contract,
                                                )
                                              }

                                              target="_blank"

                                              rel="noreferrer"

                                              className="text-[6px] underline opacity-45"
                                            >
                                              Contract ↗
                                            </a>

                                          )}

                                        </>

                                      )}

                                    </div>

                                    <p className="text-xl">
                                      {
                                        asset.balanceFormatted
                                      }
                                    </p>

                                  </div>

                                ),
                              )}

                            </div>

                          )}

                        </div>

                        {/* NFT INVENTORY */}

                        <div className="mt-6">

                          <div className="flex items-center justify-between">

                            <p className="text-[8px] uppercase tracking-[0.14em]">
                              NFT Inventory
                            </p>

                            <p className="text-[7px] uppercase opacity-50">
                              {
                                visibleInventoryNfts.length
                              }{" "}
                              item
                              {visibleInventoryNfts.length ===
                              1
                                ? ""
                                : "s"}
                            </p>

                          </div>

                          {visibleInventoryNfts.length ===
                          0 ? (

                            <p className="mt-3 text-[8px] uppercase opacity-50">
                              No visible NFTs found.
                            </p>

                          ) : (

                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">

                              {visibleInventoryNfts.map(
                                (
                                  nft,
                                ) => (

                                  <article
                                    key={`${nft.contract}-${nft.tokenId}`}

                                    className="border border-[var(--hood-fg)]"
                                  >

                                    <div className="aspect-square">

                                      <NftArtwork
                                        nft={
                                          nft
                                        }
                                      />

                                    </div>

                                    <div className="border-t border-[var(--hood-fg)] p-3">

                                      <p className="text-[7px] uppercase opacity-55">
                                        {
                                          nft.collectionName
                                        }
                                      </p>

                                      <p className="mt-1 text-[10px] uppercase">
                                        {
                                          nft.name
                                        }
                                      </p>

                                      <p className="mt-2 text-[7px] uppercase opacity-50">
                                        #
                                        {
                                          nft.tokenId
                                        }
                                      </p>

                                      <button
                                        type="button"

                                        disabled={
                                          !selectedWallet.active ||
                                          processing
                                        }

                                        onClick={() => {
                                          setSelectedNftToSend(
                                            nft,
                                          );

                                          setNftRecipient(
                                            "",
                                          );

                                          setNftAmount(
                                            "1",
                                          );
                                        }}

                                        className="mt-3 w-full border border-[var(--hood-fg)] px-2 py-2 text-[7px] uppercase tracking-[0.12em] disabled:opacity-30"
                                      >
                                        Send NFT
                                      </button>

                                    </div>

                                  </article>

                                ),
                              )}

                            </div>

                          )}

                        </div>

                        {/* NFT SEND PANEL */}

                        {selectedNftToSend && (

                          <div className="mt-6 border border-[var(--hood-fg)]">

                            <div className="flex items-center justify-between border-b border-[var(--hood-fg)] px-4 py-3">

                              <div>

                                <p className="text-[7px] uppercase opacity-55">
                                  Send NFT
                                </p>

                                <p className="mt-1 text-[11px] uppercase">
                                  {
                                    selectedNftToSend.name
                                  }
                                </p>

                              </div>

                              <button
                                type="button"

                                onClick={() =>
                                  setSelectedNftToSend(
                                    null,
                                  )
                                }

                                className="text-[8px] uppercase underline"
                              >
                                Cancel
                              </button>

                            </div>

                            <div className="p-4">

                              <div className="grid gap-2 sm:grid-cols-2">

                                <div className="border border-[var(--hood-fg)] p-3">

                                  <p className="text-[7px] uppercase opacity-55">
                                    Collection
                                  </p>

                                  <p className="mt-2 text-[9px] uppercase">
                                    {
                                      selectedNftToSend.collectionName
                                    }
                                  </p>

                                </div>

                                <div className="border border-[var(--hood-fg)] p-3">

                                  <p className="text-[7px] uppercase opacity-55">
                                    Token ID
                                  </p>

                                  <p className="mt-2 text-[9px] uppercase">
                                    #
                                    {
                                      selectedNftToSend.tokenId
                                    }
                                  </p>

                                </div>

                              </div>

                              <label className="mt-4 block text-[7px] uppercase opacity-60">
                                Recipient
                              </label>

                              <input
                                type="text"

                                spellCheck={
                                  false
                                }

                                value={
                                  nftRecipient
                                }

                                onChange={(
                                  event,
                                ) =>
                                  setNftRecipient(
                                    event.target.value,
                                  )
                                }

                                placeholder="0x..."

                                className="mt-2 w-full border border-[var(--hood-fg)] bg-transparent p-3 text-[9px]"
                              />

                              {selectedNftToSend.kind ===
                                "erc1155" && (

                                <>

                                  <div className="mt-4 flex items-center justify-between">

                                    <label className="text-[7px] uppercase opacity-60">
                                      Amount
                                    </label>

                                    <p className="text-[7px] uppercase opacity-55">
                                      Available:{" "}
                                      {
                                        selectedNftToSend.balance
                                      }
                                    </p>

                                  </div>

                                  <input
                                    type="number"

                                    min="1"

                                    step="1"

                                    value={
                                      nftAmount
                                    }

                                    onChange={(
                                      event,
                                    ) =>
                                      setNftAmount(
                                        event.target.value,
                                      )
                                    }

                                    className="mt-2 w-full border border-[var(--hood-fg)] bg-transparent p-3 text-[9px]"
                                  />

                                </>

                              )}

                              <button
                                type="button"

                                disabled={
                                  processing ||
                                  !nftRecipient
                                }

                                onClick={() =>
                                  void sendNftFromWallet()
                                }

                                className="mt-4 w-full bg-[var(--hood-fg)] px-4 py-5 text-[var(--hood-bg)] disabled:opacity-30"
                              >

                                <span className="block text-[9px] uppercase tracking-[0.14em]">
                                  {txState.action ===
                                  "send-nft"
                                    ? "Sending NFT…"
                                    : "Send NFT from HoodWallet"}
                                </span>

                                <span className="mt-2 block text-[7px] uppercase opacity-65">
                                  {
                                    selectedNftToSend.collectionName
                                  }{" "}
                                  #
                                  {
                                    selectedNftToSend.tokenId
                                  }
                                </span>

                              </button>

                              <p className="mt-3 text-[7px] uppercase leading-relaxed opacity-55">
                                NFT transfers use the NFT contract returned by the loaded HoodWallet inventory.
                              </p>

                            </div>

                          </div>

                        )}

                      </>

                    )}

                  </div>

                </div>

              </>

            ) : null}

          </section>

        </div>

      </section>

      <SiteFooter />

    </main>
  );
}