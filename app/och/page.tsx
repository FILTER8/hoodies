import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

const allocations = [
  {
    label: "Citizens",
    percent: 30,
    amount: "30,000,000 OCH",
    dash: "30 70",
    offset: 0,
    opacity: 1,
  },
  {
    label: "Community Fund",
    percent: 35,
    amount: "35,000,000 OCH",
    dash: "35 65",
    offset: -30,
    opacity: 0.82,
  },
  {
    label: "Liquidity",
    percent: 15,
    amount: "15,000,000 OCH",
    dash: "15 85",
    offset: -65,
    opacity: 0.64,
  },
  {
    label: "Treasury",
    percent: 10,
    amount: "10,000,000 OCH",
    dash: "10 90",
    offset: -80,
    opacity: 0.48,
  },
  {
    label: "Robinhood Ecosystem",
    percent: 5,
    amount: "5,000,000 OCH",
    dash: "5 95",
    offset: -90,
    opacity: 0.34,
  },
  {
    label: "Team",
    percent: 5,
    amount: "5,000,000 OCH",
    dash: "5 95",
    offset: -95,
    opacity: 0.22,
  },
];

const citizenRounds = [
  {
    number: "01",
    timing: "Launch",
    amount: "10%",
    description: "Planned citizen distribution.",
  },
  {
    number: "02",
    timing: "+2 Months",
    amount: "10%",
    description: "Planned Citizen Passport claim.",
  },
  {
    number: "03",
    timing: "+4 Months",
    amount: "10%",
    description: "Planned final citizen claim.",
  },
];

const contributionTypes = [
  "Create",
  "Contribute",
  "Share",
  "Organize",
  "Support",
];

const tokenDetails = [
  {
    label: "Total Supply",
    value: "100,000,000",
  },
  {
    label: "Inflation",
    value: "None",
  },
  {
    label: "Buy Tax",
    value: "0%",
  },
  {
    label: "Sell Tax",
    value: "0%",
  },
  {
    label: "Transfer Tax",
    value: "0%",
  },
];


export default function OCHPage() {
  return (
    <main className="bg-[#ccff00] text-black">
      <SiteHeader />

      {/* Warning */}

<div className="border-b border-black bg-black px-6 pt-20 text-[#ccff00]">
  <div className="mx-auto flex max-w-[1440px] items-center justify-center py-2.5 text-center">
    <p className="text-[8px] uppercase leading-relaxed tracking-[0.16em] md:text-[9px]">
      No OCH contract has been deployed. Beware of fake tokens and links.
    </p>
  </div>
</div>

{/* Hero */}

<section className="mx-auto flex min-h-[calc(100vh-110px)] max-w-[1440px] flex-col items-center justify-center px-6 pb-16 pt-12 text-center">
  <img
    src="/coin1.gif"
    alt="Animated OCH coin"
    className="image-render-pixel mb-8 h-40 w-40 object-contain md:h-56 md:w-56"
  />

  <p className="mb-5 text-[10px] uppercase tracking-[0.24em] md:text-xs">
    The Hood Economy
  </p>

  <h1 className="text-[clamp(5rem,14vw,11rem)] leading-[0.74] tracking-[-0.09em]">
    $OCH
  </h1>

  <h2 className="mt-10 text-[clamp(2.2rem,5vw,4.8rem)] leading-[0.9] tracking-[-0.06em]">
    THE CURRENCY
    <br />
    OF THE HOOD.
  </h2>

  <p className="mt-8 max-w-2xl text-base leading-relaxed md:text-xl">
    A fixed-supply ERC-20 planned for citizens, contributors and the wider
    Hood.
  </p>

  <div className="mt-12 grid w-full max-w-5xl grid-cols-2 border-2 border-black text-[9px] uppercase tracking-[0.15em] md:grid-cols-4">
    {[
      "100M Planned Supply",
      "No Inflation",
      "No Trading Tax",
      "Contract TBA",
    ].map((item, index) => (
      <div
        key={item}
        className={[
          "border-black p-3",
          index % 2 === 1 ? "border-l-2" : "",
          index > 1 ? "border-t-2 md:border-t-0" : "",
          index > 0 ? "md:border-l-2" : "",
        ].join(" ")}
      >
        {item}
      </div>
    ))}
  </div>
</section>

      {/* Distribution */}

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>01 / Distribution</p>
            <p>Proposed Allocation</p>
          </div>

          <div className="mt-12 grid gap-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <h2 className="section-title">
                Built for the
                <br />
                whole Hood.
              </h2>

              <div className="mx-auto mt-12 aspect-square w-full max-w-[500px] lg:mx-0">
                <svg
                  viewBox="0 0 240 240"
                  role="img"
                  aria-label="Proposed OCH token distribution chart"
                  className="h-full w-full"
                >
                  <circle
                    cx="120"
                    cy="120"
                    r="86"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="30"
                    opacity="0.12"
                  />

                  <g transform="rotate(-90 120 120)">
                    {allocations.map((allocation) => (
                      <circle
                        key={allocation.label}
                        cx="120"
                        cy="120"
                        r="86"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="30"
                        pathLength="100"
                        strokeDasharray={allocation.dash}
                        strokeDashoffset={allocation.offset}
                        strokeLinecap="butt"
                        opacity={allocation.opacity}
                      />
                    ))}
                  </g>

                  <circle
                    cx="120"
                    cy="120"
                    r="58"
                    fill="black"
                    stroke="currentColor"
                    strokeWidth="1"
                  />

                  <text
                    x="120"
                    y="109"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="10"
                    letterSpacing="2"
                  >
                    PROPOSED
                  </text>

                  <text
                    x="120"
                    y="137"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="24"
                  >
                    100M
                  </text>
                </svg>
              </div>
            </div>

            <div className="border-l-2 border-t-2 border-[#ccff00]">
              {allocations.map((allocation) => (
                <div
                  key={allocation.label}
                  className="grid grid-cols-[44px_1fr_auto] items-center gap-4 border-b-2 border-r-2 border-[#ccff00] p-4 md:grid-cols-[60px_1fr_auto] md:p-6"
                >
                  <span
                    className="block h-4 w-4 border border-[#ccff00] bg-[#ccff00]"
                    style={{ opacity: allocation.opacity }}
                    aria-hidden="true"
                  />

                  <div>
                    <p className="text-lg leading-none md:text-2xl">
                      {allocation.label}
                    </p>

                    <p className="mt-2 text-[9px] uppercase tracking-[0.14em] opacity-60">
                      {allocation.amount}
                    </p>
                  </div>

                  <p className="text-3xl leading-none md:text-5xl">
                    {allocation.percent}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Citizen Rewards */}

      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>02 / Citizen Rewards</p>
            <p>30% Proposed Allocation</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="section-title">
                Every Hoodie.
                <br />
                Equal citizens.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                Every Hoodie is planned to receive the same citizen allocation.
                Traits define identity, not value.
              </p>
            </div>

            <div className="border-l-2 border-t-2 border-black md:grid md:grid-cols-3">
              {citizenRounds.map((round) => (
                <article
                  key={round.number}
                  className="flex min-h-[360px] flex-col justify-between border-b-2 border-r-2 border-black p-6 md:p-8"
                >
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                        Round {round.number}
                      </span>

                      <span className="border border-black px-2 py-1 text-[9px] uppercase tracking-[0.14em]">
                        TBA
                      </span>
                    </div>

                    <p className="mt-12 text-sm uppercase tracking-[0.18em] opacity-60">
                      {round.timing}
                    </p>

                    <p className="mt-3 text-6xl leading-none tracking-[-0.06em] md:text-7xl">
                      {round.amount}
                    </p>
                  </div>

                  <p className="mt-10 max-w-xs text-sm leading-relaxed opacity-70">
                    {round.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contribution Fund */}

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>03 / Community Fund</p>
            <p>35% Proposed Allocation</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:items-end">
            <div>
              <h2 className="section-title">
                Every two months
                <br />
                a new season begins.
              </h2>

              <p className="mt-8 max-w-xl text-lg leading-relaxed opacity-75 md:text-xl">
                OCH is planned to reward the people who create, contribute and
                help the neighborhood grow.
              </p>
            </div>

            <div className="grid grid-cols-2 border-l-2 border-t-2 border-[#ccff00]">
              {contributionTypes.map((item, index) => (
                <div
                  key={item}
                  className={[
                    "flex min-h-[120px] items-end justify-between border-b-2 border-r-2 border-[#ccff00] p-5 md:min-h-[150px] md:p-7",
                    index === contributionTypes.length - 1
                      ? "col-span-2"
                      : "",
                  ].join(" ")}
                >
                  <span className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <p className="text-xl leading-none md:text-3xl">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Token Details */}

      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>04 / Token</p>
            <p>Proposed Design</p>
          </div>

          <div className="mt-12">
            <h2 className="section-title">
              No hidden tax.
              <br />
              No future inflation.
            </h2>

            <div className="mt-12 grid border-l-2 border-t-2 border-black sm:grid-cols-2 lg:grid-cols-5">
              {tokenDetails.map((detail) => (
                <article
                  key={detail.label}
                  className="flex min-h-[190px] flex-col justify-between border-b-2 border-r-2 border-black p-5 md:min-h-[230px] md:p-7"
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                    {detail.label}
                  </p>

                  <p
                    className={[
                      "mt-10 leading-none tracking-[-0.05em]",
                      detail.label === "Total Supply"
                        ? "break-all text-3xl md:text-4xl lg:text-3xl xl:text-4xl"
                        : "text-5xl md:text-6xl",
                    ].join(" ")}
                  >
                    {detail.value}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Citizen Passport */}

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>05 / Citizen Passport</p>
            <p>Live Hood Identity</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
            <div>
              <h2 className="section-title">
                Your place
                <br />
                in the Hood.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                Your Citizen Passport brings together the Hoodies you hold,
                their on-chain voices and your future participation in
                Community Fund seasons.
              </p>

              <Link href="/passport" className="pixel-cta mt-10">
                  Open Citizen Passport
                </Link>
            </div>

            <div className="border-2 border-[#ccff00]">
              <div className="flex items-center justify-between border-b-2 border-[#ccff00] p-4 text-[10px] uppercase tracking-[0.16em] md:p-6">
                <span>Citizen Passport</span>
                <span>Live / v1</span>
              </div>

              <div className="p-5 md:p-8">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                      Identity
                    </p>
                    <p className="mt-3 text-3xl leading-none md:text-5xl">
                      Hoodie Citizen
                    </p>
                  </div>

                  <div className="h-14 w-14 border-2 border-[#ccff00] p-2">
                    <div className="h-full w-full bg-[#ccff00]" />
                  </div>
                </div>

                <div className="mt-10 grid border-l border-t border-[#ccff00] sm:grid-cols-2">
                  {[
                    ["Ownership", "Hoodies held"],
                    ["Hood Voice", "On-chain talks"],
                    ["Community", "Season status"],
                    ["Rewards", "Future claims"],
                  ].map(([label, title]) => (
                    <div
                      key={label}
                      className="border-b border-r border-[#ccff00] p-4"
                    >
                      <p className="text-[9px] uppercase tracking-[0.14em] opacity-60">
                        {label}
                      </p>
                      <p className="mt-2 text-xl">{title}</p>
                    </div>
                  ))}
                </div>

                <Link href="/passport" className="pixel-cta mt-6 w-full">
                  Enter the Passport
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}