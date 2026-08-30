"use client";

import Image from "next/image";
import Link from "next/link";

import {
  useMemo,
  useState,
} from "react";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type BuildType =
  | "internal"
  | "community";

type BuildStatus =
  | "live"
  | "building"
  | "coming";

type FilterType =
  | "all"
  | BuildType;

type HoodOSApp = {
  id: string;

  name: string;

  tagline: string;

  description: string;

  href: string;

  icon?: string;

  fallbackIcon: string;

  buildType: BuildType;

  status: BuildStatus;

  external?: boolean;
};

/*//////////////////////////////////////////////////////////////
                              APPS
//////////////////////////////////////////////////////////////*/

const apps: HoodOSApp[] = [
  {
  id:
    "hooney",

  name:
    "Hooney",

  tagline:
    "Swap with the Hive",

  description:
    "Community-built tokenized asset swaps where activated Hoodies can participate in the Hive fee-rebate system.",

  href:
    "https://hooney.xyz/",

  icon:
    "/hoodos/hooney.png",

  fallbackIcon:
    "H",

  buildType:
    "community",

  status:
    "live",

  external:
    true,
},

{
  id:
    "hoodiestudio",

  name:
    "HoodieStudio",

  tagline:
    "Create with your Hoodie",

  description:
    "Community-built creation platform for creating fully-chain artworks with your Hoodie. Currently available on testnet.",

  href:
    "https://testnet.hoodiestudio.xyz/",

  icon:
    "/hoodos/hoodiestudio.png",

  fallbackIcon:
    "HS",

  buildType:
    "community",

  status:
    "live",

  external:
    true,
},
  {
  id:
    "flooros",

  name:
    "FloorOS",

  tagline:
    "Buy the floor for the Hood",

  description:
    "Use your activated Hoodie to acquire eligible OnChainHoodies for the protocol Treasury and earn OCH directly into your HoodWallet.",

  href:
    "/hoodos/flooros",

  icon:
    "/hoodos/flooros.png",

  fallbackIcon:
    "F",

  buildType:
    "internal",

  status:
    "live",
},

  {
    id:
      "mintos",

    name:
      "MintOS",

    tagline:
      "Mint as your Hoodie",

    description:
      "Mint supported public OpenSea drops directly through your activated HoodWallet.",

    href:
      "/hoodos/mintos",

    icon:
      "/hoodos/mintos.png",

    fallbackIcon:
      "M",

    buildType:
      "internal",

    status:
      "live",
  },

  {
  id:
    "buyos",

  name:
    "BuyOS",

  tagline:
    "Collect as your Hoodie",

  description:
    "Browse Robinhood Chain OpenSea listings and buy NFTs directly through your activated HoodWallet.",

  href:
    "/hoodos/buyos",

  icon:
    "/hoodos/buyos.png",

  fallbackIcon:
    "B",

  buildType:
    "internal",

  status:
    "live",
},

  {
    id:
      "hoodwallet",

    name:
      "HoodWallet",

    tagline:
      "Your Hoodie wallet",

    description:
      "Activate your Hoodie, hold assets and execute transactions directly from its on-chain account.",

    href:
      "/hoodwallet",

    icon:
      "/hoodos/wallet.png",

    fallbackIcon:
      "W",

    buildType:
      "internal",

    status:
      "live",
  },

  {
    id:
      "och-games",

    name:
      "OCH.Games",

    tagline:
      "Play with the Hood",

    description:
      "Community-built games and experiments using Hoodies, HoodWallets and OCH.",

    href:
      "https://och.games",

    icon:
      "/hoodos/games.png",

    fallbackIcon:
      "G",

    buildType:
      "community",

    status:
      "live",

    external:
      true,
  },

  {
    id:
      "hoodieswap",

    name:
      "HoodieSwap",

    tagline:
      "Trade in the Hood",

    description:
      "A community-built trading experience connected to the OnChainHoodies ecosystem.",

    href:
      "https://hoodieswap.xyz/",

    icon:
      "/hoodos/swap.png",

    fallbackIcon:
      "S",

    buildType:
      "community",

    status:
      "live",
  },

  {
    id:
      "next",

    name:
      "Build Next",

    tagline:
      "Add to HoodOS",

    description:
      "Games, agents, collectibles, claims and new Hoodie-native applications can all build on HoodOS.",

    href:
      "/hoodos/docs",

    icon:
      "/hoodos/build.png",

    fallbackIcon:
      "+",

    buildType:
      "community",

    status:
      "building",
  },
];

/*//////////////////////////////////////////////////////////////
                             HELPERS
//////////////////////////////////////////////////////////////*/

function buildLabel(
  type: BuildType,
) {
  return type ===
    "internal"
    ? "Internal"
    : "Community";
}

function statusLabel(
  status: BuildStatus,
) {
  if (
    status ===
    "live"
  ) {
    return "Live";
  }

  if (
    status ===
    "building"
  ) {
    return "Building";
  }

  return "Coming";
}

/*//////////////////////////////////////////////////////////////
                              ICON
//////////////////////////////////////////////////////////////*/

function AppIcon({
  app,
}: {
  app:
    HoodOSApp;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(false);

  if (
    !app.icon ||
    failed
  ) {
    return (
      <div className="flex h-[74px] w-[74px] items-center justify-center overflow-hidden rounded-[18px] border border-black bg-black text-2xl text-[#ccff00] md:h-[82px] md:w-[82px] md:rounded-[20px]">
        {app.fallbackIcon}
      </div>
    );
  }

  return (
    <div className="relative h-[74px] w-[74px] overflow-hidden rounded-[18px] border border-black bg-black md:h-[82px] md:w-[82px] md:rounded-[20px]">

      <Image
        src={
          app.icon
        }

        alt={`${app.name} icon`}

        fill

        unoptimized

        sizes="82px"

        onError={() =>
          setFailed(
            true,
          )
        }

        className="image-render-pixel object-cover"
      />

    </div>
  );
}

/*//////////////////////////////////////////////////////////////
                           APP TILE
//////////////////////////////////////////////////////////////*/

function AppTile({
  app,
}: {
  app:
    HoodOSApp;
}) {
  const disabled =
    app.href === "#";

  const content = (
    <article
      className={`group h-full rounded-[24px] border border-black p-5 transition-all duration-200 md:p-6 ${
        disabled
          ? "opacity-60"
          : "hover:-translate-y-1 hover:bg-black hover:text-[#ccff00]"
      }`}
    >

      {/* ICON + META */}

      <div className="flex items-start justify-between gap-4">

        <AppIcon
          app={
            app
          }
        />

        <div className="flex flex-col items-end gap-1.5">

          <span className="rounded-full border border-current px-2 py-1 text-[6px] uppercase tracking-[0.15em]">
            {buildLabel(
              app.buildType,
            )}
          </span>

          <span className="text-[6px] uppercase tracking-[0.15em] opacity-45">
            {statusLabel(
              app.status,
            )}
          </span>

        </div>

      </div>

      {/* TITLE */}

      <h2 className="mt-6 text-2xl tracking-[-0.04em] md:text-3xl">
        {app.name}
      </h2>

      <p className="mt-1 text-[8px] uppercase tracking-[0.14em] opacity-55">
        {app.tagline}
      </p>

      {/* COPY */}

      <p className="mt-5 text-sm leading-relaxed opacity-65">
        {app.description}
      </p>

      {/* FOOTER */}

      <div className="mt-8 flex items-center justify-between border-t border-current pt-4">

  <div className="flex items-center gap-2">

    <span className="text-[7px] uppercase tracking-[0.16em] opacity-60">
      {disabled
        ? "Unavailable"
        : "Open"}
    </span>

    {app.external && !disabled && (
      <span className="text-[6px] uppercase tracking-[0.14em] opacity-40">
        External
      </span>
    )}

  </div>

  {!disabled && (
    <span className="text-base">
      →
    </span>
  )}

</div>

    </article>
  );

  if (
    disabled
  ) {
    return content;
  }

  if (
    app.external
  ) {
    return (
      <a
        href={
          app.href
        }

        target="_blank"

        rel="noreferrer"

        className="block h-full"
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={
        app.href
      }

      className="block h-full"
    >
      {content}
    </Link>
  );
}

/*//////////////////////////////////////////////////////////////
                              PAGE
//////////////////////////////////////////////////////////////*/

export default function HoodOSPage() {
  const [
    filter,
    setFilter,
  ] =
    useState<FilterType>(
      "all",
    );

  const visibleApps =
    useMemo(
      () => {
        if (
          filter ===
          "all"
        ) {
          return apps;
        }

        return apps.filter(
          (
            app,
          ) =>
            app.buildType ===
            filter,
        );
      },
      [
        filter,
      ],
    );

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">

      <SiteHeader />

      <section className="mx-auto max-w-[1360px] px-4 pb-24 pt-20 md:px-6 md:pt-24">

        {/*////////////////////////////////////////////////////////
                             TOP NAV
        ////////////////////////////////////////////////////////*/}

        <div className="flex items-center justify-between gap-6 border-b border-black pb-3">

          <p className="text-[9px] uppercase tracking-[0.16em]">
            OnChainHoodies / HoodOS
          </p>

          <div className="flex items-center gap-5">

            <Link
              href="/hoodos/docs"

              className="text-[8px] uppercase tracking-[0.12em] underline underline-offset-4"
            >
              Builder Docs
            </Link>

            <Link
              href="/"

              className="text-[8px] uppercase tracking-[0.12em]"
            >
              Back
            </Link>

          </div>

        </div>

        {/*////////////////////////////////////////////////////////
                               HERO
        ////////////////////////////////////////////////////////*/}

        <section className="border-b border-black py-12 md:py-16">

          <p className="text-[9px] uppercase tracking-[0.2em] opacity-50">
            Programmable Hoodies
          </p>

          <div className="mt-6 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">

            <div>

              <h1 className="text-[clamp(5rem,12vw,10rem)] leading-[0.74] tracking-[-0.09em]">
                HOOD
                <br />
                OS
              </h1>

            </div>

            <div className="pb-1">

              <h2 className="text-4xl leading-[0.9] tracking-[-0.055em] md:text-6xl">
                RUN
                <br />
                THE HOOD.
              </h2>

              <p className="mt-7 max-w-xl text-base leading-relaxed opacity-70 md:text-lg">
                HoodOS turns every Hoodie into an on-chain account that can own,
                interact, play, mint and connect with applications built across
                the Hood.
              </p>

            </div>

          </div>

        </section>

        {/*////////////////////////////////////////////////////////
                         APPS HEADER + FILTER
        ////////////////////////////////////////////////////////*/}

        <section className="pt-9">

          <div className="flex flex-col gap-5 border-b border-black pb-4 sm:flex-row sm:items-end sm:justify-between">

            <div>

              <p className="text-[8px] uppercase tracking-[0.17em] opacity-45">
                HoodOS Apps
              </p>

              <h2 className="mt-2 text-2xl tracking-[-0.035em]">
                Pick an app.
              </h2>

            </div>

            {/* FILTER */}

            <div className="flex items-center gap-1">

              {(
                [
                  [
                    "all",
                    "All",
                  ],

                  [
                    "internal",
                    "Internal",
                  ],

                  [
                    "community",
                    "Community",
                  ],
                ] as const
              ).map(
                (
                  [
                    value,
                    label,
                  ],
                ) => (

                  <button
                    key={
                      value
                    }

                    type="button"

                    onClick={() =>
                      setFilter(
                        value,
                      )
                    }

                    className={`border border-black px-3 py-2 text-[7px] uppercase tracking-[0.13em] transition-colors ${
                      filter ===
                      value
                        ? "bg-black text-[#ccff00]"
                        : "hover:bg-black hover:text-[#ccff00]"
                    }`}
                  >
                    {
                      label
                    }
                  </button>

                ),
              )}

            </div>

          </div>

          {/*//////////////////////////////////////////////////////
                             APP CARDS
          //////////////////////////////////////////////////////*/}

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

            {visibleApps.map(
              (
                app,
              ) => (

                <AppTile
                  key={
                    app.id
                  }

                  app={
                    app
                  }
                />

              ),
            )}

          </div>

        </section>

        {/*////////////////////////////////////////////////////////
                         BUILDER SECTION
        ////////////////////////////////////////////////////////*/}



        <section className="mt-16 border-t border-black pt-8">

          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">

            <div>

              <p className="text-[8px] uppercase tracking-[0.17em] opacity-45">
                Open infrastructure
              </p>

              <h2 className="mt-4 text-4xl leading-[0.9] tracking-[-0.05em] md:text-5xl">
                ADD AN APP
                <br />
                TO THE HOOD.
              </h2>

              <p className="mt-5 max-w-xl text-sm leading-relaxed opacity-65 md:text-base">
                Build games, agents, tools and new Hoodie-native experiences on
                top of HoodOS and HoodWallet.
              </p>

            </div>

            <Link
              href="/hoodos/docs"

              className="inline-flex min-h-12 items-center justify-center rounded-full border border-black px-5 text-[8px] uppercase tracking-[0.15em] transition-colors hover:bg-black hover:text-[#ccff00]"
            >
              Builder Docs →
            </Link>

          </div>

        </section>

      </section>

      <SiteFooter />

    </main>
  );
}