"use client";

import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

export default function PassportPage() {
  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      {/* =====================================================
          PASSPORT RESET / SEASON 02
      ===================================================== */}

      <section className="mx-auto flex min-h-[calc(100vh-80px)] max-w-[1440px] flex-col justify-center px-6 pb-20 pt-32 md:pb-28 md:pt-40">
        <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em]">
              The Hood Economy
            </p>

            <h1 className="mt-7 text-[clamp(4rem,10vw,9rem)] leading-[0.78] tracking-[-0.08em]">
              HOODIE
              <br />
              PASSPORT
            </h1>
          </div>

          <div className="max-w-2xl border-l-2 border-black pl-6 md:pl-9 lg:pb-2">
            <p className="text-[clamp(3.2rem,7vw,7rem)] leading-[0.78] tracking-[-0.08em]">
              SEASON
              <br />
              02
            </p>

            <p className="mt-5 text-sm uppercase tracking-[0.22em] md:text-base">
              Coming Soon
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-8 border-t-2 border-black pt-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="max-w-3xl text-lg leading-relaxed md:text-2xl">
              The Passport is being reset for the next chapter of the Hood.
              Season 02 will introduce a new set of participation mechanics,
              progression and rewards.
            </p>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed opacity-65 md:text-base">
              Season 01 is closed and archived. New Passport activity will begin
              when Season 02 goes live.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.15em] lg:max-w-[420px] lg:justify-end">
            <span className="border border-black px-3 py-2">
              Season 01 Closed
            </span>

            <span className="border border-black bg-black px-3 py-2 text-[#ccff00]">
              Season 02 Coming
            </span>
          </div>
        </div>
      </section>

      {/* =====================================================
          NEXT SEASON
      ===================================================== */}

      <section className="border-y-2 border-black bg-black px-6 py-20 text-[#ccff00] md:py-28">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>01 / Next Chapter</p>
            <p>Hoodie Passport</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">
                Passport Status
              </p>

              <h2 className="mt-4 text-[clamp(4rem,9vw,8rem)] leading-[0.78] tracking-[-0.08em]">
                RESET
                <br />
                MODE
              </h2>
            </div>

            <div className="border-l-2 border-[#ccff00] pl-6 md:pl-10">
              <p className="max-w-3xl text-xl leading-relaxed md:text-3xl">
                A new season should feel like a new season.
              </p>

              <p className="mt-6 max-w-3xl text-base leading-relaxed opacity-70 md:text-xl">
                Previous Season 01 activity is no longer shown on the live
                Passport page. Season 02 starts with a clean interface and new
                mechanics built around the evolving OnChainHoodies ecosystem.
              </p>

              <div className="mt-8 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.15em]">
                <span className="border border-[#ccff00] px-3 py-2">
                  New Mechanics
                </span>

                <span className="border border-[#ccff00] px-3 py-2">
                  New Progression
                </span>

                <span className="border border-[#ccff00] px-3 py-2">
                  New Rewards
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}