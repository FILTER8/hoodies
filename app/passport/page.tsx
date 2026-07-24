import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export default function PassportPage() {
  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto flex min-h-screen max-w-[1440px] flex-col items-center justify-center px-6 pb-20 pt-28 text-center">
        <p className="text-[10px] uppercase tracking-[0.22em]">
          The Hood Economy
        </p>

        <h1 className="mt-8 text-[clamp(4rem,11vw,10rem)] leading-[0.82] tracking-[-0.08em]">
          CITIZEN
          <br />
          PASSPORT
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-relaxed md:text-2xl">
          A future home for contribution stamps, Community Fund rewards,
          citizen progress and OCH claims.
        </p>

        <div className="mt-10 border-2 border-black px-6 py-4 text-xs uppercase tracking-[0.2em]">
          TBA
        </div>

        <div className="mt-12 max-w-xl border-2 border-black p-6 md:p-8">
          <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
            Live now
          </p>

          <h2 className="mt-5 text-3xl leading-none tracking-[-0.04em] md:text-5xl">
            GIVE YOUR
            <br />
            HOODIE A VOICE.
          </h2>

          <p className="mt-6 text-base leading-relaxed opacity-75">
            Write a Hood Talk and store your Hoodie&apos;s voice on-chain.
          </p>

          <Link href="/hood-talk" className="pixel-cta pixel-cta-dark mt-8">
            Open Hood Talk
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}