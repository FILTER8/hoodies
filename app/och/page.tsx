"use client";

import Link from "next/link";
import {
  Contract,
  JsonRpcProvider,
  formatUnits,
} from "ethers";
import {
  useCallback,
  useMemo,
  useState,
} from "react";
import type {
  Address,
  Hex,
} from "viem";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";
import {
  contractExplorerUrl,
  siteConfig,
} from "../../lib/config";

/*//////////////////////////////////////////////////////////////
                            CONFIG
//////////////////////////////////////////////////////////////*/

const OCH_CONTRACT_ADDRESS = siteConfig.ochAddress;
const PING_CONTRACT_ADDRESS = siteConfig.pingAddress;

const INITIAL_ACTIVATION_FEE = "2,500 OCH";
const INITIAL_BURN_RATE = "5%";
const INITIAL_TREASURY_RATE = "95%";

const PING_OPENSEA_URL = PING_CONTRACT_ADDRESS
  ? `https://opensea.io/assets/robinhood/${PING_CONTRACT_ADDRESS}`
  : "#";

const contractIsLive = Boolean(OCH_CONTRACT_ADDRESS);

const ERC20_READ_ABI = [
  "function allowance(address owner,address spender) view returns (uint256)",
] as const;

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/*//////////////////////////////////////////////////////////////
                              TYPES
//////////////////////////////////////////////////////////////*/

type SwapDirection = "ETH_TO_OCH" | "OCH_TO_ETH";

type SwapQuote = {
  ok?: boolean;
  chainId?: number;
  direction?: SwapDirection;
  amountIn?: string;
  amountInFormatted?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  amountOutMinimum?: string;
  amountOutMinimumFormatted?: string;
  slippageBps?: number;
  expiresAt?: number;
  approval?: {
    required: boolean;
    token: string | null;
    spender: string | null;
  };
  execution?: {
    to: string;
    data: Hex;
    value: string;
  };
  error?: string;
};

/*//////////////////////////////////////////////////////////////
                           STATIC DATA
//////////////////////////////////////////////////////////////*/

const allocations = [
  { label: "Hoodies", percent: 30, amount: "30,000,000 OCH" },
  { label: "Community Fund", percent: 35, amount: "35,000,000 OCH" },
  { label: "Liquidity", percent: 20, amount: "20,000,000 OCH" },
  { label: "Treasury", percent: 5, amount: "5,000,000 OCH" },
  { label: "Robinhood Ecosystem", percent: 5, amount: "5,000,000 OCH" },
  { label: "Team", percent: 5, amount: "5,000,000 OCH" },
];

const tokenDetails = [
  ["Total Supply", "100,000,000"],
  ["Inflation", "None"],
  ["Buy Tax", "0%"],
  ["Sell Tax", "0%"],
  ["Transfer Tax", "0%"],
];

const seasonTwoPillars = [
  {
    number: "01",
    title: "HoodOS",
    description:
      "Build apps that give Hoodies new on-chain capabilities through their HoodWallet.",
  },
  {
    number: "02",
    title: "$OCH",
    description:
      "Create meaningful uses for the currency of the Hood inside products, games and protocols.",
  },
  {
    number: "03",
    title: "Usage",
    description:
      "Working products and real usage matter more than announcements or passive integrations.",
  },
  {
    number: "04",
    title: "Open",
    description:
      "Build permissionlessly. Season 02 is about extending what the Hood can actually do.",
  },
];

/*//////////////////////////////////////////////////////////////
                            HELPERS
//////////////////////////////////////////////////////////////*/

function shortAddress(address: string) {
  if (!address) return "TBA";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      shortMessage?: string;
      message?: string;
      cause?: { shortMessage?: string; message?: string };
    };

    return (
      candidate.shortMessage ||
      candidate.cause?.shortMessage ||
      candidate.cause?.message ||
      candidate.message ||
      fallback
    );
  }

  return fallback;
}

function requireWalletAccount<T>(account: T | undefined): T {
  if (!account) throw new Error("Wallet account unavailable.");
  return account;
}

function format18(raw: bigint, maxDecimals = 6) {
  const value = formatUnits(raw, 18);
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/*//////////////////////////////////////////////////////////////
                           SWAP MODULE
//////////////////////////////////////////////////////////////*/

function OCHSwap() {
  const {
    address,
    connect,
    ensureRequiredNetwork,
    getWalletClient,
  } = useWallet();

  const provider = useMemo(() => {
    if (!siteConfig.rpcUrl) return null;

    return new JsonRpcProvider(
      siteConfig.rpcUrl,
      Number(siteConfig.chainId),
      { staticNetwork: true },
    );
  }, []);

  const [direction, setDirection] = useState<SwapDirection>("ETH_TO_OCH");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapPending, setSwapPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inputSymbol = direction === "ETH_TO_OCH" ? "ETH" : "OCH";
  const outputSymbol = direction === "ETH_TO_OCH" ? "OCH" : "ETH";

  const resetQuote = useCallback(() => {
    setQuote(null);
    setMessage("");
    setError("");
  }, []);

  const flipDirection = useCallback(() => {
    setDirection((current) =>
      current === "ETH_TO_OCH" ? "OCH_TO_ETH" : "ETH_TO_OCH",
    );
    setAmount("");
    resetQuote();
  }, [resetQuote]);

  const getQuote = useCallback(async () => {
    if (!address) {
      await connect();
      return;
    }

    if (!amount.trim()) {
      setError("Enter an amount first.");
      return;
    }

    setQuoteLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/och/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          direction,
          amount: amount.trim(),
          recipient: address,
          slippageBps,
        }),
      });

      const payload = (await response.json()) as SwapQuote;

      if (!response.ok || !payload.ok || !payload.execution) {
        throw new Error(payload.error || "Unable to quote this swap.");
      }

      setQuote(payload);
    } catch (quoteError) {
      setQuote(null);
      setError(errorMessage(quoteError, "Unable to quote this swap."));
    } finally {
      setQuoteLoading(false);
    }
  }, [address, amount, connect, direction, slippageBps]);

  const executeSwap = useCallback(async () => {
    if (!address) {
      await connect();
      return;
    }

    if (!quote?.execution || !quote.amountIn) {
      setError("Get a fresh quote first.");
      return;
    }

    if (quote.expiresAt && Math.floor(Date.now() / 1000) >= quote.expiresAt) {
      setQuote(null);
      setError("Quote expired. Get a fresh quote.");
      return;
    }

    try {
      setSwapPending(true);
      setError("");
      setMessage("Preparing swap…");

      await ensureRequiredNetwork();
      const walletClient = await getWalletClient();
      const account = requireWalletAccount(walletClient.account);
      const amountIn = BigInt(quote.amountIn);

      if (
        quote.approval?.required &&
        quote.approval.token &&
        quote.approval.spender
      ) {
        if (!provider) throw new Error("RPC provider unavailable.");

        const token = new Contract(
          quote.approval.token,
          ERC20_READ_ABI,
          provider,
        );

        const allowance = BigInt(
          await token.allowance(address, quote.approval.spender),
        );

        if (allowance < amountIn) {
          setMessage("Authorize OCH for this swap…");

          const approvalHash = await walletClient.writeContract({
            chain: null,
            address: quote.approval.token as Address,
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [quote.approval.spender as Address, amountIn],
            account,
          });

          const approvalReceipt = await provider.waitForTransaction(
            approvalHash,
            1,
          );

          if (!approvalReceipt || approvalReceipt.status !== 1) {
            throw new Error("OCH approval failed.");
          }
        }
      }

      setMessage(`Swapping ${inputSymbol} for ${outputSymbol}…`);

      const hash = await walletClient.sendTransaction({
        chain: null,
        account,
        to: quote.execution.to as Address,
        data: quote.execution.data,
        value: BigInt(quote.execution.value),
      });

      if (!provider) throw new Error("RPC provider unavailable.");

      const receipt = await provider.waitForTransaction(hash, 1);
      if (!receipt || receipt.status !== 1) {
        throw new Error("Swap transaction reverted.");
      }

      setMessage(
        `Swap confirmed · ${quote.amountOutFormatted || ""} ${outputSymbol} quoted.`,
      );
      setAmount("");
      setQuote(null);
    } catch (swapError) {
      setError(errorMessage(swapError, "Swap failed."));
      setMessage("");
    } finally {
      setSwapPending(false);
    }
  }, [
    address,
    connect,
    ensureRequiredNetwork,
    getWalletClient,
    inputSymbol,
    outputSymbol,
    provider,
    quote,
  ]);

  return (
    <div className="border-2 border-[#ccff00] bg-black text-[#ccff00]">
      <div className="flex items-center justify-between border-b-2 border-[#ccff00] px-4 py-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em]">OCH Swap</p>
          <p className="mt-1 text-[7px] uppercase tracking-[0.14em] opacity-55">
            Official Uniswap V4 Pool
          </p>
        </div>

        <span className="border border-[#ccff00] px-2 py-1 text-[7px] uppercase tracking-[0.14em]">
          Robinhood
        </span>
      </div>

      <div className="p-4 md:p-6">
        <div className="border border-[#ccff00] p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[8px] uppercase opacity-55">You pay</p>
            <p className="text-[10px] uppercase">{inputSymbol}</p>
          </div>

          <input
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              resetQuote();
            }}
            inputMode="decimal"
            placeholder="0.0"
            className="mt-3 w-full bg-transparent text-4xl outline-none placeholder:text-[#ccff00]/25 md:text-5xl"
          />
        </div>

        <button
          type="button"
          onClick={flipDirection}
          className="mx-auto my-3 flex h-10 w-10 items-center justify-center border border-[#ccff00] text-lg"
          aria-label="Reverse swap direction"
        >
          ↕
        </button>

        <div className="border border-[#ccff00] p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[8px] uppercase opacity-55">You receive</p>
            <p className="text-[10px] uppercase">{outputSymbol}</p>
          </div>

          <p className="mt-3 min-h-[48px] text-4xl md:text-5xl">
            {quote?.amountOutFormatted || "—"}
          </p>

          {quote?.amountOutMinimumFormatted ? (
            <p className="mt-2 text-[7px] uppercase opacity-55">
              Minimum received · {quote.amountOutMinimumFormatted} {outputSymbol}
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between border border-[#ccff00] px-3 py-2">
          <span className="text-[7px] uppercase opacity-55">Max slippage</span>

          <select
            value={slippageBps}
            onChange={(event) => {
              setSlippageBps(Number(event.target.value));
              resetQuote();
            }}
            className="bg-black text-[8px] uppercase text-[#ccff00] outline-none"
          >
            <option value={50}>0.5%</option>
            <option value={100}>1.0%</option>
            <option value={200}>2.0%</option>
            <option value={300}>3.0%</option>
          </select>
        </div>

        {!quote ? (
          <button
            type="button"
            disabled={quoteLoading || !amount.trim()}
            onClick={() => void getQuote()}
            className="mt-4 w-full bg-[#ccff00] px-5 py-5 text-[10px] uppercase tracking-[0.16em] text-black disabled:opacity-30"
          >
            {!address
              ? "Connect to swap"
              : quoteLoading
                ? "Getting quote…"
                : "Review swap"}
          </button>
        ) : (
          <button
            type="button"
            disabled={swapPending}
            onClick={() => void executeSwap()}
            className="mt-4 w-full bg-[#ccff00] px-5 py-5 text-[10px] uppercase tracking-[0.16em] text-black disabled:opacity-30"
          >
            {swapPending ? "Swapping…" : `Swap ${inputSymbol} → ${outputSymbol}`}
          </button>
        )}

        {direction === "OCH_TO_ETH" ? (
          <p className="mt-3 text-[7px] uppercase leading-relaxed opacity-50">
            Your first OCH sell may require one token approval before the swap transaction.
          </p>
        ) : null}

        {message ? (
          <div className="mt-4 border border-[#ccff00] p-3">
            <p className="text-[8px] uppercase leading-relaxed">{message}</p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 bg-[#ccff00] p-3 text-black">
            <p className="text-[8px] uppercase leading-relaxed">{error}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/*//////////////////////////////////////////////////////////////
                              PAGE
//////////////////////////////////////////////////////////////*/

export default function OCHPage() {
  const ochExplorerUrl = contractIsLive
    ? contractExplorerUrl(OCH_CONTRACT_ADDRESS)
    : "#";

  const pingExplorerUrl = PING_CONTRACT_ADDRESS
    ? contractExplorerUrl(PING_CONTRACT_ADDRESS)
    : "#";

  return (
    <main className="bg-[#ccff00] text-black">
      <SiteHeader />

      {/* OFFICIAL CONTRACT */}
      <div className="border-b border-black bg-black px-6 pt-20 text-[#ccff00]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-center py-3 text-center">
          <p className="text-[8px] uppercase leading-relaxed tracking-[0.16em] md:text-[9px]">
            $OCH is live on Robinhood Chain · Official CA ·{" "}
            <a
              href={ochExplorerUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all underline underline-offset-4"
            >
              {OCH_CONTRACT_ADDRESS}
            </a>
          </p>
        </div>
      </div>

{/* HERO */}
<section className="mx-auto max-w-[1440px] px-6 pb-20 pt-16 text-center md:pt-24">
  <div className="mx-auto flex max-w-5xl flex-col items-center">
    <img
      src="/coin1.gif"
      alt="Animated OCH coin"
      className="image-render-pixel mb-8 h-32 w-32 object-contain md:h-44 md:w-44"
    />

    <p className="text-[10px] uppercase tracking-[0.24em]">
      The Hood Economy · Live
    </p>

    <h1 className="mt-4 text-[clamp(5rem,14vw,11rem)] leading-[0.74] tracking-[-0.09em]">
      $OCH
    </h1>

    <h2 className="mt-10 text-[clamp(2.2rem,5vw,4.8rem)] leading-[0.9] tracking-[-0.06em]">
      THE CURRENCY
      <br />
      OF THE HOOD.
    </h2>

    <p className="mt-8 max-w-2xl text-base leading-relaxed md:text-xl">
      A fixed-supply ERC-20 connecting Hoodies, HoodWallet, HoodOS and the
      builders extending the economy around them.
    </p>
  </div>
</section>

      {/* 01 SWAP */}
      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>01 / Swap</p>
            <p>OCH ↔ ETH</p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">Live market</p>
              <h2 className="section-title mt-4">
                SWAP IN
                <br />
                THE HOOD.
              </h2>
              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                Trade directly against the official hookless OCH / ETH Uniswap V4 pool on Robinhood Chain.
              </p>
              <p className="mt-6 max-w-lg text-sm leading-relaxed opacity-55">
                Quotes are generated from the live v4 pool. The transaction enforces the minimum output shown before execution.
              </p>
            </div>

            <OCHSwap />
          </div>
        </div>
      </section>

      {/* 02 DISTRIBUTION */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>02 / Distribution</p>
            <p>100,000,000 OCH</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="section-title">
                BUILT FOR
                <br />
                THE WHOLE HOOD.
              </h2>
              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                Fixed supply allocated across Hoodies, community seasons, liquidity, treasury operations, the Robinhood ecosystem and team vesting.
              </p>
            </div>

            <div className="border-l-2 border-t-2 border-black">
              {allocations.map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-b-2 border-r-2 border-black p-5 md:p-6"
                >
                  <div>
                    <p className="text-lg md:text-2xl">{item.label}</p>
                    <p className="mt-2 text-[8px] uppercase tracking-[0.14em] opacity-55">{item.amount}</p>
                  </div>
                  <p className="text-4xl tracking-[-0.05em] md:text-5xl">{item.percent}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 03 COMMUNITY SEASONS */}
      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>03 / Community Fund</p>
            <p>35% Across Three Seasons</p>
          </div>

          <div className="mt-12 grid border-l-2 border-t-2 border-[#ccff00] lg:grid-cols-3">
            <article className="border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
              <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">Season 01 · Complete</p>
              <p className="mt-6 text-6xl tracking-[-0.06em]">15%</p>
              <h3 className="mt-6 text-2xl">EARLY PARTICIPATION</h3>
              <p className="mt-4 text-sm leading-relaxed opacity-70">
                Hood Talk, submitted X contributions and verified Hoodie representation. The participation window is closed.
              </p>
              <Link href="/passport" className="mt-6 inline-block text-[8px] uppercase underline underline-offset-4">
                View Season 01
              </Link>
            </article>

            <article className="border-b-2 border-r-2 border-[#ccff00] bg-[#ccff00] p-6 text-black md:p-8">
              <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">Season 02 · Builders</p>
              <p className="mt-6 text-6xl tracking-[-0.06em]">10%</p>
              <h3 className="mt-6 text-2xl">BUILD THE ECONOMY</h3>
              <p className="mt-4 text-sm leading-relaxed opacity-70">
                For builders extending the Hood through HoodOS or creating meaningful utility for $OCH.
              </p>
              <a href="#season-02" className="mt-6 inline-block text-[8px] uppercase !text-black underline underline-offset-4">
                Season 02 direction
              </a>
            </article>

            <article className="border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
              <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">Season 03 · Future</p>
              <p className="mt-6 text-6xl tracking-[-0.06em]">10%</p>
              <h3 className="mt-6 text-2xl">NEXT CHAPTER</h3>
              <p className="mt-4 text-sm leading-relaxed opacity-70">
                Reserved for the next phase of community participation and ecosystem contribution.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* 04 HOODWALLET */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>04 / HoodWallet</p>
            <p>OCH Utility</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">One Hoodie. One Account.</p>
              <h2 className="section-title mt-4">
                YOUR HOODIE
                <br />
                HAS A WALLET.
              </h2>
              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                $OCH activates the HoodWallet for the current Hoodie owner. Once active, the Hoodie can hold assets and use HoodOS apps as its own on-chain account.
              </p>
              <Link href="/hoodwallet" className="pixel-cta mt-10">Explore HoodWallet</Link>
            </div>

            <div className="grid border-l-2 border-t-2 border-black sm:grid-cols-2">
              {[
                ["Activation", INITIAL_ACTIVATION_FEE, "Initial activation cost paid from the owner wallet."],
                ["Burn", INITIAL_BURN_RATE, "125 OCH from the initial 2,500 OCH activation is sent to the burn recipient."],
                ["Treasury", INITIAL_TREASURY_RATE, "2,375 OCH flows to the Hood Treasury under the initial parameters."],
                ["Transfer", "RESET", "When the Hoodie changes owners, access resets and the new owner activates again."],
              ].map(([label, value, description]) => (
                <article key={label} className="flex min-h-[245px] flex-col justify-between border-b-2 border-r-2 border-black p-6 md:p-8">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">{label}</p>
                    <p className="mt-6 text-4xl tracking-[-0.05em] md:text-5xl">{value}</p>
                  </div>
                  <p className="mt-8 text-sm leading-relaxed opacity-70">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 05 PING */}
      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>05 / Ping</p>
            <p>First Activation Asset</p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
            <div className="overflow-hidden border-2 border-[#ccff00] bg-[#ccff00]">
              <img
                src="/ping.gif"
                alt="Ping collection"
                className="image-render-pixel aspect-square h-full w-full object-cover"
              />
            </div>

            <div className="flex flex-col border-2 border-[#ccff00] p-6 md:p-8">
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-55">The first asset of your Hoodie</p>
              <h2 className="mt-4 text-[clamp(3rem,7vw,7rem)] leading-[0.8] tracking-[-0.07em]">
                ONE HOODIE.
                <br />
                ONE PING.
              </h2>
              <p className="mt-8 max-w-2xl text-lg leading-relaxed opacity-75 md:text-xl">
                The first successful activation of a Hoodie unlocks its matching Ping and delivers it directly into that Hoodie&apos;s HoodWallet.
              </p>

              <div className="mt-8 border border-[#ccff00] p-4">
                <p className="text-[7px] uppercase tracking-[0.14em] opacity-55">Ping Contract</p>
                <p className="mt-2 break-all text-[9px] md:text-xs">{PING_CONTRACT_ADDRESS}</p>
              </div>

              <div className="mt-auto grid gap-2 pt-6 sm:grid-cols-2">
                <a
                  href={pingExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[52px] items-center justify-center border border-[#ccff00] px-4 text-[8px] uppercase tracking-[0.14em]"
                >
                  View Contract
                </a>
                <a
                  href={PING_OPENSEA_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[52px] items-center justify-center bg-[#ccff00] px-4 text-[8px] uppercase tracking-[0.14em] !text-black"
                >
                  View on OpenSea
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 06 HOODOS */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>06 / HoodOS</p>
            <p>Capability Layer</p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <h2 className="section-title">
                AN ECONOMY
                <br />
                HOODIES CAN USE.
              </h2>
              <p className="mt-8 max-w-2xl text-lg leading-relaxed opacity-75 md:text-xl">
                HoodOS turns the Hoodie into an active on-chain account. MintOS lets it mint. BuyOS lets it collect. Community builders can add the next capabilities.
              </p>
            </div>
            <div className="border-2 border-black p-6 md:p-8">
              <p className="text-[8px] uppercase opacity-55">HoodOS today</p>
              <p className="mt-4 text-3xl">MINT · BUY · BUILD</p>
              <Link href="/hoodos" className="pixel-cta mt-7">Explore HoodOS</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 07 LIQUIDITY */}
      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>07 / Liquidity</p>
            <p>Live Uniswap V4</p>
          </div>

          <div className="mt-12 grid border-l-2 border-t-2 border-[#ccff00] sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Market", "OCH / ETH"],
              ["Initial OCH", "15M"],
              ["Initial ETH", "7.5"],
              ["Pool Fee", "0.30%"],
              ["Official LP", "730 DAYS"],
            ].map(([label, value]) => (
              <div key={label} className="border-b-2 border-r-2 border-[#ccff00] p-5 md:p-6">
                <p className="text-[8px] uppercase opacity-55">{label}</p>
                <p className="mt-5 text-3xl tracking-[-0.05em] md:text-4xl">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 border-2 border-[#ccff00] p-6 md:p-8">
            <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">Official liquidity position</p>
            <p className="mt-4 max-w-4xl text-lg leading-relaxed md:text-2xl">
              The official OCH / ETH pool is hookless. Its initial Uniswap V4 LP position is hard-locked for 730 days while fee collection remains possible without reducing principal liquidity.
            </p>

            {siteConfig.ochLiquidityLockerAddress ? (
              <a
                href={contractExplorerUrl(siteConfig.ochLiquidityLockerAddress)}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-block break-all text-[9px] uppercase underline underline-offset-4"
              >
                Verify liquidity locker · {siteConfig.ochLiquidityLockerAddress}
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {/* 08 SEASON 02 */}
      <section id="season-02" className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>08 / Season 02</p>
            <p>Builders</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-55">The next season</p>
              <h2 className="section-title mt-4">
                BUILD THE
                <br />
                ECONOMY.
              </h2>
              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75 md:text-xl">
                Season 02 supports builders extending the Hood through HoodOS or creating meaningful utility for $OCH.
              </p>
              <p className="mt-5 max-w-lg text-sm leading-relaxed opacity-60">
                The direction is utility and usage. Final measurement and allocation rules can be published separately before rewards are finalized.
              </p>
              <Link href="/builders" className="pixel-cta mt-10">Explore Builders</Link>
            </div>

            <div className="grid border-l-2 border-t-2 border-black sm:grid-cols-2">
              {seasonTwoPillars.map((pillar) => (
                <article
                  key={pillar.number}
                  className="flex min-h-[260px] flex-col justify-between border-b-2 border-r-2 border-black p-6 md:p-8"
                >
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">{pillar.number}</p>
                    <h3 className="mt-5 text-3xl tracking-[-0.045em] md:text-4xl">{pillar.title}</h3>
                  </div>
                  <p className="mt-8 text-sm leading-relaxed opacity-70">{pillar.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 09 TOKEN */}
      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>09 / Token Design</p>
            <p>Fixed Supply</p>
          </div>

          <div className="mt-12 grid border-l-2 border-t-2 border-[#ccff00] sm:grid-cols-2 lg:grid-cols-5">
            {tokenDetails.map(([label, value]) => (
              <article key={label} className="flex min-h-[190px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-5 md:min-h-[220px] md:p-7">
                <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">{label}</p>
                <p className={`${label === "Total Supply" ? "text-3xl" : "text-5xl"} mt-10 break-all tracking-[-0.05em]`}>
                  {value}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-8 border-2 border-[#ccff00] p-6 md:p-8">
            <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">Trading tax ≠ HoodWallet activation fee</p>
            <p className="mt-5 max-w-4xl text-lg leading-relaxed md:text-2xl">
              $OCH has 0% buy, sell and transfer tax. HoodWallet activation is a separate ecosystem utility with an initial fee of {INITIAL_ACTIVATION_FEE}.
            </p>
          </div>
        </div>
      </section>

      {/* 10 RISK */}
      <section className="border-t-2 border-black px-6 py-20 md:py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>10 / Risk Disclosure</p>
            <p>Important</p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
            <h2 className="section-title">
              PARTICIPATE
              <br />
              RESPONSIBLY.
            </h2>

            <div className="border-l-2 border-black pl-6 md:pl-10">
              <p className="text-xl leading-relaxed md:text-3xl">
                $OCH is a community token designed to support the OnChainHoodies ecosystem. Digital assets are volatile and involve significant risk.
              </p>
              <p className="mt-6 max-w-3xl text-base leading-relaxed opacity-75 md:text-xl">
                Liquidity, market value, future utility and future rewards are not guaranteed. Nothing on this page constitutes financial, investment, legal or tax advice.
              </p>
              <p className="mt-8 text-[10px] uppercase tracking-[0.2em]">NOT FINANCIAL ADVICE · DO YOUR OWN RESEARCH</p>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
