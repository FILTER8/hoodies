import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { contractExplorerUrl, shortAddress, siteConfig } from "../../lib/config";

// Exact contract register carried over from the original homepage.
const contracts = [
  {
    label: "Collection",
    address: siteConfig.collectionAddress,
  },
  {
    label: "Renderer",
    address: siteConfig.rendererAddress,
  },
  {
    label: "Pixel Data",
    address: siteConfig.pixelDataAddress,
  },
  {
    label: "Hood Talk",
    address: siteConfig.hoodTalkRegistryAddress,
  },
  {
    label: "Journey Registry",
    address: "0x93513A0e4d0E016ccf296C4c2888b59c06708ea7",
  },
  {
    label: "HoodOS",
    address: siteConfig.hoodOSAddress,
  },
  {
    label: "HoodWallet",
    address: siteConfig.hoodWalletAddress,
  },
  {
    label: "Ping",
    address: siteConfig.pingAddress,
  },
  {
    label: "Ping Rewards",
    address: siteConfig.pingRewardVaultAddress,
  },
  {
    label: "Hood Delegation",
    address: siteConfig.hoodDelegationAddress,
  },
  {
    label: "Treasury Vault",
    address: siteConfig.treasuryVaultAddress,
  },
  {
    label: "$OCH",
    address: siteConfig.ochAddress,
  },
  {
    label: "Allocation Vault",
    address: siteConfig.ochAllocationVaultAddress,
  },
  {
    label: "Team Vesting",
    address: siteConfig.ochTeamVestingAddress,
  },
  {
    label: "Liquidity Locker",
    address: siteConfig.ochLiquidityLockerAddress,
  },
];

export default function ContractsPage() {
  return (
    <main className="min-h-screen bg-black text-[#ccff00] selection:bg-[#ccff00] selection:text-black">
      <SiteHeader />
      <section className="mx-auto max-w-[1440px] px-6 pb-20 pt-32 md:pb-28 md:pt-40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#ccff00] pb-5 text-[10px] uppercase tracking-[0.17em]">
          <span>OnChainHoodies / Infrastructure</span>
          <span>{siteConfig.chainName}</span>
        </div>

        <div className="grid gap-8 py-12 lg:grid-cols-[1fr_0.65fr] lg:items-end">
          <div>
            <p className="text-[10px] uppercase tracking-[0.19em] opacity-60">Open. Verifiable. On-chain.</p>
            <h1 className="mt-5 text-[clamp(3.5rem,10vw,8rem)] uppercase leading-[0.88] tracking-[-0.075em]">
              THE CONTRACTS.
            </h1>
          </div>
          <p className="max-w-lg text-base leading-relaxed opacity-75 md:text-lg">
            The collection, artwork, HoodWallet, HoodOS and the Hood economy are built on public contracts.
            Check addresses and inspect the code yourself before interacting.
          </p>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em]">
          <span>Official contract directory</span>
          <span>{contracts.length} contracts</span>
        </div>

        <div className="border-l-2 border-t-2 border-[#ccff00]">
          {contracts.map((contract, index) => {
            const href = contractExplorerUrl(contract.address);
            const available = Boolean(contract.address) && href !== "#";
            return (
              <div key={contract.label} className="grid gap-3 border-b-2 border-r-2 border-[#ccff00] p-4 md:grid-cols-[48px_190px_1fr_auto] md:items-center md:gap-5 md:p-5">
                <span className="text-[9px] opacity-40">{String(index + 1).padStart(2, "0")}</span>
                <h2 className="text-sm uppercase tracking-[0.09em] md:text-base">{contract.label}</h2>
                <code className="select-text cursor-text break-all text-xs opacity-75 selection:bg-[#ccff00] selection:text-black md:text-sm">{contract.address || "Coming soon"}</code>
                {available ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit border border-[#ccff00] bg-black px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-[#ccff00] transition-colors hover:!bg-[#ccff00] hover:!text-black focus-visible:!bg-[#ccff00] focus-visible:!text-black">
                    Explorer ↗
                  </a>
                ) : (
                  <span className="text-xs opacity-45">{shortAddress(contract.address)}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-5 border-t border-[#ccff00] pt-6 text-xs">
          <Link href="/" className="inline-flex border border-[#ccff00] bg-black px-5 py-3 uppercase tracking-[0.12em] text-[#ccff00] transition-colors hover:!bg-[#ccff00] hover:!text-black focus-visible:!bg-[#ccff00] focus-visible:!text-black">← Back to the Hood</Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
