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

  imageCandidates?: string[];

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

    imageCandidates?: string[];

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
  | "swap-activate"
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

type ActivationSwapResponse = {
  ok?: boolean;

  mode?:
    "EXACT_OUTPUT";

  direction?:
    "ETH_TO_OCH";

  amountOut?:
    string;

  amountOutFormatted?:
    string;

  quotedAmountIn?:
    string;

  quotedAmountInFormatted?:
    string;

  amountInMaximum?:
    string;

  amountInMaximumFormatted?:
    string;

  slippageBps?:
    number;

  expiresAt?:
    number;

  execution?: {
    to?: string;

    data?: string;

    value?: string;
  };

  error?:
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


function openSeaWallet(
  address: string,
) {
  return `https://opensea.io/${address}`;
}

function openSeaNft(
  contract: string,
  tokenId: string,
) {
  return `https://opensea.io/item/robinhood/${contract}/${encodeURIComponent(
    tokenId,
  )}`;
}

function isVideoImageSource(
  value?: string,
) {
  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  return (
    lower.includes(
      ".mp4",
    ) ||
    lower.includes(
      ".webm",
    ) ||
    lower.includes(
      ".mov",
    )
  );
}

function hoodWalletProxyImageUrl(
  image?: string,
) {
  if (!image) {
    return "";
  }

  if (
    image
      .trim()
      .toLowerCase()
      .startsWith(
        "data:image/",
      )
  ) {
    return image;
  }

  return `/api/hoodwallet/image?url=${encodeURIComponent(
    image,
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

function downloadBlob(
  blob: Blob,
  filename: string,
) {
  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  window.setTimeout(
    () =>
      URL.revokeObjectURL(
        url,
      ),
    1000,
  );
}

async function loadCanvasImage(
  source: string,
) {
  const response =
    await fetch(
      source,
      {
        cache:
          "no-store",
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Unable to load artwork (${response.status}).`,
    );
  }

  const blob =
    await response.blob();

  const objectUrl =
    URL.createObjectURL(
      blob,
    );

  try {
    const image =
      await new Promise<HTMLImageElement>(
        (
          resolve,
          reject,
        ) => {
          const element =
            new window.Image();

          element.decoding =
            "async";

          element.onload =
            () =>
              resolve(
                element,
              );

          element.onerror =
            () =>
              reject(
                new Error(
                  "Unable to decode artwork for export.",
                ),
              );

          element.src =
            objectUrl;
        },
      );

    return image;
  } finally {
    window.setTimeout(
      () =>
        URL.revokeObjectURL(
          objectUrl,
        ),
      5000,
    );
  }
}

function drawCanvasImageContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth =
    image.naturalWidth || image.width;

  const sourceHeight =
    image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    context.drawImage(
      image,
      x,
      y,
      width,
      height,
    );
    return;
  }

  const scale =
    Math.min(
      width / sourceWidth,
      height / sourceHeight,
    );

  const drawWidth =
    sourceWidth * scale;

  const drawHeight =
    sourceHeight * scale;

  const drawX =
    x + (width - drawWidth) / 2;

  const drawY =
    y + (height - drawHeight) / 2;

  context.drawImage(
    image,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
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
  /*
   * Alchemy can return more than one usable media URL for the same NFT.
   * A cachedUrl may occasionally be stale/404 while pngUrl, thumbnailUrl,
   * originalUrl or the raw metadata image still works. Keep the complete
   * candidate list and move to the next source when one fails.
   */
  const candidates =
    useMemo(
      () =>
        Array.from(
          new Set(
            [
              ...(nft.imageCandidates || []),
              nft.image || "",
            ]
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ),
      [
        nft.image,
        nft.imageCandidates,
      ],
    );

  const [
    candidateIndex,
    setCandidateIndex,
  ] = useState(0);

  const [
    proxyAttempt,
    setProxyAttempt,
  ] = useState(false);

  const originalSource =
    candidates[candidateIndex] || "";

  const source =
    !originalSource
      ? ""
      : proxyAttempt ||
          isVideoImageSource(
            originalSource,
          )
        ? hoodWalletProxyImageUrl(
            originalSource,
          )
        : originalSource;

  if (!source) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-3 text-center text-[#ccff00]">
        <p className="text-[12px] uppercase tracking-[0.14em]">
          {nft.collectionName}
          <br />
          #{nft.tokenId}
        </p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt={nft.name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        /*
         * First try the same source through our server proxy. If that also
         * fails, advance to the next Alchemy/raw media candidate.
         */
        if (
          !proxyAttempt &&
          !originalSource
            .toLowerCase()
            .startsWith(
              "data:image/",
            )
        ) {
          setProxyAttempt(true);
          return;
        }

        if (
          candidateIndex + 1 <
          candidates.length
        ) {
          setCandidateIndex(
            (current) =>
              current + 1,
          );
          setProxyAttempt(false);
        }
      }}
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
    useState(true);

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
    inventoryView,
    setInventoryView,
  ] =
    useState<"verified" | "all">(
      "verified",
    );


  /*//////////////////////////////////////////////////////////////
                       SHARE CARD STATE
  //////////////////////////////////////////////////////////////*/

  const [
    exportModalOpen,
    setExportModalOpen,
  ] =
    useState(false);

  const [
    exportShowBalances,
    setExportShowBalances,
  ] =
    useState(true);

  const [
    exportShowNfts,
    setExportShowNfts,
  ] =
    useState(true);

  const [
    exportShowAddress,
    setExportShowAddress,
  ] =
    useState(false);

  const [
    exportBusy,
    setExportBusy,
  ] =
    useState(false);


  /*//////////////////////////////////////////////////////////////
                         TOKEN SEND STATE
  //////////////////////////////////////////////////////////////*/

  const [
    sendPanelOpen,
    setSendPanelOpen,
  ] =
    useState(false);

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

                imageCandidates:
                  rawNft.imageCandidates ||
                  (rawNft.image
                    ? [rawNft.image]
                    : []),

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

                  imageCandidates:
                    [],

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
                    AUTO-LOAD INVENTORY
  //////////////////////////////////////////////////////////////*/

  useEffect(() => {
    if (
      !selectedWallet ||
      inventoryLoaded ||
      inventoryLoading
    ) {
      return;
    }

    let cancelled =
      false;

    queueMicrotask(() => {
      if (!cancelled) {
        void loadInventory();
      }
    });

    return () => {
      cancelled =
        true;
    };
  }, [
    inventoryLoaded,
    inventoryLoading,
    loadInventory,
    selectedWallet,
  ]);

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
                SWAP MISSING OCH + ACTIVATE
  //////////////////////////////////////////////////////////////*/

  const swapMissingOchAndActivate =
    useCallback(
      async () => {
        if (
          !address
        ) {
          await connect();

          return;
        }

        if (
          !selectedWallet ||
          !provider
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

        const missingOCH =
          activationCost >
          ownerOCHBalance
            ? activationCost -
              ownerOCHBalance
            : BigInt(0);

        if (
          missingOCH ===
          BigInt(0)
        ) {
          await activateHoodWallet();

          return;
        }

        try {
          setError(null);

          setTxState({
            action:
              "swap-activate",

            message:
              `Quoting exactly ${formatBalance(
                missingOCH,
              )} OCH for activation…`,
          });

          /*
           * Ask the shared OCH swap API for an exact-output
           * ETH -> OCH transaction. This buys only the missing
           * OCH, not another full 2,500 OCH.
           */
          const response =
            await fetch(
              "/api/och/swap",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  accept:
                    "application/json",
                },

                cache:
                  "no-store",

                body:
                  JSON.stringify({
                    mode:
                      "EXACT_OUTPUT",

                    direction:
                      "ETH_TO_OCH",

                    amount:
                      formatUnits(
                        missingOCH,
                        18,
                      ),

                    recipient:
                      address,

                    slippageBps:
                      100,
                  }),
              },
            );

          const payload =
            (await response.json()) as
              ActivationSwapResponse;

          if (
            !response.ok ||
            !payload.ok ||
            !payload.execution?.to ||
            !payload.execution?.data ||
            payload.execution.value ===
              undefined
          ) {
            throw new Error(
              payload.error ||
                "Unable to prepare the OCH activation swap.",
            );
          }

          if (
            !isAddress(
              payload.execution.to,
            )
          ) {
            throw new Error(
              "Swap API returned an invalid execution target.",
            );
          }

          let maxEth:
            bigint;

          try {
            maxEth =
              BigInt(
                payload.execution.value,
              );
          } catch {
            throw new Error(
              "Swap API returned an invalid ETH value.",
            );
          }

          if (
            maxEth <=
            BigInt(0)
          ) {
            throw new Error(
              "Swap API returned an empty ETH quote.",
            );
          }

          const ownerEthBalance =
            await provider.getBalance(
              address,
            );

          if (
            ownerEthBalance <
            maxEth
          ) {
            throw new Error(
              `You need up to ${formatBalance(
                maxEth,
              )} ETH for the missing OCH swap, plus network gas.`,
            );
          }

          await ensureRequiredNetwork();

          const walletClient =
            await getWalletClient();

          const walletAccount =
            requireWalletAccount(
              walletClient.account,
            );

          setTxState({
            action:
              "swap-activate",

            message:
              `Confirm the swap for ${formatBalance(
                missingOCH,
              )} OCH. Maximum ETH: ${formatBalance(
                maxEth,
              )}. Unused ETH is returned by the router.`,
          });

          const swapHash =
            await walletClient.sendTransaction({
              chain:
                null,

              account:
                walletAccount,

              to:
                getAddress(
                  payload.execution.to,
                ) as Address,

              data:
                payload.execution.data as Hex,

              value:
                maxEth,
            });

          setTxState({
            action:
              "swap-activate",

            message:
              `OCH swap submitted ${shortAddress(
                swapHash,
              )}. Waiting for confirmation…`,
          });

          await waitForHash(
            swapHash,
          );

          /*
           * Read fresh economy state directly from-chain.
           * Do not rely on React state having updated yet.
           */
          const och =
            new Contract(
              siteConfig.ochAddress,

              OCH_READ_ABI,

              provider,
            );

          const freshBalance =
            (await och.balanceOf(
              address,
            )) as bigint;

          if (
            freshBalance <
            activationCost
          ) {
            throw new Error(
              `Swap confirmed, but the wallet still has only ${formatBalance(
                freshBalance,
              )} OCH. Refresh and try again.`,
            );
          }

          let freshAllowance =
            (await och.allowance(
              address,

              siteConfig.hoodOSAddress,
            )) as bigint;

          setOwnerOCHBalance(
            freshBalance,
          );

          setOwnerAllowance(
            freshAllowance,
          );

          /*
           * Continue directly into the existing activation flow.
           */
          if (
            freshAllowance <
            activationCost
          ) {
            setTxState({
              action:
                "swap-activate",

              message:
                `${formatBalance(
                  missingOCH,
                )} OCH received. Authorize ${formatBalance(
                  activationCost,
                )} OCH for HoodWallet activation.`,
            });

            const approvalHash =
              await walletClient.writeContract({
                chain:
                  null,

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
                  walletAccount,
              });

            setTxState({
              action:
                "swap-activate",

              message:
                `OCH authorization submitted ${shortAddress(
                  approvalHash,
                )}. Waiting for confirmation…`,
            });

            await waitForHash(
              approvalHash,
            );

            freshAllowance =
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
          }

          setTxState({
            action:
              "swap-activate",

            message:
              `OCH ready. Confirm activation of HoodWallet #${selectedWallet.tokenId}.`,
          });

          const activationHash =
            await walletClient.writeContract({
              chain:
                null,

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
                walletAccount,
            });

          setTxState({
            action:
              "swap-activate",

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
              `OCH acquired and HoodWallet #${selectedWallet.tokenId} activated successfully.`,
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

              "OCH swap + HoodWallet activation failed.",
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
        activateHoodWallet,
        address,
        connect,
        ensureRequiredNetwork,
        getWalletClient,
        loadSelectedWallet,
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
        ...inventoryAssets,
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

          setSendPanelOpen(
            false,
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
      (hoodie) =>
        hoodie.tokenId ===
        selectedTokenId,
    ) || null;

  const ownerHasEnough =
    ownerOCHBalance >=
    activationCost;

  const missingActivationOCH =
    activationCost >
    ownerOCHBalance
      ? activationCost -
        ownerOCHBalance
      : BigInt(0);

  const processing =
    txState.action !==
    null;

  /*
   * Verification controls the default view, never withdrawal rights.
   * VERIFIED shows curated assets. ALL shows every discovered asset.
   */
  const allInventoryAssets =
    useMemo(() => {
      const merged =
        new Map<string, HoodWalletAsset>();

      for (
        const asset of
        coreAssets
      ) {
        merged.set(
          assetKey(asset),
          asset,
        );
      }

      for (
        const asset of
        inventoryAssets
      ) {
        merged.set(
          assetKey(asset),
          asset,
        );
      }

      return Array.from(
        merged.values(),
      );
    }, [
      coreAssets,
      inventoryAssets,
    ]);

  const displayedAssets =
    useMemo(
      () =>
        inventoryView ===
        "all"
          ? allInventoryAssets
          : allInventoryAssets.filter(
              (
                asset,
              ) =>
                asset.trusted,
            ),
      [
        allInventoryAssets,
        inventoryView,
      ],
    );

  const displayedNfts =
    useMemo(
      () =>
        inventoryView ===
        "all"
          ? inventoryNfts
          : inventoryNfts.filter(
              (
                nft,
              ) =>
                nft.trusted,
            ),
      [
        inventoryNfts,
        inventoryView,
      ],
    );

  const unverifiedAssetCount =
    useMemo(
      () =>
        allInventoryAssets.filter(
          (
            asset,
          ) =>
            !asset.trusted,
        ).length +
        inventoryNfts.filter(
          (
            nft,
          ) =>
            !nft.trusted,
        ).length,
      [
        allInventoryAssets,
        inventoryNfts,
      ],
    );

  const canSendAsset =
    useCallback(
      (
        asset: HoodWalletAsset,
      ) =>
        asset.balanceRaw >
        BigInt(0),
      [],
    );

  const chooseAssetToSend =
    useCallback(
      (
        asset: HoodWalletAsset,
      ) => {
        setError(null);
        setSendAssetKey(
          assetKey(asset),
        );
        setSendAmount("");
        setSendRecipient("");
        setSendPanelOpen(true);
      },
      [],
    );

  /*
   * The export follows the CURRENT inventory view.
   * VERIFIED exports only curated assets; ALL exports every discovered asset.
   */
  const exportAssets =
    useMemo(
      () =>
        displayedAssets.filter(
          (asset) =>
            asset.balanceRaw >
            BigInt(0),
        ),
      [displayedAssets],
    );

  const exportNfts =
    useMemo(
      () =>
        displayedNfts.filter(
          (nft) =>
            !nft.spam,
        ),
      [displayedNfts],
    );

  async function loadNftForCanvas(
    nft: HoodWalletNft,
  ) {
    /*
     * First use the exact media candidates already returned to the wallet UI.
     * This keeps the exported artwork consistent with what the holder sees
     * on-screen instead of allowing the dedicated metadata route to choose a
     * different Alchemy rendition. Every remote candidate is passed through
     * our same-origin image proxy before touching Canvas.
     */
    const candidates =
      Array.from(
        new Set(
          [
            ...(nft.imageCandidates || []),
            nft.image || "",
          ]
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      );

    let lastError:
      unknown = null;

    for (
      const candidate of
      candidates
    ) {
      try {
        return await loadCanvasImage(
          hoodWalletProxyImageUrl(
            candidate,
          ),
        );
      } catch (error) {
        lastError = error;
      }
    }

    /*
     * Fully-onchain NFTs such as Ping may not expose a conventional remote
     * image. The dedicated route can resolve tokenURI/image_data and remains
     * the final fallback.
     */
    try {
      const params =
        new URLSearchParams({
          contract: nft.contract,
          tokenId: nft.tokenId,
        });

      return await loadCanvasImage(
        `/api/hoodwallet/nft-image?${params.toString()}`,
      );
    } catch (error) {
      lastError = error;
    }

    throw (
      lastError ||
      new Error(
        "NFT artwork unavailable.",
      )
    );
  }

  const exportHoodWalletCard =
    useCallback(
      async () => {
        if (
          !selectedWallet ||
          !selectedHoodie
        ) {
          return;
        }

        try {
          setError(null);
          setExportBusy(true);

          if (
            document.fonts?.ready
          ) {
            await document.fonts.ready;
          }

          /*
           * 2:1 LANDSCAPE wallet card.
           * The visual language is closer to a physical wallet/pass/card,
           * rather than a receipt or portrait story graphic.
           */
          const WIDTH = 1600;
          const HEIGHT = 800;
          const GREEN = "#ccff00";
          const BLACK = "#000000";
          const PAD = 52;

          const canvas =
            document.createElement(
              "canvas",
            );

          canvas.width = WIDTH;
          canvas.height = HEIGHT;

          const context =
            canvas.getContext(
              "2d",
            );

          if (!context) {
            throw new Error(
              "Canvas is unavailable in this browser.",
            );
          }

          context.imageSmoothingEnabled =
            false;
          context.fillStyle = BLACK;
          context.fillRect(
            0,
            0,
            WIDTH,
            HEIGHT,
          );
          context.strokeStyle = GREEN;
          context.lineWidth = 4;
          context.strokeRect(
            24,
            24,
            WIDTH - 48,
            HEIGHT - 48,
          );

          const font =
            "DepartureMono, monospace";

          context.fillStyle = GREEN;
          context.textBaseline = "top";
          context.textAlign = "left";

          /* Header + HoodWallet icon */
          try {
            const walletIcon =
              await loadCanvasImage(
                "/journey/wallet.svg",
              );

            context.drawImage(
              walletIcon,
              PAD,
              50,
              48,
              48,
            );
          } catch (iconError) {
            console.debug(
              "HoodWallet export icon unavailable.",
              iconError,
            );
          }

          const headerTextX =
            PAD + 66;

          context.font =
            `36px ${font}`;
          context.fillText(
            "HOODWALLET",
            headerTextX,
            48,
          );

          context.font =
            `16px ${font}`;
          context.fillText(
            `VIEW / ${inventoryView.toUpperCase()}`,
            headerTextX,
            96,
          );

          context.textAlign = "right";
          context.font =
            `18px ${font}`;
          context.fillText(
            selectedWallet.active
              ? "● ACTIVE"
              : "○ INACTIVE",
            WIDTH - PAD,
            61,
          );
          context.textAlign = "left";

          /* Hoodie block */
          const artX = PAD;
          const artY = 152;
          const artSize = 410;

          context.fillStyle = GREEN;
          context.fillRect(
            artX,
            artY,
            artSize,
            artSize,
          );

          const artwork =
            await loadCanvasImage(
              tokenArtwork(
                selectedWallet.tokenId,
              ),
            );
          context.drawImage(
            artwork,
            artX,
            artY,
            artSize,
            artSize,
          );

          context.fillStyle = GREEN;
          context.font =
            `30px ${font}`;
          context.fillText(
            `#${selectedWallet.tokenId}`,
            artX,
            artY + artSize + 24,
          );
          context.font =
            `14px ${font}`;
          context.fillText(
            "ONCHAINHOODIE",
            artX,
            artY + artSize + 66,
          );

          /* Wallet identity */
          const infoX = 520;
          const infoW =
            WIDTH - infoX - PAD;

          context.font =
            `14px ${font}`;
          context.fillText(
            "WALLET",
            infoX,
            155,
          );
          context.font =
            `27px ${font}`;
          context.fillText(
            exportShowAddress
              ? selectedWallet.walletAddress
              : shortAddress(
                  selectedWallet.walletAddress,
                ),
            infoX,
            188,
          );

          let rightY = 252;

          if (
            exportShowBalances
          ) {
            const tokenLines =
              exportAssets.slice(
                0,
                5,
              );

            context.strokeStyle = GREEN;
            context.strokeRect(
              infoX,
              rightY,
              infoW,
              132,
            );
            context.font =
              `14px ${font}`;
            context.fillText(
              `ASSETS / ${exportAssets.length}`,
              infoX + 20,
              rightY + 18,
            );

            const colWidth =
              Math.floor(
                (infoW - 40) /
                  Math.max(
                    1,
                    Math.min(
                      tokenLines.length,
                      5,
                    ),
                  ),
              );

            tokenLines.forEach(
              (asset, index) => {
                const x =
                  infoX +
                  20 +
                  index * colWidth;
                context.font =
                  `13px ${font}`;
                context.fillText(
                  asset.symbol,
                  x,
                  rightY + 52,
                );
                context.font =
                  `22px ${font}`;
                const balance =
                  asset.balanceFormatted.length >
                  12
                    ? `${asset.balanceFormatted.slice(0, 12)}…`
                    : asset.balanceFormatted;
                context.fillText(
                  balance,
                  x,
                  rightY + 79,
                );
              },
            );

            rightY += 158;
          }

          if (
            exportShowNfts
          ) {
            const nfts =
              exportNfts.slice(
                0,
                6,
              );

            context.font =
              `14px ${font}`;
            context.fillText(
              `NFTS / ${exportNfts.length}`,
              infoX,
              rightY,
            );

            const nftY =
              rightY + 32;
            const gap = 12;
            const cell =
              Math.floor(
                (infoW -
                  gap * 5) /
                  6,
              );

            for (
              let index = 0;
              index < nfts.length;
              index += 1
            ) {
              const nft = nfts[index];
              const x =
                infoX +
                index *
                  (cell + gap);

              context.strokeStyle = GREEN;
              context.strokeRect(
                x,
                nftY,
                cell,
                cell + 38,
              );

              try {
                const image =
                  await loadNftForCanvas(
                    nft,
                  );
                /*
                 * Preserve the complete NFT artwork. Using contain instead
                 * of filling the square prevents the top/bottom of portrait
                 * or unusually-sized NFT media from being clipped. The small
                 * inset also keeps the pixel border visible in the PNG.
                 */
                context.fillStyle = BLACK;
                context.fillRect(
                  x + 4,
                  nftY + 4,
                  cell - 8,
                  cell - 8,
                );

                drawCanvasImageContain(
                  context,
                  image,
                  x + 6,
                  nftY + 6,
                  cell - 12,
                  cell - 12,
                );
              } catch {
                context.fillStyle = BLACK;
                context.fillRect(
                  x,
                  nftY,
                  cell,
                  cell,
                );
                context.fillStyle = GREEN;
                context.font =
                  `12px ${font}`;
                context.textAlign = "center";
                context.fillText(
                  `#${nft.tokenId}`,
                  x + cell / 2,
                  nftY + cell / 2 - 7,
                );
                context.textAlign = "left";
              }

              context.fillStyle = GREEN;
              context.font =
                `11px ${font}`;
              const label =
                nft.name.length > 15
                  ? `${nft.name.slice(0, 14)}…`
                  : nft.name;
              context.fillText(
                label,
                x + 8,
                nftY + cell + 12,
              );
            }
          }

          /* Footer */
          context.fillStyle = GREEN;
          context.font =
            `14px ${font}`;
          context.fillText(
            "ONCHAINHOODIES / ROBINHOOD CHAIN",
            PAD,
            HEIGHT - 70,
          );
          context.textAlign = "right";
          context.fillText(
            "ONE HOODIE. ONE ON-CHAIN WALLET.",
            WIDTH - PAD,
            HEIGHT - 70,
          );

          const blob =
            await new Promise<Blob>(
              (resolve, reject) => {
                canvas.toBlob(
                  (result) =>
                    result
                      ? resolve(result)
                      : reject(
                          new Error(
                            "PNG render failed.",
                          ),
                        ),
                  "image/png",
                );
              },
            );

          downloadBlob(
            blob,
            `hoodwallet-${selectedWallet.tokenId}-${inventoryView}.png`,
          );

          setExportModalOpen(false);
        } catch (exportError) {
          console.error(exportError);
          setError(
            errorMessage(
              exportError,
              "Unable to export HoodWallet card.",
            ),
          );
        } finally {
          setExportBusy(false);
        }
      },
      [
        exportAssets,
        exportNfts,
        exportShowAddress,
        exportShowBalances,
        exportShowNfts,
        inventoryView,
        selectedHoodie,
        selectedWallet,
      ],
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

      <section className="mx-auto max-w-[1400px] px-4 pb-20 pt-20 md:px-6 md:pt-24">

        {/* TOP BAR */}

        <div className="flex flex-wrap items-center justify-end gap-5 border-b border-[var(--hood-fg)] pb-3">
          <p className="text-[9px] uppercase tracking-[0.12em] text-red-500">
            Robinhood Chain assets only
          </p>

          <button
            type="button"
            onClick={() =>
              setDarkHood(
                (current) =>
                  !current,
              )
            }
            className="text-[11px] uppercase underline underline-offset-4"
          >
            {darkHood
              ? "Lights on"
              : "Lights off"}
          </button>

          <Link
            href="/"
            className="text-[11px] uppercase underline underline-offset-4"
          >
            Back
          </Link>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">

          {/* SIDEBAR */}

          <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">

            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/journey/wallet.svg"
                alt="HoodWallet"
                className="h-12 w-12 shrink-0 object-contain"
              />

              <div>
                <h1 className="text-2xl uppercase tracking-[0.07em]">
                  HoodWallet
                </h1>

                <p className="mt-1 text-[9px] uppercase leading-relaxed opacity-60">
                  One Hoodie. One on-chain wallet.
                </p>
              </div>
            </div>

            {!address ? (
              <button
                type="button"
                onClick={() =>
                  void connect()
                }
                className="mt-5 w-full bg-[var(--hood-fg)] px-4 py-4 text-[var(--hood-bg)] text-[9px] uppercase tracking-[0.14em]"
              >
                Connect wallet
              </button>
            ) : (
              <>
                <div className="mt-5 border border-[var(--hood-fg)]">
                  <div className="border-b border-[var(--hood-fg)] px-3 py-2">
                    <p className="text-[7px] uppercase tracking-[0.12em] opacity-55">
                      Connected EVM wallet
                    </p>
                  </div>

                  <div className="p-3">
                    <p className="text-[10px]">
                      {shortAddress(
                        address,
                      )}
                    </p>

                    <p className="mt-3 text-[7px] uppercase opacity-55">
                      OCH balance
                    </p>

                    <p className="mt-1 text-xl">
                      {formatBalance(
                        ownerOCHBalance,
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 border border-[var(--hood-fg)] p-3">
                  <p className="text-[7px] uppercase tracking-[0.12em] opacity-55">
                    Hoodie
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

                      setSelectedNftToSend(
                        null,
                      );

                      setSendPanelOpen(
                        false,
                      );

                      setSelectedTokenId(
                        event.target.value,
                      );
                    }}
                    className="mt-2 w-full border border-[var(--hood-fg)] bg-[var(--hood-bg)] px-3 py-3 text-[9px] uppercase text-[var(--hood-fg)] outline-none"
                  >
                    {ownedHoodies.map(
                      (hoodie) => (
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

                  {selectedWallet && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[7px] uppercase opacity-55">
                        {selectedWallet.active
                          ? "● Active"
                          : "○ Inactive"}
                      </span>

                      <button
                        type="button"
                        disabled={
                          stateLoading
                        }
                        onClick={() =>
                          void loadSelectedWallet()
                        }
                        className="text-[11px] uppercase underline underline-offset-4 disabled:opacity-30"
                      >
                        Refresh
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {error && (
              <div className="mt-3 border border-[var(--hood-fg)] p-3">
                <p className="text-[8px] leading-relaxed">
                  {error}
                </p>
              </div>
            )}
          </aside>

          {/* MAIN CONTENT */}

          <section className="min-w-0">
            {!address ? (
              <div className="grid min-h-[460px] place-items-center border border-[var(--hood-fg)] p-8 text-center">
                <div>
                  <h2 className="text-4xl uppercase">
                    Connect your wallet
                  </h2>

                  <p className="mt-4 text-[9px] uppercase leading-relaxed opacity-55">
                    Connect the wallet holding your OnChainHoodie.
                  </p>
                </div>
              </div>
            ) : ownershipLoading ? (
              <div className="border border-[var(--hood-fg)] p-8 text-center">
                <p className="text-[9px] uppercase tracking-[0.14em]">
                  Reading Hoodie ownership…
                </p>
              </div>
            ) : ownershipChecked &&
              ownedHoodies.length ===
                0 ? (
              <div className="border border-[var(--hood-fg)] p-8 text-center">
                <h2 className="text-3xl uppercase">
                  No Hoodies
                </h2>

                <p className="mt-3 text-[9px] uppercase opacity-55">
                  This wallet does not currently own an OnChainHoodie.
                </p>
              </div>
            ) : stateLoading &&
              !selectedWallet ? (
              <div className="border border-[var(--hood-fg)] p-8 text-center">
                <p className="text-[9px] uppercase tracking-[0.14em]">
                  Loading Hoodie #{selectedTokenId}
                </p>
              </div>
            ) : selectedWallet &&
              selectedHoodie ? (
              <>

                {/* IDENTITY */}

                <div className="grid overflow-hidden border border-[var(--hood-fg)] md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="border-b border-[var(--hood-fg)] bg-[#ccff00] md:border-b-0 md:border-r">
                    <div className="aspect-square">
                      <HoodieArtwork
                        hoodie={
                          selectedHoodie
                        }
                      />
                    </div>

                    <div className="border-t border-black bg-[#ccff00] px-4 py-3 text-black">
                      <p className="text-[7px] uppercase tracking-[0.12em]">
                        OnChainHoodie
                      </p>

                      <p className="mt-1 text-2xl">
                        #{selectedWallet.tokenId}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col justify-between p-5">
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[7px] uppercase tracking-[0.12em] opacity-55">
                            HoodWallet
                          </p>

                          <p className="mt-2 text-2xl">
                            {shortAddress(
                              selectedWallet.walletAddress,
                            )}
                          </p>
                        </div>

                        <span
                          className={`border border-[var(--hood-fg)] px-3 py-2 text-[7px] uppercase tracking-[0.1em] ${
                            selectedWallet.active
                              ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                              : ""
                          }`}
                        >
                          {selectedWallet.active
                            ? "● Active"
                            : "○ Inactive"}
                        </span>
                      </div>

                      <div className="mt-5 border border-[var(--hood-fg)] p-3">
                        <code className="block break-all text-[8px] leading-relaxed">
                          {selectedWallet.walletAddress}
                        </code>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] uppercase">
                      <a
                        href={
                          explorerAddress(
                            selectedWallet.walletAddress,
                          )
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                      >
                        Explorer ↗
                      </a>

                      <a
                        href={
                          openSeaWallet(
                            selectedWallet.walletAddress,
                          )
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                      >
                        OpenSea ↗
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(
                              selectedWallet.walletAddress,
                            )
                            .catch(() =>
                              setError(
                                "Unable to copy HoodWallet address.",
                              ),
                            );
                        }}
                        className="underline underline-offset-4"
                      >
                        Copy wallet
                      </button>
                    </div>
                  </div>
                </div>

                {/* ACTIVATION */}

                <div className="mt-3 border border-[var(--hood-fg)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--hood-fg)] px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.14em]">
                      HoodWallet activation
                    </p>

                    {selectedWallet.active && (
                      <span className="text-[7px] uppercase opacity-60">
                        ● Active
                      </span>
                    )}
                  </div>

                  {selectedWallet.active ? (
                    <div className="p-4">
                      <div className="bg-[var(--hood-fg)] px-4 py-4 text-[var(--hood-bg)]">
                        <p className="text-[9px] uppercase tracking-[0.13em]">
                          ✓ HoodWallet active
                        </p>
                      </div>
                    </div>
                  ) : !activationEnabled ? (
                    <div className="p-4">
                      <p className="text-[9px] uppercase">
                        Activation currently disabled.
                      </p>
                    </div>
                  ) : ownerHasEnough ? (
                    <button
                      type="button"
                      disabled={
                        processing
                      }
                      onClick={() =>
                        void activateHoodWallet()
                      }
                      className="w-full bg-[var(--hood-fg)] px-5 py-7 text-center text-[var(--hood-bg)] disabled:opacity-35"
                    >
                      <span className="block text-[16px] uppercase tracking-[0.14em]">
                        {txState.action ===
                        "activate"
                          ? "Activating…"
                          : "Activate HoodWallet"}
                      </span>

                      <span className="mt-2 block text-xl">
                        {formatBalance(
                          activationCost,
                        )} OCH
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        processing
                      }
                      onClick={() =>
                        void swapMissingOchAndActivate()
                      }
                      className="w-full bg-[var(--hood-fg)] px-5 py-7 text-center text-[var(--hood-bg)] disabled:opacity-35"
                    >
                      <span className="block text-[16px] uppercase tracking-[0.14em]">
                        {txState.action ===
                        "swap-activate"
                          ? "Getting OCH + activating…"
                          : "Get OCH + activate"}
                      </span>

                      <span className="mt-3 block text-[10px] uppercase opacity-70">
                        Missing {formatBalance(
                          missingActivationOCH,
                        )} OCH
                      </span>
                    </button>
                  )}
                </div>

                {/* PING */}

                <div className="mt-3 border border-[var(--hood-fg)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--hood-fg)] px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.14em]">
                      Ping
                    </p>

                    <span className="text-[7px] uppercase opacity-60">
                      Ping #{selectedWallet.tokenId}
                    </span>
                  </div>

                  {!selectedWallet.active ? (
                    <div className="p-4">
                      <p className="text-[8px] uppercase opacity-55">
                        Activate this HoodWallet to unlock Ping.
                      </p>
                    </div>
                  ) : selectedWallet.pingClaimed ? (
                    <div className="flex items-center justify-between gap-4 p-4">
                      <p className="text-[10px] uppercase">
                        Ping #{selectedWallet.tokenId}
                      </p>

                      <span className="text-[7px] uppercase opacity-60">
                        ✓ Activated
                      </span>
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
                      className="w-full bg-[var(--hood-fg)] px-5 py-5 text-[var(--hood-bg)] disabled:opacity-35"
                    >
                      <span className="text-[13px] uppercase tracking-[0.14em]">
                        {txState.action ===
                        "claim"
                          ? "Activating Ping…"
                          : `Activate Ping #${selectedWallet.tokenId}`}
                      </span>
                    </button>
                  ) : (
                    <div className="p-4">
                      <p className="text-[8px] uppercase opacity-55">
                        Ping is not currently claimable.
                      </p>
                    </div>
                  )}
                </div>

                {/* TX STATUS */}

                {txState.message && (
                  <div className="mt-3 border border-[var(--hood-fg)] px-4 py-3">
                    <p className="text-[8px] uppercase leading-relaxed opacity-70">
                      {txState.message}
                    </p>
                  </div>
                )}

                {/* INVENTORY */}

                <div className="mt-3 border border-[var(--hood-fg)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hood-fg)] px-4 py-3">
                    <div>
                      <p className="text-[12px] uppercase tracking-[0.14em]">
                        Inventory
                      </p>

                      <p className="mt-1 text-[8px] uppercase opacity-55">
                        Tokens + NFTs held by this HoodWallet
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        inventoryLoading
                      }
                      onClick={() =>
                        void loadInventory()
                      }
                      className="text-[11px] uppercase underline underline-offset-4 disabled:opacity-30"
                    >
                      {inventoryLoading
                        ? "Refreshing…"
                        : "Refresh inventory"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 border-b border-[var(--hood-fg)]">
                    <button
                      type="button"
                      onClick={() =>
                        setInventoryView(
                          "verified",
                        )
                      }
                      className={`px-4 py-4 text-[11px] uppercase tracking-[0.14em] ${
                        inventoryView ===
                        "verified"
                          ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                          : ""
                      }`}
                    >
                      Verified
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setInventoryView(
                          "all",
                        )
                      }
                      className={`border-l border-[var(--hood-fg)] px-4 py-4 text-[11px] uppercase tracking-[0.14em] ${
                        inventoryView ===
                        "all"
                          ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                          : ""
                      }`}
                    >
                      All
                      {unverifiedAssetCount > 0
                        ? ` +${unverifiedAssetCount}`
                        : ""}
                    </button>
                  </div>

                  <div className="p-4">
                    {inventoryView === "all" &&
                      unverifiedAssetCount > 0 && (
                        <p className="mb-4 text-[8px] uppercase leading-relaxed opacity-60">
                          Unverified means the asset is not in the OnChainHoodies registry yet. It can still be sent out of your HoodWallet.
                        </p>
                      )}

                    {/* TOKENS */}

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[7px] uppercase tracking-[0.14em] opacity-60">
                        Tokens
                      </p>

                      <p className="text-[7px] uppercase opacity-45">
                        {displayedAssets.length} assets
                      </p>
                    </div>

                    <div className="mt-2 divide-y divide-[var(--hood-fg)] border border-[var(--hood-fg)]">
                      {displayedAssets.map(
                        (asset) => {
                          const sendEnabled =
                            canSendAsset(
                              asset,
                            );

                          return (
                            <div
                              key={
                                assetKey(
                                  asset,
                                )
                              }
                              className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(140px,auto)_auto] sm:items-center"
                            >
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase">
                                  {asset.symbol}
                                </p>

                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <p className="truncate text-[7px] uppercase opacity-55">
                                    {asset.name}
                                  </p>

                                  {!asset.trusted && (
                                    <span className="border border-[var(--hood-fg)] px-1.5 py-0.5 text-[6px] uppercase opacity-60">
                                      Unverified
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className="text-lg sm:text-right">
                                {asset.balanceFormatted}
                              </p>

                              <button
                                type="button"
                                disabled={
                                  !selectedWallet.active ||
                                  !sendEnabled
                                }
                                onClick={() =>
                                  chooseAssetToSend(
                                    asset,
                                  )
                                }
                                className="border border-[var(--hood-fg)] px-4 py-3 text-[10px] uppercase disabled:cursor-not-allowed disabled:opacity-25"
                              >
                                Send
                              </button>
                            </div>
                          );
                        },
                      )}
                    </div>

                    {inventoryLoading &&
                      !inventoryLoaded && (
                        <p className="mt-2 text-[7px] uppercase opacity-45">
                          Discovering ERC-20 + NFT balances…
                        </p>
                      )}

                    {/* TOKEN SEND */}

                    {sendPanelOpen &&
                      selectedSendAsset && (
                        <div className="mt-3 border border-[var(--hood-fg)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[7px] uppercase opacity-55">
                                Send token
                              </p>

                              <p className="mt-1 text-[11px] uppercase">
                                {selectedSendAsset.symbol}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setSendPanelOpen(
                                  false,
                                )
                              }
                              className="text-[7px] uppercase underline underline-offset-4"
                            >
                              Cancel
                            </button>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <input
                              type="text"
                              spellCheck={
                                false
                              }
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
                              placeholder="Recipient 0x…"
                              className="border border-[var(--hood-fg)] bg-transparent p-3 text-[9px] outline-none"
                            />

                            <input
                              type="text"
                              inputMode="decimal"
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
                              placeholder={`Amount / max ${selectedSendAsset.balanceFormatted}`}
                              className="border border-[var(--hood-fg)] bg-transparent p-3 text-[9px] outline-none"
                            />
                          </div>

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
                            className="mt-2 w-full bg-[var(--hood-fg)] px-4 py-4 text-[var(--hood-bg)] text-[9px] uppercase tracking-[0.14em] disabled:opacity-30"
                          >
                            {txState.action ===
                            "send"
                              ? "Sending…"
                              : `Send ${selectedSendAsset.symbol}`}
                          </button>
                        </div>
                      )}

                    {/* NFTS */}

                    <div className="mt-6 flex items-center justify-between gap-3">
                      <p className="text-[7px] uppercase tracking-[0.14em] opacity-60">
                        NFTs
                      </p>

                      <p className="text-[7px] uppercase opacity-45">
                        {displayedNfts.length} items
                      </p>
                    </div>

                    {displayedNfts.length ===
                    0 ? (
                      <div className="mt-2 border border-[var(--hood-fg)] p-5">
                        <p className="text-[8px] uppercase opacity-45">
                          {inventoryLoading
                            ? "Reading NFT inventory…"
                            : "No NFTs found in this HoodWallet."}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                        {displayedNfts.map(
                          (nft) => (
                            <article
                              key={`${nft.contract.toLowerCase()}:${nft.tokenId}`}
                              className="overflow-hidden border border-[var(--hood-fg)]"
                            >
                              <div className="aspect-square bg-black">
                                <NftArtwork
                                  nft={nft}
                                />
                              </div>

                              <div className="border-t border-[var(--hood-fg)] p-3">
                                <p className="truncate text-[10px] uppercase">
                                  {sameAddress(
                                    nft.contract,
                                    siteConfig.pingAddress,
                                  )
                                    ? `Ping #${nft.tokenId}`
                                    : nft.name}
                                </p>

                                {!nft.trusted && (
                                  <p className="mt-2 text-[6px] uppercase opacity-55">
                                    Unverified collection
                                  </p>
                                )}

                                <div className="mt-3 flex items-center gap-4">
                                  <button
                                    type="button"
                                    disabled={
                                      processing ||
                                      !selectedWallet.active
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
                                    className="text-[9px] uppercase underline underline-offset-4 disabled:opacity-25"
                                  >
                                    Send
                                  </button>

                                  <a
                                    href={
                                      openSeaNft(
                                        nft.contract,
                                        nft.tokenId,
                                      )
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[7px] uppercase underline underline-offset-4 opacity-65"
                                  >
                                    OpenSea ↗
                                  </a>
                                </div>
                              </div>
                            </article>
                          ),
                        )}
                      </div>
                    )}

                    {/* NFT SEND */}

                    {selectedNftToSend && (
                      <div className="mt-3 border border-[var(--hood-fg)] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[7px] uppercase opacity-55">
                              Send NFT
                            </p>

                            <p className="mt-1 text-[10px] uppercase">
                              {selectedNftToSend.name}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedNftToSend(
                                null,
                              )
                            }
                            className="text-[7px] uppercase underline underline-offset-4"
                          >
                            Cancel
                          </button>
                        </div>

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
                          placeholder="Recipient 0x…"
                          className="mt-4 w-full border border-[var(--hood-fg)] bg-transparent p-3 text-[9px] outline-none"
                        />

                        {selectedNftToSend.kind ===
                          "erc1155" && (
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
                            className="mt-2 w-full border border-[var(--hood-fg)] bg-transparent p-3 text-[9px] outline-none"
                          />
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
                          className="mt-2 w-full bg-[var(--hood-fg)] px-4 py-4 text-[var(--hood-bg)] text-[9px] uppercase tracking-[0.14em] disabled:opacity-30"
                        >
                          {txState.action ===
                          "send-nft"
                            ? "Sending NFT…"
                            : "Send NFT"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* SHARE */}

                <div className="mt-3 border border-[var(--hood-fg)]">
                  <div className="border-b border-[var(--hood-fg)] px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.14em]">
                      Share HoodWallet
                    </p>
                  </div>

                  <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div>
                      <p className="text-[11px] uppercase">
                        Turn your HoodWallet into a share card.
                      </p>

                      <p className="mt-2 max-w-2xl text-[8px] uppercase leading-relaxed opacity-55">
                        Portrait 1:2 format with your Hoodie and NFT collection. You choose what financial information is shown.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExportModalOpen(
                          true,
                        )
                      }
                      className="border border-[var(--hood-fg)] px-6 py-4 text-[10px] uppercase tracking-[0.14em]"
                    >
                      Create wallet card
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </section>

      {exportModalOpen &&
        selectedWallet &&
        selectedHoodie && (
          <div
            className="fixed inset-0 z-[100] overflow-y-auto bg-black/90 p-4 md:p-8"
            role="dialog"
            aria-modal="true"
            aria-label="Create HoodWallet card"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setExportModalOpen(false);
              }
            }}
          >
            <div className="mx-auto max-w-[1320px] border border-[#ccff00] bg-black p-4 text-[#ccff00] md:p-5">
              <div className="flex flex-col gap-4 border-b border-[#ccff00] pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[18px] uppercase tracking-[0.12em]">
                    Share HoodWallet
                  </p>
                  <p className="mt-2 text-[9px] uppercase leading-relaxed opacity-55">
                    A 2:1 wallet card built from the inventory view you are currently looking at.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExportModalOpen(false)
                  }
                  className="text-[12px] uppercase underline underline-offset-4"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[270px_minmax(0,1fr)]">
                <div>
                  <div className="border border-[#ccff00] p-3">
                    <p className="text-[8px] uppercase opacity-55">
                      Inventory source
                    </p>
                    <p className="mt-2 text-[15px] uppercase">
                      {inventoryView === "all"
                        ? "All assets"
                        : "Verified assets"}
                    </p>
                    <p className="mt-2 text-[8px] uppercase leading-relaxed opacity-50">
                      Switch VERIFIED / ALL in the wallet before opening this card to change what is shared.
                    </p>
                  </div>

                  <div className="mt-3 space-y-2">
                    {[
                      {
                        label: "Show token balances",
                        checked: exportShowBalances,
                        toggle: () =>
                          setExportShowBalances(
                            (current) =>
                              !current,
                          ),
                      },
                      {
                        label: "Show NFT artwork",
                        checked: exportShowNfts,
                        toggle: () =>
                          setExportShowNfts(
                            (current) =>
                              !current,
                          ),
                      },
                      {
                        label: "Show full wallet address",
                        checked: exportShowAddress,
                        toggle: () =>
                          setExportShowAddress(
                            (current) =>
                              !current,
                          ),
                      },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={option.toggle}
                        className={`flex w-full items-center justify-between border border-[#ccff00] px-4 py-3 text-left text-[10px] uppercase tracking-[0.1em] ${
                          option.checked
                            ? "bg-[#ccff00] text-black"
                            : ""
                        }`}
                      >
                        <span>{option.label}</span>
                        <span>
                          {option.checked
                            ? "■"
                            : "□"}
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() =>
                      void exportHoodWalletCard()
                    }
                    className="mt-4 w-full bg-[#ccff00] px-4 py-4 text-[12px] uppercase tracking-[0.16em] text-black disabled:opacity-40"
                  >
                    {exportBusy
                      ? "Creating PNG…"
                      : "Save wallet card"}
                  </button>

                  <p className="mt-3 text-[8px] uppercase opacity-45">
                    PNG / 1600 × 800 / 2:1
                  </p>
                </div>

                <div className="flex items-center justify-center bg-[#080808] p-3 md:p-5">
                  <div className="aspect-[2/1] w-full max-w-[960px] overflow-hidden border border-[#ccff00] bg-black p-[3%] text-[#ccff00] shadow-2xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[clamp(12px,1.7vw,24px)] uppercase tracking-[0.12em]">
                          HoodWallet
                        </p>
                        <p className="mt-1 text-[clamp(5px,0.65vw,9px)] uppercase opacity-55">
                          View / {inventoryView}
                        </p>
                      </div>
                      <p className="text-[clamp(6px,0.75vw,10px)] uppercase">
                        {selectedWallet.active
                          ? "● Active"
                          : "○ Inactive"}
                      </p>
                    </div>

                    <div className="mt-[4%] grid grid-cols-[32%_minmax(0,1fr)] gap-[4%]">
                      <div>
                        <div className="aspect-square overflow-hidden bg-[#ccff00]">
                          <HoodieArtwork hoodie={selectedHoodie} />
                        </div>
                        <p className="mt-[5%] text-[clamp(9px,1.35vw,19px)] uppercase">
                          #{selectedWallet.tokenId}
                        </p>
                        <p className="mt-[2%] text-[clamp(5px,0.55vw,8px)] uppercase opacity-55">
                          OnChainHoodie
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[clamp(5px,0.55vw,8px)] uppercase opacity-55">
                          Wallet
                        </p>
                        <p className="mt-[1%] break-all text-[clamp(6px,0.8vw,11px)] uppercase">
                          {exportShowAddress
                            ? selectedWallet.walletAddress
                            : shortAddress(
                                selectedWallet.walletAddress,
                              )}
                        </p>

                        {exportShowBalances && (
                          <div className="mt-[4%] border border-[#ccff00] p-[2.5%]">
                            <div className="flex items-center justify-between text-[clamp(5px,0.55vw,8px)] uppercase opacity-55">
                              <span>Assets</span>
                              <span>{exportAssets.length}</span>
                            </div>
                            <div className="mt-[2%] grid grid-cols-3 gap-[2%]">
                              {exportAssets
                                .slice(0, 6)
                                .map((asset) => (
                                  <div
                                    key={assetKey(asset)}
                                    className="min-w-0"
                                  >
                                    <p className="truncate text-[clamp(5px,0.55vw,8px)] uppercase opacity-55">
                                      {asset.symbol}
                                    </p>
                                    <p className="mt-[2%] truncate text-[clamp(7px,0.9vw,13px)] uppercase">
                                      {asset.balanceFormatted}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {exportShowNfts && (
                          <div className="mt-[4%]">
                            <div className="mb-[2%] flex items-center justify-between text-[clamp(5px,0.55vw,8px)] uppercase">
                              <span>NFTs</span>
                              <span className="opacity-55">
                                {exportNfts.length}
                              </span>
                            </div>
                            <div className="grid grid-cols-6 gap-[1.5%]">
                              {exportNfts
                                .slice(0, 6)
                                .map((nft) => (
                                  <div
                                    key={`${nft.contract}:${nft.tokenId}`}
                                    className="min-w-0 overflow-hidden border border-[#ccff00]"
                                  >
                                    <div className="aspect-square bg-black">
                                      <NftArtwork nft={nft} />
                                    </div>
                                    <p className="truncate border-t border-[#ccff00] px-[6%] py-[5%] text-[clamp(4px,0.42vw,6px)] uppercase">
                                      {nft.name}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-[3%] flex items-center justify-between border-t border-[#ccff00] pt-[2%] text-[clamp(4px,0.48vw,7px)] uppercase tracking-[0.1em]">
                      <span>OnChainHoodies / Robinhood Chain</span>
                      <span>One Hoodie. One on-chain wallet.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      <SiteFooter />
    </main>
  );
}
