import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import {
  contractExplorerUrl,
  siteConfig,
} from "../../lib/config";

/* =========================================================
   OCH CONFIG
   ========================================================= */

const OCH_CONTRACT_ADDRESS = siteConfig.ochAddress;

const WHITEPAPER_HREF = "/whitepaper";

const HOOD_TALK_QUALIFYING_HOODIES = 2540;

const HOOD_TALK_FIRST_REWARD = "2,500 OCH";

const INITIAL_ACTIVATION_FEE = "2,500 OCH";
const INITIAL_BURN_RATE = "5%";
const INITIAL_TREASURY_RATE = "95%";

const contractIsLive = Boolean(OCH_CONTRACT_ADDRESS);

const shortAddress = (address: string) => {
  if (!address) return "TBA";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/* =========================================================
   TOKEN DISTRIBUTION
   ========================================================= */

const allocations = [
  {
    label: "Hoodies",
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
    percent: 20,
    amount: "20,000,000 OCH",
    dash: "20 80",
    offset: -65,
    opacity: 0.66,
  },
  {
    label: "Treasury",
    percent: 5,
    amount: "5,000,000 OCH",
    dash: "5 95",
    offset: -85,
    opacity: 0.5,
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

const hoodieRounds = [
  {
    number: "01",
    timing: "Launch",
    amount: "10%",
    description: "First Hoodie distribution.",
  },
  {
    number: "02",
    timing: "+2 Months",
    amount: "10%",
    description: "Second Hoodie distribution.",
  },
  {
    number: "03",
    timing: "+4 Months",
    amount: "10%",
    description: "Final Hoodie distribution.",
  },
];

const communityRounds = [
  {
    number: "01",
    timing: "Season 01",
    amount: "15%",
    label: "Growth",
    description:
      "Season 01 recognizes early participation across Hood Talk, submitted X contributions and verified Hoodie PFPs.",
  },
  {
    number: "02",
    timing: "+2 Months",
    amount: "10%",
    label: "Season 02",
    description:
      "Reserved for the next season of participation and community contribution.",
  },
  {
    number: "03",
    timing: "+4 Months",
    amount: "10%",
    label: "Season 03",
    description:
      "Reserved for the third seasonal participation period.",
  },
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

const hoodWalletDetails = [
  {
    label: "Before Activation",
    value: "Receive",
    description:
      "The HoodWallet can receive supported on-chain assets before activation.",
  },
  {
    label: "Initial Activation",
    value: "2,500 OCH",
    description:
      "The initial activation fee enables the HoodWallet for the current Hoodie owner.",
  },
  {
    label: "Initial Burn",
    value: "5%",
    description:
      "125 OCH is burned from a 2,500 OCH activation under the initial parameters.",
  },
  {
    label: "Treasury Flow",
    value: "95%",
    description:
      "2,375 OCH flows to the Hood Treasury under the initial parameters.",
  },
];

const liquidityDetails = [
  {
    label: "Initial OCH Liquidity",
    value: "15M OCH",
    description:
      "Allocated to the initial Uniswap V4 liquidity position.",
  },
  {
    label: "Initial Pair",
    value: "OCH / ETH",
    description:
      "The initial market is paired against native ETH on Uniswap V4.",
  },
  {
    label: "Liquidity Reserve",
    value: "5M OCH",
    description:
      "Reserved exclusively for future liquidity deployment.",
  },
  {
    label: "Initial LP Lock",
    value: "730 Days",
    description:
      "The initial Uniswap V4 position is committed to the on-chain liquidity locker.",
  },
];

/* =========================================================
   PAGE
   ========================================================= */

export default function OCHPage() {
  const ochExplorerUrl =
    contractIsLive
      ? contractExplorerUrl(OCH_CONTRACT_ADDRESS)
      : "#";

  return (
    <main className="bg-[#ccff00] text-black">
      <SiteHeader />

      {/* =====================================================
          SECURITY / OFFICIAL CONTRACT
         ===================================================== */}

      <div className="border-b border-black bg-black px-6 pt-20 text-[#ccff00]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-center py-3 text-center">
          {contractIsLive ? (
            <p className="text-[8px] uppercase leading-relaxed tracking-[0.16em] md:text-[9px]">
              Official $OCH Contract ·{" "}
              <a
                href={ochExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all underline underline-offset-4"
              >
                {OCH_CONTRACT_ADDRESS}
              </a>
              {" "}· Verify before interacting
            </p>
          ) : (
            <p className="text-[8px] uppercase leading-relaxed tracking-[0.16em] md:text-[9px]">
              Official $OCH contract unavailable.
            </p>
          )}
        </div>
      </div>

      {/* =====================================================
          HERO
         ===================================================== */}

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
          A fixed-supply ERC-20 connecting Hoodies, participation and the
          programmable HoodWallet layer.
        </p>

        {contractIsLive ? (
          <div className="mt-10 w-full max-w-3xl border-2 border-black bg-black p-5 text-[#ccff00] md:p-6">
            <p className="text-[8px] uppercase tracking-[0.18em] opacity-60">
              Official Contract Address
            </p>

            <a
              href={ochExplorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block break-all text-sm underline underline-offset-4 md:text-base"
            >
              {OCH_CONTRACT_ADDRESS}
            </a>

            <p className="mt-4 text-[8px] uppercase leading-relaxed tracking-[0.14em] opacity-55">
              Robinhood Chain · Always verify the CA before interacting
            </p>
          </div>
        ) : null}

        <div className="mt-8 grid w-full max-w-5xl grid-cols-2 border-2 border-black text-[9px] uppercase tracking-[0.15em] md:grid-cols-4">
          {[
            "100M Fixed Supply",
            "No Inflation",
            "0% Trading Tax",
            contractIsLive
              ? shortAddress(OCH_CONTRACT_ADDRESS)
              : "Contract TBA",
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

        <p className="mt-8 max-w-2xl text-base leading-relaxed md:text-xl">
          HoodWallet activation · 2,500 $OCH initial fee
        </p>
      </section>

      {/* =====================================================
          01 / DISTRIBUTION
         ===================================================== */}

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>01 / Distribution</p>
            <p>Allocation</p>
          </div>

          <div className="mt-12 grid gap-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <h2 className="section-title">
                Built for the
                <br />
                whole Hood.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-70 md:text-xl">
                100 million $OCH. Fixed supply. Allocated across Hoodies,
                community participation, liquidity, treasury operations and
                the wider Robinhood ecosystem.
              </p>

              <div className="mx-auto mt-12 aspect-square w-full max-w-[500px] lg:mx-0">
                <svg
                  viewBox="0 0 240 240"
                  role="img"
                  aria-label="OCH token distribution chart"
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
                    FIXED
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

      {/* =====================================================
          02 / HOODIE REWARDS
         ===================================================== */}

      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>02 / Hoodie Rewards</p>
            <p>30% Allocation</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="section-title">
                Every Hoodie.
                <br />
                Equal Hoodies.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                Every Hoodie receives the same Hoodie allocation across three
                rounds. Traits define identity, not allocation value.
              </p>

              <p className="mt-6 max-w-lg text-sm leading-relaxed opacity-60 md:text-base">
                Hoodie rewards and Community Fund participation are separate
                allocation paths.
              </p>
            </div>

            <div className="border-l-2 border-t-2 border-black md:grid md:grid-cols-3">
              {hoodieRounds.map((round) => (
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

      {/* =====================================================
          03 / COMMUNITY FUND
         ===================================================== */}

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>03 / Community Fund</p>
            <p>35% Allocation</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="section-title">
                Participation
                <br />
                matters.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                The Community Fund is distributed across three seasons.
                Season 01 receives 15% of total $OCH supply and recognizes
                early participation across Hood Talk, X contributions and
                verified Hoodie representation.
              </p>
            </div>

            <div className="border-l-2 border-t-2 border-[#ccff00] md:grid md:grid-cols-3">
              {communityRounds.map((round) => (
                <article
                  key={round.number}
                  className="flex min-h-[410px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8"
                >
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                        Round {round.number}
                      </span>

                      <span className="border border-[#ccff00] px-2 py-1 text-[9px] uppercase tracking-[0.14em]">
                        {round.number === "01" ? "Season 01" : "Next"}
                      </span>
                    </div>

                    <p className="mt-12 text-sm uppercase tracking-[0.18em] opacity-60">
                      {round.timing}
                    </p>

                    <p className="mt-3 text-6xl leading-none tracking-[-0.06em] md:text-7xl">
                      {round.amount}
                    </p>

                    <p className="mt-5 text-lg uppercase tracking-[0.12em]">
                      {round.label}
                    </p>
                  </div>

                  <p className="mt-10 max-w-xs text-sm leading-relaxed opacity-70">
                    {round.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          {/* Season 01 Split */}

          <div className="mt-16">
            <div className="section-heading-row">
              <p>Season 01 Breakdown</p>
              <p>15,000,000 OCH</p>
            </div>

            <div className="mt-8 grid border-l-2 border-t-2 border-[#ccff00] lg:grid-cols-2">
              <article className="border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                  Hood Talk
                </p>

                <div className="mt-6 flex items-end justify-between gap-4">
                  <p className="text-6xl leading-none tracking-[-0.06em] md:text-7xl">
                    10%
                  </p>

                  <p className="text-right text-sm uppercase tracking-[0.14em] opacity-60">
                    10,000,000 OCH
                  </p>
                </div>

                <p className="mt-8 text-lg leading-relaxed">
                  Season 01 rewards native on-chain Hood Talk activity. The
                  first qualifying activation receives the full reward; the
                  second and third activations receive progressively smaller
                  rewards.
                </p>

                <div className="mt-8 grid border-l border-t border-[#ccff00] sm:grid-cols-3">
                  <div className="border-b border-r border-[#ccff00] p-4">
                    <p className="text-[9px] uppercase tracking-[0.14em] opacity-60">
                      01 / First Activation
                    </p>

                    <p className="mt-3 text-3xl">
                      {HOOD_TALK_FIRST_REWARD}
                    </p>

                    <p className="mt-3 text-xs leading-relaxed opacity-60">
                      Full Season 01 Hood Talk reward.
                    </p>
                  </div>

                  <div className="border-b border-r border-[#ccff00] p-4">
                    <p className="text-[9px] uppercase tracking-[0.14em] opacity-60">
                      02 / Second Activation
                    </p>

                    <p className="mt-3 text-3xl">Reduced</p>

                    <p className="mt-3 text-xs leading-relaxed opacity-60">
                      Progressively smaller than the first activation.
                    </p>
                  </div>

                  <div className="border-b border-r border-[#ccff00] p-4">
                    <p className="text-[9px] uppercase tracking-[0.14em] opacity-60">
                      03 / Third Activation
                    </p>

                    <p className="mt-3 text-3xl">Reduced</p>

                    <p className="mt-3 text-xs leading-relaxed opacity-60">
                      Final Season 01 Hood Talk activation tier.
                    </p>
                  </div>
                </div>

                <p className="mt-5 text-[10px] uppercase leading-relaxed tracking-[0.14em] opacity-50">
                  Current Hood Talk state:{" "}
                  {HOOD_TALK_QUALIFYING_HOODIES.toLocaleString()} unique
                  Hoodies spoken. Final rewards follow recorded Season 01
                  activations.
                </p>
              </article>

              <article className="border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                  X + Verified Hoodie PFP
                </p>

                <div className="mt-6 flex items-end justify-between gap-4">
                  <p className="text-6xl leading-none tracking-[-0.06em] md:text-7xl">
                    5%
                  </p>

                  <p className="text-right text-sm uppercase tracking-[0.14em] opacity-60">
                    5,000,000 OCH
                  </p>
                </div>

                <p className="mt-8 text-lg leading-relaxed">
                  The second Season 01 participation track recognizes
                  submitted X contributions and verified Hoodie PFP
                  participation.
                </p>

                <p className="mt-8 text-sm leading-relaxed opacity-70">
                  Community Fund allocations are based on recorded Season 01
                  participation and review criteria. Participation does not
                  guarantee equal allocation.
                </p>

                <div className="mt-8 border border-[#ccff00] p-4">
                  <p className="text-[9px] uppercase tracking-[0.14em] opacity-60">
                    X Submission Window
                  </p>

                  <p className="mt-2 text-2xl">Closed</p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          04 / HOODWALLET
         ===================================================== */}

      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>04 / HoodWallet</p>
            <p>Programmable Identity</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">
                One Hoodie. One Account.
              </p>

              <h2 className="section-title mt-4">
                Your Hoodie
                <br />
                has a wallet.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                Every Hoodie has its own on-chain HoodWallet. Before
                activation, the account can receive supported assets. $OCH is
                used to activate the wallet for the current Hoodie owner.
              </p>

              <Link href="/hoodwallet" className="pixel-cta mt-10">
                Explore HoodWallet
              </Link>
            </div>

            <div className="grid border-l-2 border-t-2 border-black sm:grid-cols-2">
              {hoodWalletDetails.map((detail) => (
                <article
                  key={detail.label}
                  className="flex min-h-[250px] flex-col justify-between border-b-2 border-r-2 border-black p-6 md:p-8"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                      {detail.label}
                    </p>

                    <p className="mt-6 text-4xl leading-none tracking-[-0.05em] md:text-5xl">
                      {detail.value}
                    </p>
                  </div>

                  <p className="mt-8 max-w-sm text-sm leading-relaxed opacity-70">
                    {detail.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-16 border-2 border-black">
            <div className="grid lg:grid-cols-[0.65fr_1.35fr]">
              <div className="border-b-2 border-black p-6 md:p-8 lg:border-b-0 lg:border-r-2">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                  Ownership Change
                </p>

                <p className="mt-5 text-4xl leading-none md:text-5xl">
                  TRANSFER
                  <br />
                  = RESET
                </p>
              </div>

              <div className="p-6 md:p-8">
                <p className="text-xl leading-relaxed md:text-3xl">
                  When a Hoodie changes owners, its HoodWallet becomes
                  inactive and must be activated again by the new owner.
                </p>

                <p className="mt-6 text-base leading-relaxed opacity-70 md:text-xl">
                  Assets already held by the HoodWallet remain with the
                  Hoodie. Reactivation changes access for the new owner - it
                  does not erase the Hoodie&apos;s on-chain inventory.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          05 / PING
         ===================================================== */}

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>05 / First Activation</p>
            <p>Ping</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">
                The first HoodWallet asset
              </p>

              <h2 className="section-title mt-4">
                One Hoodie.
                <br />
                One Ping.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                The first successful HoodWallet activation delivers a Ping
                directly into the Hoodie&apos;s own on-chain account.
              </p>
            </div>

            <div className="border-2 border-[#ccff00]">
              <div className="grid sm:grid-cols-3">
                {[
                  ["01", "Activate", INITIAL_ACTIVATION_FEE],
                  ["02", "Receive", "1 Ping"],
                  ["03", "Destination", "HoodWallet"],
                ].map(([number, label, value]) => (
                  <div
                    key={number}
                    className="border-b-2 border-[#ccff00] p-6 last:border-b-0 sm:border-b-0 sm:border-r-2 sm:last:border-r-0 md:p-8"
                  >
                    <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                      {number}
                    </p>

                    <p className="mt-8 text-sm uppercase tracking-[0.15em] opacity-60">
                      {label}
                    </p>

                    <p className="mt-3 text-3xl leading-none md:text-4xl">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-[#ccff00] p-6 text-center md:p-10">
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">
                  First Activation Ping
                </p>

                <p className="mt-6 text-[clamp(3rem,8vw,7rem)] leading-none tracking-[-0.08em]">
                  Ping
                </p>

                <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed opacity-70 md:text-base">
                  Sent directly to the Hoodie&apos;s Token Bound Account. The
                  Hoodie receives the asset - not the owner wallet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          06 / LIQUIDITY
         ===================================================== */}

      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>06 / Liquidity</p>
            <p>20% Total Allocation</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="section-title">
                Launch depth.
                <br />
                Room to grow.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                20% of total $OCH supply is allocated to liquidity. 15% is
                allocated to the initial Uniswap V4 position and 5% is
                reserved exclusively for future liquidity deployment.
              </p>
            </div>

            <div className="grid border-l-2 border-t-2 border-black sm:grid-cols-2">
              {liquidityDetails.map((detail) => (
                <article
                  key={detail.label}
                  className="flex min-h-[250px] flex-col justify-between border-b-2 border-r-2 border-black p-6 md:p-8"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                      {detail.label}
                    </p>

                    <p className="mt-6 text-4xl leading-none tracking-[-0.05em] md:text-5xl">
                      {detail.value}
                    </p>
                  </div>

                  <p className="mt-8 text-sm leading-relaxed opacity-70">
                    {detail.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-12 border-2 border-black p-6 md:p-8">
            <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
              Initial Liquidity Position
            </p>

            <p className="mt-5 max-w-4xl text-lg leading-relaxed md:text-2xl">
              The initial Uniswap V4 LP position is configured for a 730-day
              hard lock through the OCH Liquidity Locker. The remaining
              5,000,000 OCH liquidity reserve stays separate for future
              liquidity deployment.
            </p>

            {siteConfig.ochLiquidityLockerAddress ? (
              <a
                href={contractExplorerUrl(
                  siteConfig.ochLiquidityLockerAddress,
                )}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-block break-all text-[10px] uppercase tracking-[0.14em] underline underline-offset-4"
              >
                Verify Liquidity Locker ·{" "}
                {siteConfig.ochLiquidityLockerAddress} ↗
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {/* =====================================================
          07 / TREASURY
         ===================================================== */}

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>07 / Hood Treasury</p>
            <p>5% Initial Allocation</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <h2 className="section-title">
                Built to
                <br />
                keep building.
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                The Hood Treasury supports ecosystem operations, development,
                experimentation and future OnChainHoodies initiatives.
              </p>
            </div>

            <div className="border-2 border-[#ccff00]">
              <div className="grid sm:grid-cols-2">
                <div className="border-b-2 border-[#ccff00] p-6 sm:border-b-0 sm:border-r-2 md:p-8">
                  <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                    Initial Allocation
                  </p>

                  <p className="mt-6 text-5xl leading-none md:text-6xl">
                    5M OCH
                  </p>

                  <p className="mt-6 text-sm leading-relaxed opacity-70">
                    5% of total supply.
                  </p>
                </div>

                <div className="p-6 md:p-8">
                  <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                    Activation Flow
                  </p>

                  <p className="mt-6 text-5xl leading-none md:text-6xl">
                    {INITIAL_TREASURY_RATE}
                  </p>

                  <p className="mt-6 text-sm leading-relaxed opacity-70">
                    Under the initial parameters, 95% of every HoodWallet
                    activation fee flows to the Hood Treasury.
                  </p>
                </div>
              </div>

              <div className="border-t-2 border-[#ccff00] p-6 md:p-8">
                <p className="text-lg leading-relaxed md:text-2xl">
                  Treasury assets may be used for ecosystem operations,
                  development and documented on-chain experiments, including
                  potential acquisitions of Hoodies or other ecosystem assets.
                </p>

                {siteConfig.treasuryVaultAddress ? (
                  <a
                    href={contractExplorerUrl(
                      siteConfig.treasuryVaultAddress,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-block break-all text-[10px] uppercase tracking-[0.14em] underline underline-offset-4"
                  >
                    Verify Treasury Vault ·{" "}
                    {siteConfig.treasuryVaultAddress} ↗
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          08 / TOKEN DESIGN
         ===================================================== */}

      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>08 / Token</p>
            <p>Token Design</p>
          </div>

          <div className="mt-12">
            <h2 className="section-title">
              Fixed supply.
              <br />
              No trading tax.
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

            <div className="mt-8 border-2 border-black p-6 md:p-8">
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                Trading Tax ≠ HoodWallet Activation Fee
              </p>

              <p className="mt-5 max-w-4xl text-lg leading-relaxed md:text-2xl">
                $OCH has 0% buy, sell and transfer tax. HoodWallet activation
                is a separate ecosystem utility with an initial fee of{" "}
                {INITIAL_ACTIVATION_FEE}.
              </p>
            </div>

            {contractIsLive ? (
              <div className="mt-8 border-2 border-black bg-black p-6 text-[#ccff00] md:p-8">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                  Official $OCH Contract
                </p>

                <p className="mt-5 text-xl leading-relaxed md:text-3xl">
                  Verify the contract address before interacting with $OCH.
                </p>

                <a
                  href={ochExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 block break-all text-sm underline underline-offset-4 md:text-base"
                >
                  {OCH_CONTRACT_ADDRESS}
                </a>

                <div className="mt-6 grid border-l border-t border-[#ccff00] sm:grid-cols-3">
                  <div className="border-b border-r border-[#ccff00] p-4">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">
                      Network
                    </p>
                    <p className="mt-2 text-lg">{siteConfig.chainName}</p>
                  </div>

                  <div className="border-b border-r border-[#ccff00] p-4">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">
                      Symbol
                    </p>
                    <p className="mt-2 text-lg">OCH</p>
                  </div>

                  <div className="border-b border-r border-[#ccff00] p-4">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-55">
                      Supply
                    </p>
                    <p className="mt-2 text-lg">100,000,000</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* =====================================================
          09 / SEASON 01
         ===================================================== */}

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>09 / Hoodie Passport</p>
            <p>Season 01 Complete</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">
                Grow the Hood
              </p>

              <h2 className="mt-4 text-[clamp(4rem,9vw,8rem)] leading-[0.78] tracking-[-0.08em]">
                SEASON
                <br />
                01
              </h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                Season 01 participation is complete. The final season
                recognized Hoodie ownership, Hood Talk, submitted X
                contributions and verified Hoodie PFP participation.
              </p>

              <Link href="/passport" className="pixel-cta mt-10">
                View Passport
              </Link>
            </div>

            <div className="border-2 border-[#ccff00]">
              <div className="flex items-center justify-between border-b-2 border-[#ccff00] p-4 text-[10px] uppercase tracking-[0.16em] md:p-6">
                <span>Hoodie Passport</span>
                <span>Season 01</span>
              </div>

              <div className="p-5 md:p-8">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                      Season Status
                    </p>

                    <p className="mt-3 text-3xl leading-none md:text-5xl">
                      Complete
                    </p>
                  </div>

                  <div className="flex h-16 w-16 items-center justify-center border-2 border-[#ccff00] text-3xl leading-none">
                    01
                  </div>
                </div>

                <div className="mt-10 grid border-l border-t border-[#ccff00] sm:grid-cols-3">
                  {[
                    [
                      "01 / Hoodie",
                      "Automatic",
                      "Every Hoodie qualifies for the Hoodie allocation path.",
                    ],
                    [
                      "02 / Hood Talk",
                      "10%",
                      "Season 01 participation complete.",
                    ],
                    [
                      "03 / X + PFP",
                      "5%",
                      "Season 01 participation complete.",
                    ],
                  ].map(([label, value, description]) => (
                    <div
                      key={label}
                      className="border-b border-r border-[#ccff00] p-4 md:min-h-[190px]"
                    >
                      <p className="text-[9px] uppercase tracking-[0.14em] opacity-60">
                        {label}
                      </p>

                      <p className="mt-5 text-3xl leading-none">
                        {value}
                      </p>

                      <p className="mt-3 text-xs leading-relaxed opacity-60">
                        {description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          10 / RISK DISCLOSURE
         ===================================================== */}

      <section className="border-t-2 border-black bg-[#ccff00] px-6 py-20 md:py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>10 / Risk Disclosure</p>
            <p>Important</p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
            <h2 className="section-title">
              Participate
              <br />
              responsibly.
            </h2>

            <div className="border-l-2 border-black pl-6 md:pl-10">
              <p className="text-xl leading-relaxed md:text-3xl">
                $OCH is a community token designed to support the
                OnChainHoodies ecosystem. Participation is voluntary and
                should not be viewed as an investment or financial product.
              </p>

              <p className="mt-6 max-w-3xl text-base leading-relaxed opacity-75 md:text-xl">
                Digital assets are highly volatile and involve significant
                risk, including the potential loss of your entire purchase
                price. Liquidity, market value, future utility and future
                rewards are not guaranteed.
              </p>

              <p className="mt-6 max-w-3xl text-base leading-relaxed opacity-75 md:text-xl">
                Nothing presented by OnChainHoodies constitutes financial,
                investment, legal or tax advice. Please conduct your own
                research and only participate with funds you can afford to
                lose.
              </p>

              <p className="mt-8 text-[10px] uppercase tracking-[0.2em]">
                NOT FINANCIAL ADVICE • DO YOUR OWN RESEARCH
              </p>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}