import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export default function CommunityPage() {
  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto flex min-h-[calc(100vh-120px)] max-w-[1440px] flex-col justify-center px-6 pb-20 pt-32 md:pt-40">
        <div className="border-b-2 border-black pb-5 text-[9px] uppercase tracking-[0.18em] md:flex md:items-center md:justify-between">
          <p>Citizen Passport / Season 01</p>
          <p className="mt-2 md:mt-0">Community Fund</p>
        </div>

        <div className="grid gap-12 py-14 lg:grid-cols-[1fr_0.72fr] lg:items-end md:py-20">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em]">
              03 / X Posts
            </p>

            <h1 className="mt-7 text-[clamp(4.5rem,12vw,11rem)] leading-[0.75] tracking-[-0.09em]">
              COMING
              <br />
              SOON.
            </h1>
          </div>

          <div className="border-l-2 border-black pl-6 md:pl-9">
            <p className="text-2xl leading-tight tracking-[-0.04em] md:text-4xl">
              Share the Hood.
              <br />
              Grow the neighborhood.
            </p>

            <p className="mt-7 max-w-xl text-base leading-relaxed opacity-75 md:text-lg">
              Season 01 will let Hoodie holders verify their wallet with X,
              submit a tweet URL and have its engagement tracked for 24 hours.
            </p>
          </div>
        </div>

        <div className="grid border-l-2 border-t-2 border-black md:grid-cols-3">
          {[
            ["01", "Verify", "Connect your Hoodie wallet with your X account."],
            ["02", "Submit", "Add one eligible X post through the Community page."],
            ["03", "Track", "Likes, reposts and replies are measured for 24 hours."],
          ].map(([number, title, description]) => (
            <article
              key={number}
              className="flex min-h-[230px] flex-col justify-between border-b-2 border-r-2 border-black p-6 md:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-55">
                  {number}
                </p>
                <span className="border border-black px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                  TBA
                </span>
              </div>

              <div className="mt-12">
                <h2 className="text-3xl leading-none tracking-[-0.04em] md:text-4xl">
                  {title}
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-relaxed opacity-70">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t-2 border-black pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed opacity-70">
            Final scoring, reward amounts and launch timing will be announced
            before submissions open.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link href="/passport" className="pixel-cta">
              Back to Passport
            </Link>
            <Link href="/och" className="pixel-cta pixel-cta-dark">
              View $OCH
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}