"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, Interface, JsonRpcProvider, formatUnits, isAddress, parseEther, parseUnits } from "ethers";
import { encodeFunctionData, parseAbi } from "viem";
import type { Address, Hex } from "viem";
import { useWallet } from "./WalletProvider";
import { siteConfig } from "../lib/config";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to,uint256 amount) returns (bool)",
]);
const EXECUTE_ABI = parseAbi(["function execute(address target,uint256 value,bytes data,uint8 operation) payable returns (bytes result)"]);
const ERC20_INTERFACE = new Interface(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const ETH_ZERO_DATA = "0x" as Hex;
const NETWORK_ID = Number(siteConfig.chainId);
const EOA_GAS_RESERVE = parseEther("0.00005");
const DEFAULT_OCH_ADDRESS = "0x8BDD5adFF8A9D08372323d5BAF5e8e52605AF983";
const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

type SwapQuote = {
  ok?: boolean; chainId?: number; direction?: string; amountIn?: string;
  amountOutFormatted?: string; amountOutMinimumFormatted?: string;
  expiresAt?: number; error?: string;
  approval?: { required: boolean; token: string | null; spender: string | null };
  execution?: { to: string; data: Hex; value: string };
};
type Asset = "ETH" | "OCH" | "USDG";
type Direction = "deposit" | "withdraw";
type Balances = {
  eoaEth: bigint; walletEth: bigint; eoaOch: bigint | null; walletOch: bigint | null;
  eoaUsdg: bigint | null; walletUsdg: bigint | null; usdgDecimals: number;
  decimals: number; symbol: string;
};

function display(value: bigint | null, decimals: number, precision = 3): string {
  if (value === null) return "—";
  // Display only. Never round the bigint used to sign a transfer.
  const scale = BigInt(10) ** BigInt(Math.max(0, decimals - precision));
  const rounded = decimals > precision ? (value + scale / BigInt(2)) / scale : value;
  const rendered = formatUnits(rounded, Math.min(decimals, precision));
  const [whole, fraction = ""] = rendered.split(".");
  return fraction ? `${whole}.${fraction.replace(/0+$/, "")}`.replace(/\.$/, "") : whole;
}
function errorText(value: unknown): string {
  if (value && typeof value === "object") {
    const e = value as { shortMessage?: string; reason?: string; message?: string };
    return e.shortMessage || e.reason || e.message || "Transaction failed";
  }
  return String(value);
}

function QuickSwapToHoodWallet({ onDone }: { onDone: () => Promise<void> | void }) {
  const { address, ensureRequiredNetwork, getWalletClient } = useWallet();
  const provider = useMemo(() => new JsonRpcProvider(siteConfig.rpcUrl, NETWORK_ID, { staticNetwork: true }), []);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const clearQuote = () => { setQuote(null); setError(""); setMessage(""); };
  async function getQuote() {
    if (!address) return;
    let units: bigint;
    try { units = parseEther(amount); if (units <= BigInt(0)) throw new Error(); }
    catch { setError("Enter a valid ETH amount."); return; }
    setBusy(true); setError(""); setHash("");
    try {
      const balance = await provider.getBalance(address);
      if (balance <= units + EOA_GAS_RESERVE) throw new Error("Leave ETH for transaction gas.");
      const response = await fetch("/api/och/swap", {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ direction: "ETH_TO_OCH", amount, recipient: address, slippageBps: 100 }),
      });
      const data = await response.json() as SwapQuote;
      if (!response.ok || !data.ok || !data.execution) throw new Error(data.error || "Quote unavailable.");
      if ((data.chainId !== undefined && data.chainId !== NETWORK_ID) || data.direction !== "ETH_TO_OCH") throw new Error("Unexpected quote network/direction.");
      if (data.amountIn !== units.toString() || BigInt(data.execution.value) !== units) throw new Error("Quote amount mismatch.");
      if (data.approval?.required) throw new Error("ETH input must not require token approval.");
      if (!isAddress(data.execution.to) || !/^0x[0-9a-fA-F]*$/.test(data.execution.data)) throw new Error("Invalid swap route.");
      setQuote(data);
    } catch (e) { setError(errorText(e)); setQuote(null); }
    finally { setBusy(false); }
  }
  async function execute() {
    if (!quote?.execution || !address) return;
    setBusy(true); setError(""); setMessage("Preparing swap...");
    try {
      if (quote.expiresAt && Date.now() / 1000 >= quote.expiresAt) throw new Error("Quote expired. Get a new quote.");
      await ensureRequiredNetwork();
      const client = await getWalletClient();
      if (!client.account || client.account.address.toLowerCase() !== address.toLowerCase()) throw new Error("Connected wallet changed.");
      const tx = quote.execution;
      const transactionHash = await client.sendTransaction({ chain: null, account: client.account, to: tx.to as Address, data: tx.data, value: BigInt(tx.value) });
      setHash(transactionHash); setMessage("Waiting for confirmation...");
      const receipt = await provider.waitForTransaction(transactionHash, 1);
      if (!receipt || receipt.status !== 1) throw new Error("Swap reverted.");
      setMessage("Swap confirmed. OCH arrived in your connected wallet. Use Deposit to move it into your Hoodie.");
      setAmount(""); setQuote(null);
      await onDone();
    } catch (e) { setError(errorText(e)); setMessage(""); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3" aria-label="Swap ETH to OCH">
    <p className="text-[10px] uppercase">ETH → OCH · RECEIVE IN YOUR WALLET</p>
    <input className="w-full border border-[#ccff00] bg-black p-3 text-sm outline-none" value={amount} onChange={e => { setAmount(e.target.value); clearQuote(); }} inputMode="decimal" placeholder="ETH amount" disabled={busy}/>
    {quote && <div className="border border-[#ccff00]/60 p-3 text-xs">You receive ~{quote.amountOutFormatted ?? "—"} OCH<br/>Minimum: {quote.amountOutMinimumFormatted ?? "—"} OCH · Slippage 1%</div>}
    <button type="button" className="w-full bg-[#ccff00] p-3 text-xs font-bold uppercase text-black disabled:opacity-40" disabled={busy || !amount.trim()} onClick={() => void (quote ? execute() : getQuote())}>{busy ? "PLEASE WAIT…" : quote ? "CONFIRM SWAP →" : "REVIEW SWAP →"}</button>
    {message && <p className="text-xs" role="status">{message}</p>}
    {error && <p className="text-xs" role="alert">{error}</p>}
    {hash && <a className="text-xs underline" href={`https://robin.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">VIEW TRANSACTION ↗</a>}
  </div>;
}

/** Reusable ETH/OCH funding controls for a directly owned, deployed HoodWallet. */
export default function HoodWalletFunds({
  tokenId, hoodWallet, active, onBalancesChanged,
}: {
  tokenId: string;
  hoodWallet: string;
  active: boolean;
  onBalancesChanged?: () => Promise<void> | void;
}) {
  const { address, ensureRequiredNetwork, getWalletClient } = useWallet();
  const provider = useMemo(() => new JsonRpcProvider(siteConfig.rpcUrl, NETWORK_ID, { staticNetwork: true }), []);
  const [showSwap, setShowSwap] = useState(false);
  const [asset, setAsset] = useState<Asset>("ETH");
  const [direction, setDirection] = useState<Direction>("deposit");
  const [amount, setAmount] = useState("");
  const ochAddress = DEFAULT_OCH_ADDRESS;
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  function choosePercentage(percent: number) {
    if (currentBalance === null) return;
    const spendable = asset === "ETH" && direction === "deposit"
      ? currentBalance > EOA_GAS_RESERVE ? currentBalance - EOA_GAS_RESERVE : BigInt(0)
      : currentBalance;
    const selected = percent === 100 ? spendable : spendable * BigInt(percent) / BigInt(100);
    // Percentage shortcuts use at most three decimals and round DOWN,
    // so a displayed amount can never exceed the available balance.
    const unit = BigInt(10) ** BigInt(Math.max(0, decimals - 3));
    const safeAmount = decimals > 3 ? (selected / unit) * unit : selected;
    setAmount(formatUnits(safeAmount, decimals));
    setError("");
  }
  const walletReady = Boolean(address && isAddress(hoodWallet) && tokenId && active);
  const ochValid = isAddress(ochAddress);
  const activeErc20 = asset === "USDG" ? USDG_ADDRESS : ochAddress;

  const refresh = useCallback(async () => {
    if (!walletReady || !address) { setBalances(null); return; }
    setLoading(true);
    try {
      const [eoaEth, walletEth] = await Promise.all([
        provider.getBalance(address), provider.getBalance(hoodWallet),
      ]);
      let eoaOch: bigint | null = null;
      let walletOch: bigint | null = null;
      let decimals = 18;
      let symbol = "OCH";
      if (ochValid) {
        const token = new Contract(ochAddress, ERC20_INTERFACE, provider);
        try {
          const [eoaResult, walletResult, decimalResult, symbolResult] = await Promise.all([
            token.balanceOf(address), token.balanceOf(hoodWallet), token.decimals(), token.symbol(),
          ]);
          eoaOch = BigInt(eoaResult);
          walletOch = BigInt(walletResult);
          decimals = Number(decimalResult);
          symbol = String(symbolResult);
          if (symbol.toUpperCase() !== "OCH") throw new Error("The entered token contract is not OCH.");
          if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Invalid ERC-20 decimals.");
        } catch (e) { throw new Error(`Unable to read OCH contract: ${errorText(e)}`); }
      }
      // Read the canonical Robinhood USDG ERC-20 independently of OCH.
      let eoaUsdg: bigint | null = null;
      let walletUsdg: bigint | null = null;
      let usdgDecimals = 6;
      try {
        const usdg = new Contract(USDG_ADDRESS, ERC20_INTERFACE, provider);
        const [ownerBalance, hoodieBalance, chainDecimals, symbolResult] = await Promise.all([
          usdg.balanceOf(address), usdg.balanceOf(hoodWallet), usdg.decimals(), usdg.symbol(),
        ]);
        if (String(symbolResult).toUpperCase() !== "USDG") throw new Error("Unexpected USDG contract");
        usdgDecimals = Number(chainDecimals);
        if (!Number.isInteger(usdgDecimals) || usdgDecimals < 0 || usdgDecimals > 36) throw new Error("Invalid USDG decimals");
        eoaUsdg = BigInt(ownerBalance);
        walletUsdg = BigInt(hoodieBalance);
      } catch { /* USDG read failing must not block ETH/OCH usage. */ }
      setBalances({ eoaEth, walletEth, eoaOch, walletOch, eoaUsdg, walletUsdg, usdgDecimals, decimals, symbol });
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [walletReady, address, provider, hoodWallet, ochAddress, ochValid]);

  useEffect(() => {
    let cancelled = false;
    const job = window.setTimeout(() => { if (!cancelled) void refresh(); }, 0);
    return () => { cancelled = true; window.clearTimeout(job); };
  }, [refresh]);

  const currentBalance = balances ? (asset === "ETH"
    ? direction === "deposit" ? balances.eoaEth : balances.walletEth
    : asset === "OCH" ? (direction === "deposit" ? balances.eoaOch : balances.walletOch)
    : (direction === "deposit" ? balances.eoaUsdg : balances.walletUsdg)) : null;
  const decimals = asset === "ETH" ? 18 : asset === "OCH" ? (balances?.decimals ?? 18) : (balances?.usdgDecimals ?? 6);
  let units: bigint | null = null;
  try { if (amount.trim() && Number(amount) > 0) units = parseUnits(amount.trim(), decimals); }
  catch { units = null; }
  const hasFunds = units !== null && currentBalance !== null && currentBalance >= units &&
    !(asset === "ETH" && direction === "deposit" && balances !== null && balances.eoaEth - units < EOA_GAS_RESERVE);
  const canSubmit = walletReady && balances !== null && units !== null && units > BigInt(0) &&
    hasFunds && !pending && !loading && (asset === "ETH" || (asset === "USDG" ? balances?.eoaUsdg !== null : ochValid));

  async function submit() {
    if (!canSubmit || !address || !balances || units === null) return;
    setPending(true); setError(""); setStatus("Checking transaction..."); setTxHash("");
    try {
      await ensureRequiredNetwork();
      const client = await getWalletClient();
      if (!client.account || client.account.address.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Wallet account changed. Reconnect and retry.");
      }
      // Refresh balances and permissions immediately before transaction.
      const account = client.account;
      const currentBalanceNow = asset === "ETH" ? await provider.getBalance(direction === "deposit" ? address : hoodWallet) :
        BigInt(await new Contract(activeErc20, ERC20_INTERFACE, provider).balanceOf(direction === "deposit" ? address : hoodWallet));
      if (currentBalanceNow < units) throw new Error("Insufficient balance. Refresh and try again.");
      let hash: Hex;
      if (asset === "ETH" && direction === "deposit") {
        if (currentBalanceNow - units < EOA_GAS_RESERVE) throw new Error("Leave some ETH in your connected wallet for transaction gas.");
        setStatus("Confirm ETH deposit to your HoodWallet...");
        hash = await client.sendTransaction({ chain: null, account, to: hoodWallet as Address, value: units });
      } else {
        let target: Address;
        let value = BigInt(0);
        let data: Hex;
        if (asset === "ETH") {
          target = address as Address;
          value = units;
          data = ETH_ZERO_DATA;
        } else {
          target = activeErc20 as Address;
          data = encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [direction === "deposit" ? hoodWallet as Address : address as Address, units] });
        }
        if (direction === "deposit") {
          setStatus(`Confirm ${asset} transfer to your HoodWallet...`);
          hash = await client.writeContract({ chain: null, account, address: target, abi: ERC20_ABI, functionName: "transfer", args: [hoodWallet as Address, units] });
        } else {
          // Only the current owner can execute, as enforced by HoodOS.canExecute.
          const callData = encodeFunctionData({ abi: EXECUTE_ABI, functionName: "execute", args: [target, value, data, 0] });
          await provider.call({ to: hoodWallet, from: address, data: callData });
          setStatus(`Confirm ${asset} withdrawal to your connected wallet...`);
          hash = await client.writeContract({ chain: null, account, address: hoodWallet as Address, abi: EXECUTE_ABI, functionName: "execute", args: [target, value, data, 0] });
        }
      }
      setTxHash(hash);
      setStatus("Transaction sent. Waiting for confirmation...");
      const receipt = await provider.waitForTransaction(hash, 1);
      if (!receipt || receipt.status !== 1) throw new Error("Transaction was not confirmed successfully.");
      setStatus(`${asset} ${direction} confirmed.`);
      setAmount("");
      await refresh();
      if (onBalancesChanged) await onBalancesChanged();
    } catch (e) { setError(errorText(e)); setStatus(""); }
    finally { setPending(false); }
  }

  const actionButton = "border border-[#ccff00] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] disabled:opacity-40";
  return (
    <section aria-label="HoodWallet funds">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase">ETH / OCH / USDG</h2>
          <button type="button" className={actionButton} disabled={loading || pending} onClick={() => void refresh()}>{loading ? "LOADING..." : "REFRESH ↻"}</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="min-w-0 border border-[#ccff00] p-3">
            <p className="text-[9px]">YOUR WALLET</p>
            <p className="mt-2">{display(balances?.eoaEth ?? null, 18)} ETH</p>
            <p>{display(balances?.eoaOch ?? null, balances?.decimals ?? 18)} OCH</p>
            <p>{display(balances?.eoaUsdg ?? null, balances?.usdgDecimals ?? 6)} USDG</p>
          </div>
          <div className="min-w-0 border border-[#ccff00] p-3">
            <p className="text-[9px]">HOODIE #{tokenId}</p>
            <p className="mt-2">{display(balances?.walletEth ?? null, 18)} ETH</p>
            <p>{display(balances?.walletOch ?? null, balances?.decimals ?? 18)} OCH</p>
            <p>{display(balances?.walletUsdg ?? null, balances?.usdgDecimals ?? 6)} USDG</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${actionButton} ${showSwap ? "bg-[#ccff00] text-black" : ""}`} disabled={pending} onClick={() => { setShowSwap(v => !v); setError(""); }}>SWAP ETH → OCH</button>
        </div>
        {showSwap ? <QuickSwapToHoodWallet onDone={async () => { await refresh(); if (onBalancesChanged) await onBalancesChanged(); }}/>: <>
        <div className="flex flex-wrap items-center gap-2">
          {(["ETH", "OCH", "USDG"] as const).map(next => <button type="button" key={next} disabled={pending} onClick={() => { setAsset(next); setAmount(""); setError(""); }} className={`${actionButton} ${asset === next ? "bg-[#ccff00] text-black" : ""}`}>{next}</button>)}
          <span className="mx-1">/</span>
          {(["deposit", "withdraw"] as const).map(next => <button type="button" key={next} disabled={pending} onClick={() => { setDirection(next); setAmount(""); setError(""); }} className={`${actionButton} ${direction === next ? "bg-[#ccff00] text-black" : ""}`}>{next.toUpperCase()}</button>)}
        </div>
        <div>
          <label htmlFor="hood-funds-amount" className="text-[10px] uppercase">{direction === "deposit" ? "SEND" : "TAKE OUT"} {asset}</label>
          <input id="hood-funds-amount" className="mt-2 w-full border border-[#ccff00] bg-black p-3 text-sm outline-none placeholder:text-[#ccff00]/50" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0" disabled={pending}/>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[10, 25, 50, 100].map(percent => <button key={percent} type="button" disabled={currentBalance === null || pending} onClick={() => choosePercentage(percent)} className={`${actionButton} px-1 py-2`}>{percent === 100 ? "MAX" : `${percent}%`}</button>)}
          </div>
          {units !== null && !hasFunds && <p className="mt-2 text-xs">Insufficient balance or ETH gas reserve.</p>}
        </div>
        <button type="button" disabled={!canSubmit} className="w-full bg-[#ccff00] p-3 text-xs font-bold uppercase text-black disabled:opacity-40" onClick={() => void submit()}>{pending ? "CONFIRMING..." : `${direction.toUpperCase()} ${asset} →`}</button>
        {status && <p className="text-xs" role="status">{status}</p>}
        {txHash && <a className="block break-all text-xs underline" href={`https://robin.etherscan.io/tx/${txHash}`} rel="noreferrer" target="_blank">VIEW TRANSACTION ↗</a>}
        {error && <p className="border border-[#ccff00] p-3 text-xs" role="alert">{error}</p>}
        </>}
      </div>
    </section>
  );
}
