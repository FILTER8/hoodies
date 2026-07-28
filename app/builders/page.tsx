import Image from "next/image";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import buildersData from "../../lib/builders.json";

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

const builders = buildersData as Builder[];

function ExternalArrow() {
  return <span aria-hidden="true">↗</span>;
}

function BuilderCard({ builder }: { builder: Builder }) {
  const builderNumber = builder.id.padStart(3, "0");
  const hasFeaturePost = Boolean(builder.featurePostUrl?.trim());

  return (
    <article className="flex h-full flex-col border-2 border-[#ccff00] bg-[#ccff00] text-black">
      <div className="flex items-center justify-between border-b-2 border-black px-4 py-4 md:px-5">
        <p className="text-[9px] uppercase tracking-[0.16em]">
          Builder #{builderNumber}
        </p>

        <p className="border border-black px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
          {builder.status}
        </p>
      </div>

      <a
        href={builder.websiteUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${builder.title}`}
        className="relative block aspect-square overflow-hidden border-b-2 border-black bg-black"
      >
        <Image
          src={builder.image}
          alt={`${builder.title} by ${builder.creator}`}
          fill
          priority={builder.id === "001"}
          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
          className="image-render-pixel object-cover"
        />
      </a>

      <div className="flex flex-1 flex-col p-5 md:p-6">
        <div>
          <p className="text-[8px] uppercase tracking-[0.15em] opacity-55">
            Project
          </p>

          <h2 className="mt-3 text-3xl leading-[0.95] tracking-[-0.045em] md:text-4xl">
            {builder.title}
          </h2>

          <div className="mt-5 border-t border-black pt-4">
            <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">
              Created by
            </p>

            <a
              href={builder.xUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm !text-black underline underline-offset-4"
            >
              {builder.xHandle}
              <ExternalArrow />
            </a>
          </div>

          <p className="mt-5 text-sm leading-relaxed opacity-80">
            {builder.description}
          </p>

          {builder.tags.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {builder.tags.map((tag) => (
                <span
                  key={tag}
                  className="border border-black px-2 py-2 text-[7px] uppercase tracking-[0.12em]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-auto pt-7">
          <div
            className={`grid border-l-2 border-t-2 border-black ${
              hasFeaturePost ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            <a
              href={builder.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center justify-center border-b-2 border-r-2 border-black bg-black px-3 text-center text-[8px] uppercase tracking-[0.13em] !text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:!text-black"
            >
              Open build&nbsp;
              <ExternalArrow />
            </a>

            {hasFeaturePost ? (
              <a
                href={builder.featurePostUrl}
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

export default function BuildersPage() {
  const builderCount = builders.length;

  return (
    <main className="min-h-screen bg-black text-[#ccff00]">
      <SiteHeader />

      <section className="px-6 pb-24 pt-28 md:pt-32">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-[#ccff00]">
            <p>Builders / Ecosystem</p>

            <p>
              {String(builderCount).padStart(3, "0")}{" "}
              {builderCount === 1 ? "Builder" : "Builders"}
            </p>
          </div>

          <div className="mt-10">
            <h1 className="text-[clamp(3.5rem,8vw,8rem)] leading-[0.86] tracking-[-0.07em]">
              BUILDERS OF
              <br />
              THE HOOD.
            </h1>

            <div className="mt-7 flex flex-col items-start gap-5 border-b-2 border-[#ccff00] pb-10 md:flex-row md:items-center md:justify-between">
              <p className="text-base leading-relaxed opacity-75 md:text-xl">
                Build and get rewarded.
              </p>

              <a
                href="/api"
                className="inline-flex min-h-[52px] items-center justify-center border-2 border-[#ccff00] bg-[#ccff00] px-6 py-3 text-[10px] uppercase tracking-[0.16em] !text-black transition-colors hover:bg-black hover:!text-[#ccff00]"
              >
                Explore the API&nbsp;
                <ExternalArrow />
              </a>
            </div>
          </div>

          {builders.length > 0 ? (
            <div className="mt-10 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
              {builders.map((builder) => (
                <BuilderCard key={builder.id} builder={builder} />
              ))}
            </div>
          ) : (
            <div className="mt-10 border-2 border-[#ccff00] p-8">
              <p className="text-lg">No builders listed yet.</p>
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}