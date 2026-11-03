import Image from "next/image";
import Link from "next/link";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

import buildersData from "../../lib/builders.json";

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type Builder = {
  id: string;

  title: string;

  creator: string;

  xHandle: string;

  xUrl: string;

  websiteUrl: string;

  featurePostUrl?: string;

  image: string;

  description: string;

  tags: string[];

  status: string;
};

const builders =
  buildersData as Builder[];

/*//////////////////////////////////////////////////////////////
                            HELPERS
//////////////////////////////////////////////////////////////*/

function ExternalArrow() {
  return (
    <span aria-hidden="true">
      ↗
    </span>
  );
}

/*//////////////////////////////////////////////////////////////
                         BUILDER CARD
//////////////////////////////////////////////////////////////*/

function BuilderCard({
  builder,
}: {
  builder:
    Builder;
}) {
  const builderNumber =
    builder.id.padStart(
      3,
      "0",
    );

  const hasFeaturePost =
    Boolean(
      builder.featurePostUrl?.trim(),
    );

  return (
    <article className="flex h-full flex-col border-2 border-[#ccff00] bg-[#ccff00] text-black">

      {/* CARD HEADER */}

      <div className="flex items-center justify-between border-b-2 border-black px-4 py-4 md:px-5">

        <p className="text-[9px] uppercase tracking-[0.16em]">
          Build #{builderNumber}
        </p>

        <p className="border border-black px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
          {builder.status}
        </p>

      </div>

      {/* IMAGE */}

      <a
        href={
          builder.websiteUrl
        }

        target="_blank"

        rel="noreferrer"

        aria-label={`Open ${builder.title}`}

        className="relative block aspect-square overflow-hidden border-b-2 border-black bg-black"
      >
        <Image
          src={
            builder.image
          }

          alt={`${builder.title} by ${builder.creator}`}

          fill

          priority={
            builder.id ===
            "001"
          }

          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"

          className="image-render-pixel object-cover"
        />
      </a>

      {/* CONTENT */}

      <div className="flex flex-1 flex-col p-5 md:p-6">

        <div>

          <p className="text-[8px] uppercase tracking-[0.15em] opacity-55">
            Community build
          </p>

          <h2 className="mt-3 text-3xl leading-[0.95] tracking-[-0.045em] md:text-4xl">
            {builder.title}
          </h2>

          {/* CREATOR */}

          <div className="mt-5 border-t border-black pt-4">

            <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">
              Built by
            </p>

            <a
              href={
                builder.xUrl
              }

              target="_blank"

              rel="noreferrer"

              className="mt-2 inline-flex items-center gap-2 text-sm !text-black underline underline-offset-4"
            >
              {builder.xHandle}

              <ExternalArrow />
            </a>

          </div>

          {/* DESCRIPTION */}

          <p className="mt-5 text-sm leading-relaxed opacity-80">
            {builder.description}
          </p>

          {/* TAGS */}

          {builder.tags.length >
          0 ? (

            <div className="mt-6 flex flex-wrap gap-2">

              {builder.tags.map(
                (
                  tag,
                ) => (

                  <span
                    key={
                      tag
                    }

                    className="border border-black px-2 py-2 text-[7px] uppercase tracking-[0.12em]"
                  >
                    {tag}
                  </span>

                ),
              )}

            </div>

          ) : null}

        </div>

        {/* ACTIONS */}

        <div className="mt-auto pt-7">

          <div
            className={`grid border-l-2 border-t-2 border-black ${
              hasFeaturePost
                ? "grid-cols-2"
                : "grid-cols-1"
            }`}
          >

            <a
              href={
                builder.websiteUrl
              }

              target="_blank"

              rel="noreferrer"

              className="flex min-h-12 items-center justify-center border-b-2 border-r-2 border-black bg-black px-3 text-center text-[8px] uppercase tracking-[0.13em] !text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:!text-black"
            >
              Open build&nbsp;

              <ExternalArrow />
            </a>

            {hasFeaturePost ? (

              <a
                href={
                  builder.featurePostUrl
                }

                target="_blank"

                rel="noreferrer"

                className="flex min-h-12 items-center justify-center border-b-2 border-r-2 border-black bg-[#ccff00] px-3 text-center text-[8px] uppercase tracking-[0.13em] !text-black transition-colors hover:bg-black hover:!text-[#ccff00]"
              >
                Feature post&nbsp;

                <ExternalArrow />
              </a>

            ) : null}

          </div>

        </div>

      </div>

    </article>
  );
}

/*//////////////////////////////////////////////////////////////
                      ONCHAINHOODIES BUILDS
//////////////////////////////////////////////////////////////*/

type OfficialTool = {
  name: string;
  description: string;
  href: string;
  image: string;
  category: "Tool";
  external?: boolean;
};

// All image paths are optional: cards render a text fallback until assets are added.
// Keep community projects in lib/builders.json; this is our own project directory.
const officialTools: OfficialTool[] = [
  { name: "Hoodie Explorer", category: "Tool", href: "/tools/explorer", image: "/builders/explorer.png", description: "Explore the collection and discover individual on-chain Hoodies." },
  { name: "Hoodie Export", category: "Tool", href: "/tools/export", image: "/builders/export.png", description: "Export Hoodie artwork for use outside the collection viewer." },
  { name: "Hoodie Collage", category: "Tool", href: "/tools/collage", image: "/builders/collage.png", description: "Create collage compositions with Hoodie artwork." },
  { name: "Hoodie Gym", category: "Tool", href: "/tools/gym", image: "/builders/gym.png", description: "An interactive Hoodie experiment in the tools collection." },
  { name: "SayIt", category: "Tool", href: "/tools/sayit", image: "/builders/sayit.png", description: "A playful Hoodie voice and expression tool." },
];

function OfficialToolCard({ tool }: { tool: OfficialTool }) {
  const content = (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden border-2 border-[#ccff00] bg-black text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black">
      <div className="relative aspect-square w-full flex-none shrink-0 overflow-hidden border-b-2 border-current bg-[#151515]">
        <ToolArtwork tool={tool} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">{tool.category}</p>
        <h3 className="mt-2 text-2xl tracking-[-0.04em]">{tool.name}</h3>
        <p className="mt-3 flex-1 text-sm leading-relaxed opacity-75">{tool.description}</p>
        <div className="mt-6 flex items-center justify-between border-t border-current pt-3 text-[9px] uppercase tracking-[0.12em]">
          <span>Explore build</span><ExternalArrow />
        </div>
      </div>
    </article>
  );
  return tool.external ? (
    <a href={tool.href} target="_blank" rel="noopener noreferrer" className="block h-full" aria-label={`Open ${tool.name}`}>
      {content}
    </a>
  ) : (
    <Link href={tool.href} className="block h-full" aria-label={`Open ${tool.name}`}>
      {content}
    </Link>
  );
}

// A missing picture is intentional during rollout: replace the text with artwork
// simply by adding the matching square image to public/builders/.
function ToolArtwork({ tool }: { tool: OfficialTool }) {
  // Use CSS background images rather than Next/Image here: a missing optional
  // asset never causes a broken-image icon or requires an onError handler.
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black text-[#ccff00]">
      <span className="px-4 text-center text-3xl uppercase tracking-[-0.05em] sm:text-4xl">{tool.name}</span>
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${tool.image}")` }} aria-hidden="true" />
    </div>
  );
}

/*//////////////////////////////////////////////////////////////
                              PAGE
//////////////////////////////////////////////////////////////*/

export default function BuildersPage() {
  const builderCount =
    builders.length;

  return (
    <main className="min-h-screen bg-black text-[#ccff00]">

      <SiteHeader />

      <section className="px-6 pb-24 pt-28 md:pt-32">

        <div className="mx-auto max-w-[1440px]">

          {/*//////////////////////////////////////////////////////
                            SECTION BAR
          //////////////////////////////////////////////////////*/}

          <div className="section-heading-row border-[#ccff00]">

            <p>
              Ecosystem / Community
            </p>

            <p>
              {String(
                builderCount,
              ).padStart(
                3,
                "0",
              )}{" "}

              {builderCount ===
              1
                ? "Build"
                : "Builds"}
            </p>

          </div>

          {/*//////////////////////////////////////////////////////
                               HERO
          //////////////////////////////////////////////////////*/}

          <div className="mt-10">

            <p className="text-[9px] uppercase tracking-[0.18em] opacity-55">
              Permissionless ecosystem
            </p>

            <h1 className="mt-4 text-[clamp(3.5rem,8vw,8rem)] leading-[0.86] tracking-[-0.07em]">
              BUILT IN
              <br />
              THE HOOD.
            </h1>

            <div className="mt-7 grid gap-8 border-b-2 border-[#ccff00] pb-10 lg:grid-cols-[1fr_0.9fr] lg:items-end">

              <div>

                <p className="max-w-2xl text-base leading-relaxed opacity-80 md:text-xl">
                  Tools and on-chain experiences built by OnChainHoodies and the wider community.
                </p>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed opacity-55">
                  Use the public API, on-chain data, HoodWallet infrastructure or anything else the Hood makes available. Build your own thing and take it somewhere we did not expect.
                </p>

              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">

                <a
                  href="/api"

                  className="inline-flex min-h-[52px] items-center justify-center border-2 border-[#ccff00] bg-[#ccff00] px-6 py-3 text-[10px] uppercase tracking-[0.16em] !text-black transition-colors hover:bg-black hover:!text-[#ccff00]"
                >
                  Explore API&nbsp;

                  <ExternalArrow />
                </a>

                <Link
                  href="/hoodos"

                  className="inline-flex min-h-[52px] items-center justify-center border-2 border-[#ccff00] px-6 py-3 text-[10px] uppercase tracking-[0.16em] !text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:!text-black"
                >
                  Explore HoodOS
                </Link>

              </div>

            </div>

          </div>

          {/* OnChainHoodies-built tools (separate from the community directory) */}
          <section className="mt-14" aria-labelledby="official-builds-heading">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#ccff00] pb-4">
              <div>
                <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">Made by OnChainHoodies</p>
                <h2 id="official-builds-heading" className="mt-2 text-3xl tracking-[-0.045em] md:text-4xl">OUR TOOLS</h2>
              </div>
              <p className="text-[8px] uppercase opacity-55">{String(officialTools.length).padStart(3, "0")} tools</p>
            </div>
            <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
              {officialTools.map((tool) => <OfficialToolCard key={tool.href} tool={tool} />)}
            </div>
          </section>

          {/*//////////////////////////////////////////////////////
                          COMMUNITY BUILDS
          //////////////////////////////////////////////////////*/}

          <div className="mt-14 flex items-end justify-between border-b-2 border-[#ccff00] pb-4">

            <div>

              <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">
                Community ecosystem
              </p>

              <h2 className="mt-2 text-3xl tracking-[-0.045em] md:text-4xl">
                BUILDS FROM THE HOOD
              </h2>

            </div>

            <p className="text-[8px] uppercase opacity-55">
              {String(
                builderCount,
              ).padStart(
                3,
                "0",
              )}{" "}
              live
            </p>

          </div>

          {builders.length >
          0 ? (

            <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">

              {builders.map(
                (
                  builder,
                ) => (

                  <BuilderCard
                    key={
                      builder.id
                    }

                    builder={
                      builder
                    }
                  />

                ),
              )}

            </div>

          ) : (

            <div className="mt-6 border-2 border-[#ccff00] p-8">

              <p className="text-lg">
                No community builds listed yet.
              </p>

            </div>

          )}

           {/*//////////////////////////////////////////////////////
                        BUILDERS VS HOODOS
          //////////////////////////////////////////////////////*/}

          <section className="mt-6 grid border-2 border-[#ccff00] lg:grid-cols-2">

            {/* BUILDERS */}

            <div className="border-b-2 border-[#ccff00] p-6 lg:border-b-0 lg:border-r-2 md:p-8">

              <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">
                Builders / Ecosystem
              </p>

              <h2 className="mt-4 text-4xl leading-[0.9] tracking-[-0.05em] md:text-5xl">
                BUILD
                <br />
                AROUND THE HOOD.
              </h2>

              <p className="mt-5 max-w-lg text-sm leading-relaxed opacity-70">
                Visualizers, games, social tools, analytics, experiments and anything else that uses OnChainHoodies or its public infrastructure.
              </p>

              <a
                href="/api"

                className="mt-6 inline-flex items-center gap-2 text-[9px] uppercase underline underline-offset-4"
              >
                Start with the API

                <ExternalArrow />
              </a>

            </div>

            {/* HOODOS */}

            <div className="bg-[#ccff00] p-6 text-black md:p-8">

              <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">
                HoodOS / Capability layer
              </p>

              <h2 className="mt-4 text-4xl leading-[0.9] tracking-[-0.05em] md:text-5xl">
                GIVE HOODIES
                <br />
                SOMETHING TO DO.
              </h2>

              <p className="mt-5 max-w-lg text-sm leading-relaxed opacity-70">
                HoodOS apps let the Hoodie itself act through its HoodWallet — minting, collecting, playing, interacting and using on-chain services as its own account.
              </p>

              <Link
                href="/hoodos"

                className="mt-6 inline-flex items-center gap-2 text-[9px] uppercase !text-black underline underline-offset-4"
              >
                Enter HoodOS
              </Link>

            </div>

          </section>


         

        </div>

      </section>

      <SiteFooter />

    </main>
  );
}