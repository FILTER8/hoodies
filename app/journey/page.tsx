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

import confetti from "canvas-confetti";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

import {
  useWallet,
} from "../../components/WalletProvider";

import {
  apiConfig,
  collectionApiUrl,
} from "../../lib/api";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

const OPENSEA_COLLECTION =
  "https://opensea.io/collection/onchainhoodies-";

/*
 * Journey API is part of the public OCH API.
 */

const PUBLIC_API =
  "https://api.onchainhoodies.xyz";

/*
 * Keep ecosystem destinations here.
 *
 * This becomes the single place where we add
 * community / builder destinations over time.
 *
 * Adjust any route below if your current local
 * route differs.
 */

const ECOSYSTEM_LINKS = [
  {
    key:
      "hoodwallet",

    title:
      "HOODWALLET",

    description:
      "Activate your Hoodie's onchain wallet and manage what it owns.",

    href:
      "/hoodos",

    label:
      "OPEN HOODWALLET",

    season2:
      true,
  },

  {
    key:
      "hoodtalk",

    title:
      "HOOD TALK",

    description:
      "Give your Hoodie a permanent voice onchain.",

    href:
      "/hood-talk",

    label:
      "OPEN HOOD TALK",

    season2:
      true,
  },

  {
    key:
      "hoodiestudio",

    title:
      "HOODIESTUDIO",

    description:
      "Create fully onchain artwork with your Hoodie.",

    href:
      "/hoodiestudio",

    label:
      "OPEN STUDIO",

    season2:
      true,
  },

  {
    key:
      "buyos",

    title:
      "BUYOS",

    description:
      "Collect Robinhood Chain assets directly through your Hoodie.",

    href:
      "/hoodos/buy",

    label:
      "OPEN BUYOS",

    season2:
      true,
  },

  {
    key:
      "mintos",

    title:
      "MINTOS",

    description:
      "Mint supported public drops directly through your Hoodie.",

    href:
      "/hoodos/mint",

    label:
      "OPEN MINTOS",

    season2:
      true,
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

  season2:
    boolean;

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
    "locked" |
    "available" |
    "home" |
    "away" |
    "unavailable";
};

type JourneyResponse = {
  schemaVersion:
    string;

  tokenId:
    number;

  image:
    string;

  token:
    string;

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
      "locked" |
      "available" |
      "home" |
      "away" |
      "unavailable";
  };

  links?: {
    token?:
      string;

    hoodTalk?:
      string;

    hoodTalkHistory?:
      string;

    journeyStats?:
      string;

    journeyMilestones?:
      string;
  };
};

type JourneyFilter =
  | "all"
  | "season2";

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

function formatDate(
  timestamp?:
    number | null,
) {
  if (
    !timestamp
  ) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(
      "en",
      {
        month:
          "short",

        day:
          "2-digit",

        year:
          "numeric",
      },
    )
      .format(
        new Date(
          timestamp *
            1000,
        ),
      )
      .toUpperCase();
  } catch {
    return null;
  }
}

function pingStateLabel(
  state:
    JourneyResponse["ping"]["state"],
) {
  switch (
    state
  ) {
    case "home":
      return "PING IS HOME";

    case "away":
      return "PING IS AWAY";

    case "available":
      return "PING IS WAITING";

    case "locked":
      return "ACTIVATE TO UNLOCK";

    case "unavailable":
      return "CURRENTLY UNAVAILABLE";

    default:
      return "PING";
  }
}

function milestoneStatus(
  milestone:
    JourneyMilestone,
) {
  if (
    milestone.key ===
      "pingClaimed"
  ) {
    switch (
      milestone.state
    ) {
      case "home":
        return "● HOME";

      case "away":
        return "○ AWAY";

      case "available":
        return "○ AVAILABLE";

      case "locked":
        return "○ LOCKED";

      default:
        break;
    }
  }

  if (
    milestone.key ===
      "hoodWalletActivated"
  ) {
    if (
      milestone.currentlyTrue
    ) {
      return "● ACTIVE";
    }

    if (
      milestone.completed
    ) {
      return "○ INACTIVE";
    }
  }

  if (
    milestone.completed
  ) {
    return "✓ HISTORY";
  }

  return "○ DISCOVER";
}

/*//////////////////////////////////////////////////////////////
                         HOODIE ARTWORK
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

      width={640}

      height={640}

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
  onSelect,
}: {
  hoodie:
    OwnedHoodie;

  selected:
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

      className={`group text-left transition-transform ${
        selected
          ? "translate-y-[-2px]"
          : "hover:translate-y-[-2px]"
      }`}
    >
      <div
        className={`border ${
          selected
            ? "border-[var(--hood-fg)] bg-[var(--hood-fg)]"
            : "border-[var(--hood-fg)]"
        }`}
      >
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
              ? "text-[var(--hood-bg)]"
              : ""
          }`}
        >
          <p className="text-[7px] uppercase tracking-[0.12em] opacity-60">
            Hoodie
          </p>

          <p className="mt-1 text-[14px]">
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
                       JOURNEY CARD
//////////////////////////////////////////////////////////////*/

function JourneyCard({
  milestone,
  journey,
}: {
  milestone:
    JourneyMilestone;

  journey:
    JourneyResponse;
}) {
  const date =
    formatDate(
      milestone.completedAt,
    );

  const isPing =
    milestone.key ===
    "pingClaimed";

  const isHoodTalk =
    milestone.key ===
    "hoodTalkSpoken";

  const isWallet =
    milestone.key ===
    "hoodWalletActivated";

  const complete =
    milestone.completed;

  const status =
    milestoneStatus(
      milestone,
    );

  return (
    <article className="flex h-full flex-col border border-[var(--hood-fg)]">

      {/* TOP */}

      <div className="flex items-center justify-between gap-3 border-b border-[var(--hood-fg)] px-4 py-3">

        <p className="text-[8px] uppercase tracking-[0.16em]">
          {
            milestone.title
          }
        </p>

        <div className="flex items-center gap-2">

          {milestone.season2 && (
            <span className="border border-[var(--hood-fg)] px-2 py-1 text-[6px] uppercase tracking-[0.12em]">
              Season 2
            </span>
          )}

          <span
            className={`text-[7px] uppercase ${
              complete
                ? ""
                : "opacity-60"
            }`}
          >
            {
              status
            }
          </span>

        </div>

      </div>

      {/* BODY */}

      <div className="flex flex-1 flex-col p-5">

        <p className="text-[7px] uppercase tracking-[0.16em] opacity-50">
          {
            milestone.app
          }
          {" / "}
          {
            milestone.action
          }
        </p>

        <h3 className="mt-3 text-3xl leading-none tracking-[-0.045em]">
          {
            milestone.name
          }
        </h3>

        <p className="mt-4 max-w-md text-[10px] leading-relaxed opacity-65">
          {
            milestone.description
          }
        </p>

        {/* HOODWALLET LIVE */}

        {isWallet && (
          <div className="mt-5 border border-[var(--hood-fg)] p-3">

            <p className="text-[6px] uppercase tracking-[0.12em] opacity-50">
              Current state
            </p>

            <p className="mt-2 text-[10px] uppercase">
              {journey.hoodWallet.active
                ? "● HoodWallet active"
                : journey.hoodWallet.everActivated
                  ? "○ Previously activated"
                  : "○ Not activated"}
            </p>

          </div>
        )}

        {/* HOOD TALK */}

        {isHoodTalk &&
          journey.hoodTalk.latest?.quote && (

          <div className="mt-5 border border-[var(--hood-fg)] p-3">

            <p className="text-[6px] uppercase tracking-[0.12em] opacity-50">
              Latest Hood Talk
            </p>

            <p className="mt-2 text-[10px] leading-relaxed">
              “{
                journey.hoodTalk.latest.quote
              }”
            </p>

            {journey.hoodTalk.count >
              0 && (

              <p className="mt-3 text-[6px] uppercase opacity-50">
                {
                  journey.hoodTalk.count
                }{" "}
                talk
                {journey.hoodTalk.count ===
                1
                  ? ""
                  : "s"}{" "}
                recorded
              </p>

            )}

          </div>

        )}

        {/* PING */}

        {isPing && (

          <div className="mt-5 border border-[var(--hood-fg)] p-3">

            <p className="text-[6px] uppercase tracking-[0.12em] opacity-50">
              Current state
            </p>

            <p className="mt-2 text-[11px] uppercase">
              {
                pingStateLabel(
                  journey.ping.state,
                )
              }
            </p>

            {journey.ping.state ===
              "home" && (

              <p className="mt-2 text-[7px] uppercase leading-relaxed opacity-55">
                Ping #
                {
                  journey.tokenId
                }{" "}
                currently lives inside Hoodie #
                {
                  journey.tokenId
                }&apos;s HoodWallet.
              </p>

            )}

            {journey.ping.state ===
              "away" && (

              <p className="mt-2 text-[7px] uppercase leading-relaxed opacity-55">
                Ping #
                {
                  journey.tokenId
                }{" "}
                was claimed before, but no longer lives inside this HoodWallet.
              </p>

            )}

            {journey.ping.state ===
              "available" && (

              <p className="mt-2 text-[7px] uppercase leading-relaxed opacity-55">
                Your HoodWallet is active. Ping #
                {
                  journey.tokenId
                }{" "}
                is ready to be claimed.
              </p>

            )}

            {journey.ping.state ===
              "locked" && (

              <p className="mt-2 text-[7px] uppercase leading-relaxed opacity-55">
                Activate the HoodWallet first to unlock the matching Ping.
              </p>

            )}

          </div>

        )}

        {/* HISTORY */}

        {complete && (

          <div className="mt-5">

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[6px] uppercase tracking-[0.11em] opacity-55">

              <span>
                ✓ Known onchain
              </span>

              {milestone.recorded && (
                <>
                  <span>
                    /
                  </span>

                  <span>
                    Journey recorded
                  </span>
                </>
              )}

              {date && (
                <>
                  <span>
                    /
                  </span>

                  <span>
                    {
                      date
                    }
                  </span>
                </>
              )}

            </div>

          </div>

        )}

        <div className="mt-auto pt-6">

          {!complete ||
          (
            isPing &&
            journey.ping.state !==
              "home"
          ) ||
          (
            isWallet &&
            !journey.hoodWallet.active
          ) ? (

            <Link
              href={
                milestone.href
              }

              className="block w-full bg-[var(--hood-fg)] px-4 py-4 text-center text-[8px] uppercase tracking-[0.14em] text-[var(--hood-bg)]"
            >
              {
                milestone.cta
              } →
            </Link>

          ) : (

            <Link
              href={
                milestone.href
              }

              className="block w-full border border-[var(--hood-fg)] px-4 py-4 text-center text-[8px] uppercase tracking-[0.14em]"
            >
              Visit {
                milestone.title
              } →
            </Link>

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
  } =
    useWallet();

  const [
    darkHood,
    setDarkHood,
  ] =
    useState(false);

  const [
    filter,
    setFilter,
  ] =
    useState<JourneyFilter>(
      "all",
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
    journey,
    setJourney,
  ] =
    useState<
      JourneyResponse | null
    >(null);

  const [
    journeyLoading,
    setJourneyLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  /*
   * Tracks previous milestone completion state.
   *
   * Confetti only fires when a milestone changes
   * false -> true while this page is open.
   */

  const previousCompletionRef =
    useRef<
      Record<
        string,
        boolean
      >
    >({});

  const [
    celebration,
    setCelebration,
  ] =
    useState<
      string | null
    >(null);

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
        } catch (
          ownershipError
        ) {
          console.error(
            ownershipError,
          );

          setOwnedHoodies(
            [],
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

          /*
           * Detect genuinely NEW completion states.
           *
           * On the first load we establish the baseline
           * and do NOT fire confetti for old history.
           */

          const previous =
            previousCompletionRef.current;

          const hasBaseline =
            Object.keys(
              previous,
            ).length >
            0;

          if (
            hasBaseline
          ) {
            const newlyCompleted =
              payload.milestones.find(
                (
                  milestone,
                ) =>
                  milestone.completed &&
                  previous[
                    milestone.key
                  ] ===
                    false,
              );

            if (
              newlyCompleted
            ) {
              setCelebration(
                newlyCompleted.name,
              );

              void confetti({
                particleCount:
                  110,

                spread:
                  80,

                origin: {
                  y:
                    0.68,
                },

                scalar:
                  0.8,

                ticks:
                  170,

                disableForReducedMotion:
                  true,
              });

              window.setTimeout(
                () => {
                  setCelebration(
                    null,
                  );
                },
                3600,
              );
            }
          }

          previousCompletionRef.current =
            Object.fromEntries(
              payload.milestones.map(
                (
                  milestone,
                ) => [
                  milestone.key,
                  milestone.completed,
                ],
              ),
            );

          setJourney(
            payload,
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

    /*
     * New Hoodie = new celebration baseline.
     */

    previousCompletionRef.current =
      {};

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

  /*
   * Refresh when user comes back to Journey after
   * completing an action in another tab / route.
   *
   * That is where the completion transition and
   * confetti can happen.
   */

  useEffect(() => {
    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
            "visible" &&
          selectedTokenId
        ) {
          void loadJourney(
            selectedTokenId,
          );
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );
    };
  }, [
    loadJourney,
    selectedTokenId,
  ]);

  /*//////////////////////////////////////////////////////////////
                        DERIVED STATE
  //////////////////////////////////////////////////////////////*/

  const selectedHoodie =
    useMemo(
      () =>
        ownedHoodies.find(
          (
            hoodie,
          ) =>
            hoodie.tokenId ===
            selectedTokenId,
        ) ||
        null,
      [
        ownedHoodies,
        selectedTokenId,
      ],
    );

  const visibleMilestones =
    useMemo(
      () => {
        if (
          !journey
        ) {
          return [];
        }

        if (
          filter ===
          "season2"
        ) {
          return journey.milestones.filter(
            (
              milestone,
            ) =>
              milestone.season2,
          );
        }

        return journey.milestones;
      },
      [
        filter,
        journey,
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

      {/* CELEBRATION */}

      {celebration && (

        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 border border-[#ccff00] bg-black px-6 py-4 text-center text-[#ccff00] shadow-xl">

          <p className="text-[7px] uppercase tracking-[0.2em] opacity-60">
            Journey updated
          </p>

          <p className="mt-2 text-[12px] uppercase tracking-[0.1em]">
            ✓ {
              celebration
            }
          </p>

        </div>

      )}

      <section className="mx-auto max-w-[1400px] px-4 pb-24 pt-20 md:px-6 md:pt-24">

        {/* PAGE HEADER */}

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

        {/* HERO */}

        <div className="grid gap-8 border-b border-[var(--hood-fg)] py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">

          <div>

            <p className="text-[8px] uppercase tracking-[0.2em] opacity-55">
              The chain remembers
            </p>

            <h1 className="mt-4 max-w-4xl text-[clamp(4rem,10vw,9rem)] leading-[0.72] tracking-[-0.075em]">
              YOUR
              <br />
              JOURNEY
            </h1>

          </div>

          <div className="lg:pb-2">

            <p className="max-w-md text-sm leading-relaxed opacity-70">
              Every Hoodie builds a history.
              Discover what yours has already done,
              what it can do next, and where the Hood
              is growing.
            </p>

            <p className="mt-5 text-[7px] uppercase leading-relaxed tracking-[0.12em] opacity-50">
              No levels. No completion percentage.
              Just onchain Hoodie history.
            </p>

          </div>

        </div>

        {/* NOT CONNECTED */}

        {!address ? (

          <div className="mt-6 grid min-h-[460px] place-items-center border border-[var(--hood-fg)] p-8 text-center">

            <div className="max-w-xl">

              <p className="text-[8px] uppercase tracking-[0.2em] opacity-55">
                Start here
              </p>

              <h2 className="mt-4 text-5xl tracking-[-0.06em] md:text-7xl">
                YOUR HOODIE
                <br />
                HAS A STORY
              </h2>

              <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed opacity-65">
                Connect the wallet holding your
                OnChainHoodies to explore their Journey.
              </p>

              <button
                type="button"

                onClick={() =>
                  void connect()
                }

                className="mt-7 border border-[var(--hood-fg)] bg-[var(--hood-fg)] px-8 py-4 text-[9px] uppercase tracking-[0.16em] text-[var(--hood-bg)]"
              >
                Connect wallet
              </button>

              <div className="mt-8">

                <p className="text-[7px] uppercase opacity-50">
                  No Hoodie yet?
                </p>

                <a
                  href={
                    OPENSEA_COLLECTION
                  }

                  target="_blank"

                  rel="noreferrer"

                  className="mt-2 inline-block text-[8px] uppercase underline underline-offset-4"
                >
                  Buy secondary on OpenSea →
                </a>

              </div>

            </div>

          </div>

        ) : ownershipLoading ? (

          <div className="mt-6 border border-[var(--hood-fg)] p-10 text-center">

            <p className="text-[9px] uppercase tracking-[0.15em]">
              Reading Hoodie ownership…
            </p>

          </div>

        ) : ownershipChecked &&
          ownedHoodies.length ===
            0 ? (

          <div className="mt-6 grid min-h-[420px] place-items-center border border-[var(--hood-fg)] p-8 text-center">

            <div>

              <p className="text-[8px] uppercase tracking-[0.2em] opacity-55">
                Start your Journey
              </p>

              <h2 className="mt-4 text-5xl tracking-[-0.055em]">
                NO HOODIE
                <br />
                FOUND
              </h2>

              <p className="mt-5 text-sm opacity-65">
                Collect an OnChainHoodie to begin.
              </p>

              <a
                href={
                  OPENSEA_COLLECTION
                }

                target="_blank"

                rel="noreferrer"

                className="mt-7 inline-block bg-[var(--hood-fg)] px-8 py-4 text-[9px] uppercase tracking-[0.16em] text-[var(--hood-bg)]"
              >
                Buy secondary →
              </a>

            </div>

          </div>

        ) : (

          <>

            {/* HOODIE TILES */}

            <section className="mt-6">

              <div className="flex items-end justify-between gap-4">

                <div>

                  <p className="text-[8px] uppercase tracking-[0.18em] opacity-55">
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

              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">

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

                      onSelect={() => {
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

            {/* SELECTED JOURNEY */}

            {journeyLoading &&
            !journey ? (

              <div className="mt-10 border border-[var(--hood-fg)] p-10 text-center">

                <p className="text-[9px] uppercase tracking-[0.15em]">
                  Reading Hoodie #
                  {
                    selectedTokenId
                  }
                  &apos;s Journey…
                </p>

              </div>

            ) : journey &&
              selectedHoodie ? (

              <>

                {/* IDENTITY */}

                <section className="mt-12 grid border border-[var(--hood-fg)] lg:grid-cols-[340px_minmax(0,1fr)]">

                  <div className="border-b border-[var(--hood-fg)] bg-[#ccff00] lg:border-b-0 lg:border-r">

                    <div className="aspect-square">

                      <HoodieArtwork
                        hoodie={
                          selectedHoodie
                        }
                      />

                    </div>

                    <div className="border-t border-black bg-[#ccff00] p-4 text-black">

                      <p className="text-[7px] uppercase tracking-[0.14em]">
                        OnChainHoodie
                      </p>

                      <p className="mt-1 text-4xl">
                        #
                        {
                          journey.tokenId
                        }
                      </p>

                    </div>

                  </div>

                  <div className="flex min-w-0 flex-col justify-between p-6 md:p-8">

                    <div>

                      <p className="text-[7px] uppercase tracking-[0.18em] opacity-50">
                        Hoodie history
                      </p>

                      <h2 className="mt-3 text-5xl tracking-[-0.06em] md:text-7xl">
                        {
                          journey.momentsKnown
                        }{" "}
                        MOMENT
                        {journey.momentsKnown ===
                        1
                          ? ""
                          : "S"}
                      </h2>

                      <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-65">
                        These are things Hoodie #
                        {
                          journey.tokenId
                        }{" "}
                        has already done or can do
                        across the growing OCH ecosystem.
                      </p>

                    </div>

                    <div className="mt-8 grid gap-2 sm:grid-cols-2">

                      <div className="border border-[var(--hood-fg)] p-4">

                        <p className="text-[6px] uppercase tracking-[0.14em] opacity-50">
                          HoodWallet
                        </p>

                        <p className="mt-2 text-[10px] uppercase">
                          {journey.hoodWallet.active
                            ? "● Active"
                            : journey.hoodWallet.everActivated
                              ? "○ Inactive"
                              : "○ Not activated"}
                        </p>

                      </div>

                      <div className="border border-[var(--hood-fg)] p-4">

                        <p className="text-[6px] uppercase tracking-[0.14em] opacity-50">
                          Ping #
                          {
                            journey.tokenId
                          }
                        </p>

                        <p className="mt-2 text-[10px] uppercase">
                          {
                            pingStateLabel(
                              journey.ping.state,
                            )
                          }
                        </p>

                      </div>

                    </div>

                  </div>

                </section>

                {/* FILTER */}

                <section className="mt-8">

                  <div className="flex flex-col justify-between gap-4 border-b border-[var(--hood-fg)] pb-4 sm:flex-row sm:items-end">

                    <div>

                      <p className="text-[8px] uppercase tracking-[0.18em] opacity-50">
                        Hoodie #
                        {
                          journey.tokenId
                        }
                      </p>

                      <h2 className="mt-2 text-4xl tracking-[-0.05em]">
                        JOURNEY
                      </h2>

                    </div>

                    <div className="grid grid-cols-2 border border-[var(--hood-fg)]">

                      <button
                        type="button"

                        onClick={() =>
                          setFilter(
                            "all",
                          )
                        }

                        className={`px-5 py-3 text-[7px] uppercase tracking-[0.14em] ${
                          filter ===
                          "all"
                            ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                            : ""
                        }`}
                      >
                        All
                      </button>

                      <button
                        type="button"

                        onClick={() =>
                          setFilter(
                            "season2",
                          )
                        }

                        className={`border-l border-[var(--hood-fg)] px-5 py-3 text-[7px] uppercase tracking-[0.14em] ${
                          filter ===
                          "season2"
                            ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                            : ""
                        }`}
                      >
                        Season 2
                      </button>

                    </div>

                  </div>

                  {filter ===
                    "season2" && (

                    <div className="mt-3 border border-[var(--hood-fg)] px-4 py-3">

                      <p className="text-[7px] uppercase leading-relaxed tracking-[0.11em] opacity-60">
                        Season 2 highlights ecosystem
                        actions relevant to the upcoming
                        OCH allocation. A badge marks
                        participating Journey actions.
                      </p>

                    </div>

                  )}

                  {/* JOURNEY CARDS */}

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">

                    {visibleMilestones.map(
                      (
                        milestone,
                      ) => (

                        <JourneyCard
                          key={
                            milestone.key
                          }

                          milestone={
                            milestone
                          }

                          journey={
                            journey
                          }
                        />

                      ),
                    )}

                  </div>

                  <button
                    type="button"

                    disabled={
                      journeyLoading
                    }

                    onClick={() =>
                      void loadJourney()
                    }

                    className="mt-4 border border-[var(--hood-fg)] px-4 py-3 text-[7px] uppercase tracking-[0.14em] disabled:opacity-40"
                  >
                    {journeyLoading
                      ? "Refreshing Journey…"
                      : "Refresh Journey"}
                  </button>

                </section>

              </>

            ) : null}

            {/* EXPLORE */}

            <section className="mt-16">

              <div className="border-b border-[var(--hood-fg)] pb-4">

                <p className="text-[8px] uppercase tracking-[0.18em] opacity-50">
                  The Hood keeps growing
                </p>

                <h2 className="mt-2 text-4xl tracking-[-0.05em] md:text-5xl">
                  EXPLORE
                </h2>

                <p className="mt-3 max-w-xl text-[9px] leading-relaxed opacity-60">
                  Journey is also your way into the
                  ecosystem. New builder apps can be
                  added here as the Hood expands.
                </p>

              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

                {ECOSYSTEM_LINKS.map(
                  (
                    app,
                  ) => (

                    <Link
                      key={
                        app.key
                      }

                      href={
                        app.href
                      }

                      className="group flex min-h-[170px] flex-col justify-between border border-[var(--hood-fg)] p-5 transition-transform hover:-translate-y-1"
                    >

                      <div>

                        <div className="flex items-center justify-between gap-3">

                          <p className="text-[8px] uppercase tracking-[0.16em]">
                            {
                              app.title
                            }
                          </p>

                          {app.season2 && (
                            <span className="border border-[var(--hood-fg)] px-2 py-1 text-[6px] uppercase tracking-[0.12em]">
                              Season 2
                            </span>
                          )}

                        </div>

                        <p className="mt-5 max-w-sm text-[9px] leading-relaxed opacity-60">
                          {
                            app.description
                          }
                        </p>

                      </div>

                      <p className="mt-8 text-[7px] uppercase tracking-[0.13em] underline underline-offset-4">
                        {
                          app.label
                        } →
                      </p>

                    </Link>

                  ),
                )}

              </div>

            </section>

          </>

        )}

        {error && (

          <div className="mt-6 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-4 text-[var(--hood-bg)]">

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