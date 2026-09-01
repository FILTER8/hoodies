"use client";

import Image from "next/image";
import Link from "next/link";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  Contract,
  Interface,
  JsonRpcProvider,
} from "ethers";

import confetti from "canvas-confetti";

import type {
  Address,
  Hex,
} from "viem";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

import {
  useWallet,
} from "../../components/WalletProvider";

import {
  apiConfig,
  collectionApiUrl,
} from "../../lib/api";

import {
  siteConfig,
} from "../../lib/config";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

const PUBLIC_API =
  "https://api.onchainhoodies.xyz";

const OPENSEA_COLLECTION =
  "https://opensea.io/collection/onchainhoodies-";

const JOURNEY_REGISTRY =
  "0x93513A0e4d0E016ccf296C4c2888b59c06708ea7";

const OPERATION_CALL =
  0;

/*
 * Exact production Journey milestones.
 */

const MILESTONE_HOODWALLET_ACTIVATED =
  "0x239902d75dd4133b2e3c4f65fa01858d6e22407b7ed186aa42966e7f997962cf";

const MILESTONE_HOOD_TALK_SPOKEN =
  "0xae701161971ede8a03aaa7cf86b28afe5171979b2e6db2e67310b1bbfa90d37b";

const MILESTONE_PING_CLAIMED =
  "0xb08fecf851d41fdd453731545fe282b0e49a7d8efd63cc4b7a66550141a910d4";

/*//////////////////////////////////////////////////////////////
                              ABIS
//////////////////////////////////////////////////////////////*/

const HOOD_OS_READ_ABI = [
  "function isActive(uint256 tokenId) view returns (bool)",
] as const;

const JOURNEY_INTERFACE =
  new Interface([
    "function verifyAndRecord(uint256 tokenId,bytes32 milestoneId)",
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
  tokenId:
    string;

  name:
    string;

  image?:
    string;
};

type OwnershipResponse = {
  items?:
    OwnedHoodie[];

  error?:
    string;
};

type PingState =
  | "locked"
  | "available"
  | "home"
  | "away"
  | "unavailable";

type JourneyMilestone = {
  key:
    string;

  milestoneId:
    string;

  app:
    string;

  action:
    string;

  title:
    string;

  name:
    string;

  description:
    string;

  href:
    string;

  cta:
    string;

  completed:
    boolean;

  recorded:
    boolean;

  source:
    "journey" |
    "legacy" |
    null;

  currentlyTrue:
    boolean;

  completedAt:
    number | null;

  transactionHash:
    string | null;

  talkCount?:
    number;

  state?:
    PingState;
};

type JourneyResponse = {
  schemaVersion:
    string;

  tokenId:
    number;

  journeyRegistry:
    string;

  journeyStartBlock:
    number;

  hoodWallet: {
    address:
      string | null;

    active:
      boolean;

    everActivated:
      boolean;
  };

  momentsKnown:
    number;

  momentsRecorded:
    number;

  milestones:
    JourneyMilestone[];

  hoodTalk: {
    spoken:
      boolean;

    count:
      number;

    latest:
      {
        quote?:
          string;

        author?:
          string;

        updatedAt?:
          number;

        transactionHash?:
          string;
      } | null;
  };

  ping: {
    tokenId:
      number;

    claimed:
      boolean;

    canClaim:
      boolean;

    owner:
      string | null;

    hoodWallet:
      string | null;

    isHome:
      boolean;

    state:
      PingState;
  };
};

/*//////////////////////////////////////////////////////////////
                            HELPERS
//////////////////////////////////////////////////////////////*/

function errorMessage(
  error:
    unknown,

  fallback:
    string,
) {
  if (
    typeof error ===
      "object" &&
    error !==
      null
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
  tokenId:
    string,
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

function requireWalletAccount<T>(
  account:
    T | undefined,
): T {
  if (
    !account
  ) {
    throw new Error(
      "Wallet account unavailable.",
    );
  }

  return account;
}

function journeyMilestoneId(
  milestone:
    JourneyMilestone,
) {
  if (
    milestone.key ===
      "hoodWalletActivated"
  ) {
    return MILESTONE_HOODWALLET_ACTIVATED;
  }

  if (
    milestone.key ===
      "hoodTalkSpoken"
  ) {
    return MILESTONE_HOOD_TALK_SPOKEN;
  }

  if (
    milestone.key ===
      "pingClaimed"
  ) {
    return MILESTONE_PING_CLAIMED;
  }

  return milestone.milestoneId;
}

function milestoneAction(
  milestone:
    JourneyMilestone,

  journey:
    JourneyResponse,
) {
  if (
    milestone.key ===
      "hoodWalletActivated"
  ) {
    if (
      journey.hoodWallet.active
    ) {
      return {
        status:
          "● ACTIVE",

        description:
          "Your HoodWallet is active and ready.",

        href:
          "/hoodos",

        action:
          "OPEN HOODWALLET",
      };
    }

    if (
      journey.hoodWallet.everActivated
    ) {
      return {
        status:
          "○ NOT ACTIVE",

        description:
          "This HoodWallet was activated before. Activate it again to continue the Journey.",

        href:
          "/hoodos",

        action:
          "ACTIVATE YOUR HOODWALLET",
      };
    }

    return {
      status:
        "○ NOT ACTIVATED",

      description:
        "Activate your HoodWallet to start using your Hoodie onchain.",

      href:
        "/hoodos",

      action:
        "ACTIVATE YOUR HOODWALLET",
    };
  }

  if (
    milestone.key ===
      "hoodTalkSpoken"
  ) {
    if (
      milestone.completed
    ) {
      return {
        status:
          "● SPOKEN ONCHAIN",

        description:
          "Your Hoodie has already spoken onchain.",

        href:
          "/hood-talk",

        action:
          "OPEN HOOD TALK",
      };
    }

    return {
      status:
        "○ NOT SPOKEN",

      description:
        "Give your Hoodie a permanent voice onchain.",

      href:
        "/hood-talk",

      action:
        "OPEN HOOD TALK",
    };
  }

  if (
    milestone.key ===
      "pingClaimed"
  ) {
    if (
      journey.ping.state ===
        "home"
    ) {
      return {
        status:
          "● PING IS HOME",

        description:
          `Ping #${journey.tokenId} lives inside this HoodWallet.`,

        href:
          "/hoodos",

        action:
          "OPEN HOODWALLET",
      };
    }

    if (
      journey.ping.state ===
        "away"
    ) {
      return {
        status:
          "○ PING IS AWAY",

        description:
          `Ping #${journey.tokenId} was claimed before, but is no longer inside this HoodWallet.`,

        href:
          "/hoodos",

        action:
          "OPEN HOODWALLET",
      };
    }

    if (
      journey.ping.state ===
        "available"
    ) {
      return {
        status:
          "○ READY TO CLAIM",

        description:
          `Ping #${journey.tokenId} is waiting for this Hoodie.`,

        href:
          "/hoodos",

        action:
          `CLAIM PING #${journey.tokenId}`,
      };
    }

    if (
      journey.ping.state ===
        "locked"
    ) {
      return {
        status:
          "○ LOCKED",

        description:
          "Activate your HoodWallet first to unlock Ping.",

        href:
          "/hoodos",

        action:
          "ACTIVATE HOODWALLET",
      };
    }

    return {
      status:
        "○ UNAVAILABLE",

      description:
        "Ping is not currently available.",

      href:
        "/hoodos",

      action:
        "OPEN HOODWALLET",
    };
  }

  return {
    status:
      milestone.completed
        ? "● COMPLETE"
        : "○ NOT COMPLETE",

    description:
      milestone.description,

    href:
      milestone.href,

    action:
      milestone.cta,
  };
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

  if (
    failed
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-[#ccff00]">

        <p className="text-[7px] uppercase tracking-[0.14em]">
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
        500
      }

      height={
        500
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
                         HOODIE TILE
//////////////////////////////////////////////////////////////*/

function HoodieTile({
  hoodie,
  selected,
  active,
  onSelect,
}: {
  hoodie:
    OwnedHoodie;

  selected:
    boolean;

  active:
    boolean;

  onSelect:
    () => void;
}) {
  return (
    <button
      type="button"

      onClick={
        onSelect
      }

      className="w-[150px] shrink-0 text-left sm:w-[165px] md:w-[180px]"
    >
      <div
        className={`relative border border-[var(--hood-fg)] ${
          selected
            ? "outline outline-2 outline-offset-2 outline-[var(--hood-fg)]"
            : ""
        }`}
      >

        {/* ACTIVE BADGE */}

        {active && (

          <div className="absolute right-2 top-2 z-10 bg-black px-2 py-1 text-[6px] uppercase tracking-[0.12em] text-[#ccff00]">
            ● Active
          </div>

        )}

        <div className="aspect-square bg-[#ccff00]">

          <HoodieArtwork
            hoodie={
              hoodie
            }
          />

        </div>

        <div
          className={`border-t border-[var(--hood-fg)] px-3 py-2 ${
            selected
              ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
              : ""
          }`}
        >

          <p className="text-[6px] uppercase tracking-[0.12em] opacity-60">
            Hoodie
          </p>

          <p className="mt-1 text-[13px]">
            #
            {
              hoodie.tokenId
            }
          </p>

        </div>

      </div>
    </button>
  );
}

/*//////////////////////////////////////////////////////////////
                       JOURNEY ROW
//////////////////////////////////////////////////////////////*/

function JourneyRow({
  milestone,
  journey,
  checkingIn,
  onCheckIn,
}: {
  milestone:
    JourneyMilestone;

  journey:
    JourneyResponse;

  checkingIn:
    boolean;

  onCheckIn:
    (
      milestone:
        JourneyMilestone,
    ) => void;
}) {
  const task =
    milestoneAction(
      milestone,
      journey,
    );

  const checkedIn =
    milestone.recorded;

  /*
   * Underlying action must be true.
   *
   * Journey also requires an active canonical
   * HoodWallet to execute verifyAndRecord().
   */

  const canCheckIn =
    milestone.completed &&
    journey.hoodWallet.active &&
    !checkedIn;

  return (
    <article
      className={`border border-[var(--hood-fg)] transition-colors ${
        checkedIn
          ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
          : ""
      }`}
    >

      <div className="grid gap-5 p-5 lg:grid-cols-[180px_minmax(0,1fr)_220px] lg:items-center">

        {/* NAME */}

        <div>

          <p className="text-[7px] uppercase tracking-[0.16em] opacity-55">
            {
              milestone.app
            }
          </p>

          <h3 className="mt-2 text-2xl tracking-[-0.035em]">
            {
              milestone.title
            }
          </h3>

        </div>

        {/* STATUS */}

        <div>

          <p className="text-[11px] uppercase tracking-[0.05em]">
            {checkedIn
              ? "✓ TASK COMPLETED"
              : task.status}
          </p>

          <p className="mt-2 max-w-2xl text-[8px] uppercase leading-relaxed opacity-60">
            {checkedIn
              ? `${milestone.name} is now part of Hoodie #${journey.tokenId}'s Journey.`
              : task.description}
          </p>

          {!checkedIn && (

            <Link
              href={
                task.href
              }

              className="mt-3 inline-block text-[7px] uppercase tracking-[0.12em] underline underline-offset-4"
            >
              {
                task.action
              } →
            </Link>

          )}

        </div>

        {/* CHECK IN */}

        <div className="lg:text-right">

          {checkedIn ? (

            <div className="inline-flex min-h-[52px] w-full items-center justify-center border border-[var(--hood-bg)] px-4 text-[8px] uppercase tracking-[0.15em] lg:w-[200px]">
              ✓ Checked in
            </div>

          ) : (

            <button
              type="button"

              disabled={
                !canCheckIn ||
                checkingIn
              }

              onClick={() =>
                onCheckIn(
                  milestone,
                )
              }

              className={`min-h-[52px] w-full border px-4 text-[8px] uppercase tracking-[0.15em] lg:w-[200px] ${
                canCheckIn
                  ? "border-[var(--hood-fg)] bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                  : "border-[var(--hood-fg)] opacity-30"
              } disabled:cursor-not-allowed`}
            >
              {checkingIn
                ? "Checking in…"
                : canCheckIn
                  ? "Check in"
                  : milestone.completed &&
                      !journey.hoodWallet.active
                    ? "Activate wallet first"
                    : "Check in"}
            </button>

          )}

        </div>

      </div>

    </article>
  );
}

/*//////////////////////////////////////////////////////////////
                              PAGE
//////////////////////////////////////////////////////////////*/

export default function JourneyPage() {
  const {
    address,
    connect,
    ensureRequiredNetwork,
    getWalletClient,
  } =
    useWallet();

  /*
   * Journey starts in DARK mode.
   */

  const [
    darkHood,
    setDarkHood,
  ] =
    useState(
      true,
    );

  const [
    ownedHoodies,
    setOwnedHoodies,
  ] =
    useState<
      OwnedHoodie[]
    >([]);

  const [
    activeHoodies,
    setActiveHoodies,
  ] =
    useState<
      Record<
        string,
        boolean
      >
    >({});

  const [
    selectedTokenId,
    setSelectedTokenId,
  ] =
    useState("");

  const [
    journey,
    setJourney,
  ] =
    useState<
      JourneyResponse | null
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
    journeyLoading,
    setJourneyLoading,
  ] =
    useState(false);

  const [
    checkingInKey,
    setCheckingInKey,
  ] =
    useState<
      string | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    success,
    setSuccess,
  ] =
    useState<
      string | null
    >(null);

  const railRef =
    useRef<
      HTMLDivElement | null
    >(null);

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
                       LOAD ACTIVE BADGES
  //////////////////////////////////////////////////////////////*/

  const loadActiveBadges =
    useCallback(
      async (
        hoodies:
          OwnedHoodie[],
      ) => {
        if (
          !provider ||
          hoodies.length ===
            0
        ) {
          return;
        }

        const hoodOS =
          new Contract(
            siteConfig.hoodOSAddress,

            HOOD_OS_READ_ABI,

            provider,
          );

        const result:
          Record<
            string,
            boolean
          > =
          {};

        /*
         * Process small groups so a collector with
         * 50+ Hoodies doesn't fire everything at once.
         */

        const chunkSize =
          10;

        for (
          let start = 0;
          start <
          hoodies.length;
          start +=
          chunkSize
        ) {
          const chunk =
            hoodies.slice(
              start,
              start +
                chunkSize,
            );

          const states =
            await Promise.all(
              chunk.map(
                async (
                  hoodie,
                ) => {
                  try {
                    const active =
                      (await hoodOS.isActive(
                        BigInt(
                          hoodie.tokenId,
                        ),
                      )) as boolean;

                    return [
                      hoodie.tokenId,
                      active,
                    ] as const;
                  } catch {
                    return [
                      hoodie.tokenId,
                      false,
                    ] as const;
                  }
                },
              ),
            );

          for (
            const [
              tokenId,
              active,
            ] of states
          ) {
            result[
              tokenId
            ] =
              active;
          }
        }

        setActiveHoodies(
          result,
        );
      },
      [
        provider,
      ],
    );

  /*//////////////////////////////////////////////////////////////
                         OWNERSHIP
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

          setJourney(
            null,
          );

          setActiveHoodies(
            {},
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
            )
              .sort(
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

          void loadActiveBadges(
            unique,
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

          setActiveHoodies(
            {},
          );

          setJourney(
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
        loadActiveBadges,
      ],
    );

  useEffect(() => {
    let cancelled =
      false;

    queueMicrotask(() => {
      if (
        !cancelled
      ) {
        void loadOwnership();
      }
    });

    return () => {
      cancelled =
        true;
    };
  }, [
    loadOwnership,
  ]);

  /*//////////////////////////////////////////////////////////////
                          JOURNEY LOAD
  //////////////////////////////////////////////////////////////*/

  const loadJourney =
    useCallback(
      async (
        tokenIdInput?:
          string,
      ) => {
        const tokenId =
          tokenIdInput ||
          selectedTokenId;

        if (
          !tokenId
        ) {
          return;
        }

        setJourneyLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const response =
            await fetch(
              `${PUBLIC_API}/v1/token/${encodeURIComponent(
                tokenId,
              )}/journey`,

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
              JourneyResponse & {
                error?:
                  string;
              };

          if (
            !response.ok
          ) {
            throw new Error(
              payload.error ||
                `Unable to load Hoodie #${tokenId} Journey.`,
            );
          }

          setJourney(
            payload,
          );

          setActiveHoodies(
            (
              current,
            ) => ({
              ...current,

              [
                tokenId
              ]:
                payload
                  .hoodWallet
                  .active,
            }),
          );
        } catch (
          journeyError
        ) {
          console.error(
            journeyError,
          );

          setJourney(
            null,
          );

          setError(
            errorMessage(
              journeyError,

              `Unable to load Hoodie #${tokenId} Journey.`,
            ),
          );
        } finally {
          setJourneyLoading(
            false,
          );
        }
      },
      [
        selectedTokenId,
      ],
    );

  useEffect(() => {
    if (
      !selectedTokenId
    ) {
      return;
    }

    let cancelled =
      false;

    queueMicrotask(() => {
      if (
        !cancelled
      ) {
        void loadJourney(
          selectedTokenId,
        );
      }
    });

    return () => {
      cancelled =
        true;
    };
  }, [
    selectedTokenId,
    loadJourney,
  ]);

  /*//////////////////////////////////////////////////////////////
                    WAIT FOR TRANSACTION
  //////////////////////////////////////////////////////////////*/

  const waitForHash =
    useCallback(
      async (
        hash:
          string,
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
                         CHECK IN
  //////////////////////////////////////////////////////////////*/

  const checkIn =
    useCallback(
      async (
        milestone:
          JourneyMilestone,
      ) => {
        if (
          !journey ||
          !journey.hoodWallet.address
        ) {
          return;
        }

        if (
          milestone.recorded
        ) {
          return;
        }

        if (
          !milestone.completed
        ) {
          setError(
            "Complete the action first.",
          );

          return;
        }

        if (
          !journey.hoodWallet.active
        ) {
          setError(
            "Activate this HoodWallet before checking in.",
          );

          return;
        }

        try {
          setError(
            null,
          );

          setSuccess(
            null,
          );

          setCheckingInKey(
            milestone.key,
          );

          await ensureRequiredNetwork();

          const walletClient =
            await getWalletClient();

          /*
           * Journey verifyAndRecord MUST be called by
           * the canonical HoodWallet.
           *
           * Therefore the connected Hoodie owner calls:
           *
           * HoodWallet.execute(
           *   JourneyRegistry,
           *   0,
           *   verifyAndRecord(...),
           *   CALL
           * )
           */

          const journeyData =
            JOURNEY_INTERFACE.encodeFunctionData(
              "verifyAndRecord",

              [
                BigInt(
                  journey.tokenId,
                ),

                journeyMilestoneId(
                  milestone,
                ),
              ],
            ) as Hex;

          const hash =
            await walletClient.writeContract({
              chain:
                null,

              address:
                journey
                  .hoodWallet
                  .address as Address,

              abi:
                HOOD_WALLET_EXECUTE_ABI,

              functionName:
                "execute",

              args: [
                JOURNEY_REGISTRY as Address,

                BigInt(0),

                journeyData,

                OPERATION_CALL,
              ],

              value:
                BigInt(0),

              account:
                requireWalletAccount(
                  walletClient.account,
                ),
            });

          await waitForHash(
            hash,
          );

          /*
           * Transaction succeeded, therefore
           * JourneyRegistry accepted and recorded it.
           *
           * Update UI immediately instead of waiting
           * for the hourly Worker event index.
           */

          setJourney(
            (
              current,
            ) => {
              if (
                !current
              ) {
                return current;
              }

              return {
                ...current,

                momentsRecorded:
                  current
                    .momentsRecorded +
                  (
                    current.milestones.some(
                      (
                        item,
                      ) =>
                        item.key ===
                          milestone.key &&
                        item.recorded,
                    )
                      ? 0
                      : 1
                  ),

                milestones:
                  current.milestones.map(
                    (
                      item,
                    ) =>
                      item.key ===
                      milestone.key
                        ? {
                            ...item,

                            recorded:
                              true,

                            source:
                              "journey",

                            transactionHash:
                              hash,
                          }
                        : item,
                  ),
              };
            },
          );

          setSuccess(
            `${milestone.name} checked into Hoodie #${journey.tokenId}'s Journey.`,
          );

          /*
           * Celebration belongs to the CHECK IN.
           */

          void confetti({
            particleCount:
              160,

            spread:
              100,

            startVelocity:
              38,

            scalar:
              0.9,

            ticks:
              190,

            origin: {
              y:
                0.65,
            },

            disableForReducedMotion:
              true,
          });

          window.setTimeout(
            () => {
              setSuccess(
                null,
              );
            },
            4500,
          );
        } catch (
          checkInError
        ) {
          console.error(
            checkInError,
          );

          setError(
            errorMessage(
              checkInError,

              "Journey check-in failed.",
            ),
          );
        } finally {
          setCheckingInKey(
            null,
          );
        }
      },
      [
        ensureRequiredNetwork,
        getWalletClient,
        journey,
        waitForHash,
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

      <section className="mx-auto max-w-[1400px] px-4 pb-24 pt-20 md:px-6 md:pt-24">

        {/* TOP BAR */}

        <div className="flex items-center justify-between border-b border-[var(--hood-fg)] pb-3">

          <p className="text-[9px] uppercase tracking-[0.16em]">
            OnChainHoodies / Journey
          </p>

          <div className="flex items-center gap-4">

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

        {/* SIMPLE HEADER */}

        <div className="border-b border-[var(--hood-fg)] py-8">

          <h1 className="text-5xl leading-none tracking-[-0.055em] md:text-7xl">
            HOODIE JOURNEY
          </h1>

          <div className="mt-7 grid gap-3 md:grid-cols-3">

            <div className="border-l border-[var(--hood-fg)] pl-4">

              <p className="text-3xl">
                1.
              </p>

              <p className="mt-2 text-[9px] uppercase tracking-[0.12em]">
                Pick your Hoodie
              </p>

            </div>

            <div className="border-l border-[var(--hood-fg)] pl-4">

              <p className="text-3xl">
                2.
              </p>

              <p className="mt-2 text-[9px] uppercase tracking-[0.12em]">
                Complete an action
              </p>

            </div>

            <div className="border-l border-[var(--hood-fg)] pl-4">

              <p className="text-3xl">
                3.
              </p>

              <p className="mt-2 text-[9px] uppercase tracking-[0.12em]">
                Check in onchain
              </p>

            </div>

          </div>

          <p className="mt-7 max-w-3xl text-sm leading-relaxed opacity-65">
            Every Hoodie builds a history.
            Discover what yours has already done,
            what it can do next, and add it to its
            onchain Journey.
          </p>

        </div>

        {/* CONNECT */}

        {!address ? (

          <div className="mt-6 border border-[var(--hood-fg)] p-10 text-center">

            <h2 className="text-4xl tracking-[-0.04em]">
              START YOUR JOURNEY
            </h2>

            <p className="mt-4 text-[9px] uppercase opacity-60">
              Connect the wallet holding your Hoodie.
            </p>

            <button
              type="button"

              onClick={() =>
                void connect()
              }

              className="mt-6 bg-[var(--hood-fg)] px-8 py-4 text-[9px] uppercase tracking-[0.15em] text-[var(--hood-bg)]"
            >
              Connect wallet
            </button>

            <div className="mt-7">

              <a
                href={
                  OPENSEA_COLLECTION
                }

                target="_blank"

                rel="noreferrer"

                className="text-[8px] uppercase underline underline-offset-4"
              >
                Buy secondary on OpenSea →
              </a>

            </div>

          </div>

        ) : ownershipLoading ? (

          <div className="mt-6 border border-[var(--hood-fg)] p-8 text-center">

            <p className="text-[9px] uppercase tracking-[0.14em]">
              Reading Hoodie ownership…
            </p>

          </div>

        ) : ownershipChecked &&
          ownedHoodies.length ===
            0 ? (

          <div className="mt-6 border border-[var(--hood-fg)] p-10 text-center">

            <h2 className="text-4xl">
              START YOUR JOURNEY
            </h2>

            <p className="mt-4 text-[9px] uppercase opacity-60">
              No OnChainHoodie found in this wallet.
            </p>

            <a
              href={
                OPENSEA_COLLECTION
              }

              target="_blank"

              rel="noreferrer"

              className="mt-6 inline-block bg-[var(--hood-fg)] px-8 py-4 text-[9px] uppercase tracking-[0.14em] text-[var(--hood-bg)]"
            >
              Buy secondary →
            </a>

          </div>

        ) : (

          <>

            {/* ONE ROW / HORIZONTAL SCROLL */}

            <section className="mt-7">

              <div className="flex items-end justify-between">

                <div>

                  <p className="text-[7px] uppercase tracking-[0.16em] opacity-50">
                    Connected collection
                  </p>

                  <h2 className="mt-2 text-3xl tracking-[-0.04em]">
                    YOUR HOODIES
                  </h2>

                </div>

                <p className="text-[7px] uppercase opacity-50">
                  {
                    ownedHoodies.length
                  }{" "}
                  owned
                </p>

              </div>

              <div
                ref={
                  railRef
                }

                className="mt-4 flex gap-3 overflow-x-auto pb-4 [scrollbar-width:thin]"
              >

                {ownedHoodies.map(
                  (
                    hoodie,
                  ) => (

                    <HoodieTile
                      key={
                        hoodie.tokenId
                      }

                      hoodie={
                        hoodie
                      }

                      selected={
                        hoodie.tokenId ===
                        selectedTokenId
                      }

                      active={
                        activeHoodies[
                          hoodie.tokenId
                        ] ===
                        true
                      }

                      onSelect={() => {
                        setSuccess(
                          null,
                        );

                        setError(
                          null,
                        );

                        setJourney(
                          null,
                        );

                        setSelectedTokenId(
                          hoodie.tokenId,
                        );
                      }}
                    />

                  ),
                )}

              </div>

            </section>

            {/* JOURNEY */}

            <section className="mt-10">

              <div className="flex items-end justify-between border-b border-[var(--hood-fg)] pb-4">

                <div>

                  <p className="text-[7px] uppercase tracking-[0.16em] opacity-50">
                    Start your Journey
                  </p>

                  <h2 className="mt-2 text-4xl tracking-[-0.05em] md:text-5xl">
                    HOODIE #
                    {
                      selectedTokenId
                    }{" "}
                    JOURNEY
                  </h2>

                </div>

                {activeHoodies[
                  selectedTokenId
                ] && (

                  <span className="bg-[var(--hood-fg)] px-3 py-2 text-[7px] uppercase tracking-[0.12em] text-[var(--hood-bg)]">
                    ● HoodWallet active
                  </span>

                )}

              </div>

              {journeyLoading &&
              !journey ? (

                <div className="mt-4 border border-[var(--hood-fg)] p-8 text-center">

                  <p className="text-[8px] uppercase tracking-[0.13em]">
                    Reading Journey…
                  </p>

                </div>

              ) : journey ? (

                <div className="mt-4 space-y-3">

                  {journey.milestones.map(
                    (
                      milestone,
                    ) => (

                      <JourneyRow
                        key={
                          milestone.key
                        }

                        milestone={
                          milestone
                        }

                        journey={
                          journey
                        }

                        checkingIn={
                          checkingInKey ===
                          milestone.key
                        }

                        onCheckIn={(
                          item,
                        ) =>
                          void checkIn(
                            item,
                          )
                        }
                      />

                    ),
                  )}

                </div>

              ) : null}

            </section>

          </>

        )}

        {/* SUCCESS */}

        {success && (

          <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 border border-[#ccff00] bg-black p-5 text-center text-[#ccff00]">

            <p className="text-[7px] uppercase tracking-[0.16em] opacity-55">
              Journey updated
            </p>

            <p className="mt-2 text-[10px] uppercase leading-relaxed">
              {
                success
              }
            </p>

          </div>

        )}

        {/* ERROR */}

        {error && (

          <div className="mt-5 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-4 text-[var(--hood-bg)]">

            <p className="text-[8px] uppercase leading-relaxed">
              {
                error
              }
            </p>

          </div>

        )}

      </section>

      <SiteFooter />

    </main>
  );
}