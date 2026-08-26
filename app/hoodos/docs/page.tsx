"use client";

import { useEffect, useState } from "react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";

const TESTNET = {
  chainId: "46630",
  hoodOS: "0x0D6E993457Cdb75C9dBdD2cFf741Fa5Aad180239",
  hoodWallet: "0x01d4ac15a2fc10b57B7B2562f88D856eF959D39e",
  hoodDelegation: "0xb10DE40a15Eb9dDF915ae7aa75d79f9fE117cFcA",
  hoodies: "0xCBDEE2b95C4F02Bf05A1E3E0dcec79495Eb0e83E",
  registry: "0x000000006551c19487814612e58FE06813775758",
  och: "0x9FF40A84D9619fE41C0357762D609Bb8849d6C01",
};

const BUILDER_X = "https://x.com/0xfilter8";

const chapters = [
  ["overview", "00", "Overview"],
  ["contracts", "01", "Testnet"],
  ["test-assets", "02", "Get Test Assets"],
  ["architecture", "03", "Architecture"],
  ["discover", "04", "Discover"],
  ["counterfactual", "05", "Counterfactual"],
  ["create-wallet", "06", "Create Wallet"],
  ["hoodie-state", "07", "Hoodie State"],
  ["activation", "08", "Activation"],
  ["ownership-transfer", "09", "Ownership Transfer"],
  ["execute", "10", "Execute"],
  ["authorization", "11", "Authorization"],
  ["can-execute", "12", "canExecute"],
  ["assets", "13", "Assets"],
  ["games", "14", "Games"],
  ["delegation", "15", "Delegation"],
  ["capabilities", "16", "Capabilities"],
  ["exact", "17", "Exact"],
  ["selector", "18", "Selector"],
  ["target", "19", "Target"],
  ["open", "20", "Open"],
  ["limits", "21", "Value Limits"],
  ["expiration", "22", "Expiration"],
  ["session-keys", "23", "Session Keys"],
  ["agents", "24", "Agents"],
  ["revocation", "25", "Revocation"],
  ["read-permissions", "26", "Read Permissions"],
  ["ownership", "27", "Ownership"],
  ["signatures", "28", "ERC-1271"],
  ["state-events", "29", "State + Events"],
  ["rules", "30", "Security Model"],
  ["integration", "31", "Integration Flow"],
  ["identity", "32", "Hoodie Identity"],
  ["quick-start", "33", "5-Min Quick Start"],
  ["build-agent", "34", "Build an Agent"],
  ["ideas", "35", "Ideas"],
  ["start", "36", "Start Building"],
];

const hoodOSAbi = [
  "function walletOf(uint256 tokenId) view returns (address)",
  "function createWallet(uint256 tokenId) returns (address)",
  "function createWallets(uint256[] tokenIds) returns (address[])",
  "function isActive(uint256 tokenId) view returns (bool)",
  "function activationOf(uint256 tokenId) view returns (address activationOwner,uint64 activatedAt,bool active)",
  "function hoodInfo(uint256 tokenId) view returns (tuple(uint256 tokenId,address owner,address wallet,bool walletDeployed,bool active,address activationOwner,uint64 activatedAt,uint256 walletState,uint256 nativeBalance,uint256 paymentTokenBalance))",
  "function canExecute(address account,uint256 tokenId,address caller,address target,uint256 value,bytes data,uint8 operation) view returns (bool)",
];

const hoodWalletAbi = [
  "function execute(address target,uint256 value,bytes data,uint8 operation) payable returns (bytes)",
  "function owner() view returns (address)",
  "function state() view returns (uint256)",
  "function isValidSignature(bytes32 hash,bytes signature) view returns (bytes4)",
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 border-l border-current px-3 py-3 text-[8px] uppercase tracking-[0.14em]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="mt-6 overflow-hidden border border-current">
      <div className="flex items-stretch">
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre p-4 text-[10px] leading-relaxed md:text-xs">
          <code>{children}</code>
        </pre>
        <CopyButton value={children} />
      </div>
    </div>
  );
}

function AddressRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-black last:border-b-0 md:grid md:grid-cols-[190px_1fr_auto] md:items-center">
      <p className="p-4 text-[9px] uppercase tracking-[0.15em] opacity-60">
        {label}
      </p>
      <code className="block break-all border-t border-black p-4 text-[10px] md:border-l md:border-t-0">
        {value}
      </code>
      <div className="border-t border-black md:border-l md:border-t-0">
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function DocSection({
  id,
  eyebrow,
  title,
  children,
  dark = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 border-b-2 px-6 py-20 md:px-10 md:py-24 ${
        dark
          ? "border-[#ccff00] bg-black text-[#ccff00]"
          : "border-black bg-[#ccff00] text-black"
      }`}
    >
      <div className="mx-auto max-w-[1050px]">
        <div className="flex items-center justify-between gap-6 border-b border-current pb-3 text-[9px] uppercase tracking-[0.17em]">
          <p>{eyebrow}</p>
          <a href={`#${id}`} className="opacity-55 hover:opacity-100">
            #{id}
          </a>
        </div>
        <h2 className="mt-9 text-[clamp(2.5rem,5vw,4.75rem)] leading-[0.9] tracking-[-0.055em]">
          {title}
        </h2>
        <div className="mt-9 max-w-4xl text-base leading-relaxed md:text-lg">
          {children}
        </div>
      </div>
    </section>
  );
}

export default function HoodOSDocsPage() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.15, 0.5] },
    );

    chapters.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const resolveExample = `import { ethers } from "ethers";

const hoodOS = new ethers.Contract(
  "${TESTNET.hoodOS}",
  ${JSON.stringify(hoodOSAbi, null, 2)},
  provider
);

const tokenId = 42n;
const hoodWallet = await hoodOS.walletOf(tokenId);
const active = await hoodOS.isActive(tokenId);

console.log({ hoodWallet, active });`;

  const executeExample = `const wallet = new ethers.Contract(
  hoodWalletAddress,
  ${JSON.stringify(hoodWalletAbi.slice(0, 1), null, 2)},
  signer
);

const game = new ethers.Interface([
  "function enterDungeon(uint256 dungeonId)"
]);

const data = game.encodeFunctionData("enterDungeon", [7]);

await wallet.execute(
  GAME_CONTRACT,
  0,
  data,
  0 // CALL
);`;

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section
        id="overview"
        className="scroll-mt-28 px-6 pb-20 pt-32 md:pb-28 md:pt-40"
      >
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>Builders / HoodOS</p>
            <p>Robinhood Chain Testnet · 46630</p>
          </div>

          <div className="mt-14 grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.22em]">
                Programmable Hoodies · Open infrastructure
              </p>
              <h1 className="mt-6 text-[clamp(3.25rem,7vw,7rem)] leading-[0.86] tracking-[-0.07em]">
                BUILD WITH
                <br />
                THE HOOD.
              </h1>
              <p className="mt-9 max-w-3xl text-lg leading-relaxed md:text-2xl">
                Every OnChainHoodie has a deterministic ERC-6551 account.
                Discover it through HoodOS, execute through HoodWallet and give
                games or agents controlled access through HoodDelegation.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#start" className="pixel-cta">
                  Start building
                </a>
                <a
                  href={BUILDER_X}
                  target="_blank"
                  rel="noreferrer"
                  className="pixel-cta pixel-cta-dark"
                >
                  Get test assets ↗
                </a>
              </div>
            </div>

            <div className="border-2 border-black">
              <div className="border-b-2 border-black bg-black p-5 text-[#ccff00]">
                <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                  Core flow
                </p>
                <p className="mt-4 text-3xl leading-tight">
                  HoodOS → HoodWallet → HoodDelegation
                </p>
              </div>
              <div className="grid grid-cols-2 text-[9px] uppercase tracking-[0.14em]">
                {[
                  ["Network", "Testnet"],
                  ["Chain", "46630"],
                  ["Account", "ERC-6551"],
                  ["Execution", "CALL"],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={`p-4 ${
                      index % 2 === 0 ? "border-r border-black" : ""
                    } ${index < 2 ? "border-b border-black" : ""}`}
                  >
                    {label}
                    <span className="mt-2 block text-base">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden border-r-2 border-t-2 border-black bg-[#ccff00] lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto p-5">
            <p className="mb-5 text-[8px] uppercase tracking-[0.18em] opacity-50">
              Chapters
            </p>
            {chapters.slice(1).map(([id, number, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={`grid grid-cols-[30px_1fr] border-t border-black py-3 text-[9px] uppercase tracking-[0.12em] transition-opacity ${
                  active === id ? "opacity-100" : "opacity-45 hover:opacity-100"
                }`}
              >
                <span>{number}</span>
                <span>{label}</span>
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 border-t-2 border-black">
          <DocSection id="contracts" eyebrow="01 / Testnet" title="Contracts.">
            <p>
              These are the current HoodOS testnet contracts. Build against
              these addresses while the system is in public testing.
            </p>
            <div className="mt-8 border-2 border-black">
              <AddressRow label="HoodOS" value={TESTNET.hoodOS} />
              <AddressRow
                label="HoodWallet implementation"
                value={TESTNET.hoodWallet}
              />
              <AddressRow
                label="HoodDelegation"
                value={TESTNET.hoodDelegation}
              />
              <AddressRow label="OnChainHoodies" value={TESTNET.hoodies} />
              <AddressRow label="ERC-6551 Registry" value={TESTNET.registry} />
              <AddressRow label="$OCH" value={TESTNET.och} />
              <AddressRow label="Chain ID" value={TESTNET.chainId} />
            </div>
          </DocSection>

          <DocSection
            id="architecture"
            eyebrow="03 / Architecture"
            title="Three layers."
            dark
          >
            <div className="grid gap-3 md:grid-cols-3">
              {[
                [
                  "HoodOS",
                  "Discovery + policy",
                  "Resolve the deterministic wallet, read activation and decide whether an execution is authorized.",
                ],
                [
                  "HoodWallet",
                  "Account + execution",
                  "The Hoodie’s ERC-6551 account. It owns assets and makes calls to games, protocols and other contracts.",
                ],
                [
                  "HoodDelegation",
                  "Controlled access",
                  "Owners can grant narrow, expiring capabilities to agents, games, session wallets and automation.",
                ],
              ].map(([title, label, copy]) => (
                <div
                  key={title}
                  className="border-2 border-[#ccff00] p-5 md:p-6"
                >
                  <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">
                    {label}
                  </p>
                  <h3 className="mt-5 text-3xl">{title}</h3>
                  <p className="mt-5 text-sm leading-relaxed opacity-75">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
            <CodeBlock>{`OnChainHoodie ERC-721
        │
        ▼
      HoodOS
  discovery + policy
        │
        ▼
    HoodWallet
   owns + executes
        │
        ▼
Game / Agent / DeFi / NFT / App`}</CodeBlock>
          </DocSection>

          <DocSection id="discover" eyebrow="04 / Discover" title="Find the wallet.">
            <p>
              Start with <code>walletOf(tokenId)</code>. Builders do not need
              to manually derive ERC-6551 addresses. HoodOS returns the
              canonical deterministic account for the Hoodie.
            </p>
            <CodeBlock>{resolveExample}</CodeBlock>
            <p className="mt-7">
              The address is deterministic. The account can be known before it
              is deployed. Use <code>provider.getCode(wallet)</code> if your UI
              needs to distinguish a deployed account from a counterfactual
              address.
            </p>
          </DocSection>

          <DocSection
            id="activation"
            eyebrow="08 / Activation"
            title="Active means executable."
            dark
          >
            <p>
              A HoodWallet can receive assets independently, but normal outgoing
              execution is controlled by HoodOS. Use{" "}
              <code>isActive(tokenId)</code> or{" "}
              <code>activationOf(tokenId)</code> before presenting an action.
            </p>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {[
                ["01", "Owner activates", "The current Hoodie owner activates the account."],
                ["02", "Wallet executes", "Owner or an authorized delegate can use allowed execution paths."],
                ["03", "Hoodie transfers", "The old activation no longer matches the new NFT owner."],
              ].map(([n, title, copy]) => (
                <div key={n} className="border border-[#ccff00] p-5">
                  <p className="text-[9px] opacity-55">{n}</p>
                  <p className="mt-4 text-xl">{title}</p>
                  <p className="mt-3 text-sm opacity-70">{copy}</p>
                </div>
              ))}
            </div>
          </DocSection>

          <DocSection id="execute" eyebrow="10 / Execute" title="The Hoodie acts.">
            <p>
              Applications interact through <code>HoodWallet.execute()</code>.
              For the current implementation, use operation <code>0</code> for
              CALL. HoodWallet asks HoodOS whether the caller and action are
              authorized before forwarding the call.
            </p>
            <CodeBlock>{`function execute(
  address target,
  uint256 value,
  bytes calldata data,
  uint8 operation
) payable returns (bytes memory result)`}</CodeBlock>
            <CodeBlock>{executeExample}</CodeBlock>
            <div className="mt-8 border-2 border-black p-5">
              <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">
                Important
              </p>
              <p className="mt-3 text-xl">
                Inside your game or protocol, <code>msg.sender</code> is the
                HoodWallet — the Hoodie account — not the holder&apos;s EOA.
              </p>
            </div>
          </DocSection>

          <DocSection
            id="games"
            eyebrow="14 / Games"
            title="Make the Hoodie the player."
            dark
          >
            <p>
              Games can use the HoodWallet address as persistent player
              identity. Inventory, XP, achievements and tokens can live with
              the Hoodie rather than only with the holder&apos;s normal wallet.
            </p>
            <CodeBlock>{`mapping(address hoodWallet => uint256 xp) public xp;

function completeQuest() external {
    xp[msg.sender] += 100;
}`}</CodeBlock>
            <p className="mt-7">
              A Hoodie can own ERC-20s, ERC-721s, ERC-1155 items and native
              assets. This creates portable inventories and on-chain game state
              that can travel with the NFT.
            </p>
          </DocSection>

          <DocSection id="delegation" eyebrow="15 / Delegation" title="Give access. Not control.">
            <p>
              HoodDelegation lets the current Hoodie owner authorize another
              address without transferring the Hoodie. Use the narrowest
              capability your application needs.
            </p>
            <div className="mt-8 grid border-l-2 border-t-2 border-black md:grid-cols-2">
              {[
                ["Exact", "One target + exact calldata.", "Best for a single pre-approved action."],
                ["Selector", "One function on one target.", "Great default for games and agents."],
                ["Target", "Any function on one target.", "Useful when the target contract is the security boundary."],
                ["Open", "Any target + any calldata.", "Very powerful. Request only when truly necessary."],
              ].map(([title, scope, note]) => (
                <div
                  key={title}
                  className="border-b-2 border-r-2 border-black p-5 md:p-6"
                >
                  <h3 className="text-3xl">{title}</h3>
                  <p className="mt-4">{scope}</p>
                  <p className="mt-3 text-sm opacity-60">{note}</p>
                </div>
              ))}
            </div>
            <p className="mt-8">
              Capabilities can include a native-value limit and expiration.
              Ownership is checked at authorization time, so permissions granted
              by a previous owner become unusable after the Hoodie transfers.
            </p>
            <CodeBlock>{`Do you know the complete calldata?
YES → EXACT
NO  ↓

Need only one function?
YES → SELECTOR
NO  ↓

Need many functions on one trusted contract?
YES → TARGET
NO  ↓

Need unrestricted delegated execution?
YES → OPEN`}</CodeBlock>
            <p className="mt-7">
              Permissions are evaluated against the current ERC-721 owner, so
              old-owner capabilities become unusable automatically after a
              Hoodie transfer.
            </p>
          </DocSection>

          <DocSection
            id="agents"
            eyebrow="24 / Agents"
            title="Agent-ready permissions."
            dark
          >
            <p>
              A delegate calls the HoodWallet. HoodDelegation does not execute
              the action itself — it is the permission layer HoodOS consults.
            </p>
            <CodeBlock>{`Hoodie Owner
     │ grant capability
     ▼
HoodDelegation

Agent
     │ HoodWallet.execute(...)
     ▼
HoodWallet
     │ canExecute(...)
     ▼
HoodOS
     │ checks delegation
     ▼
HoodDelegation
     │ allowed
     ▼
Game / Protocol`}</CodeBlock>
            <p className="mt-7">
              For a game agent, a strong default is a selector capability with
              <code> maxNativeValue = 0</code> and a short expiry. That gives
              the agent enough authority to play without giving it unrestricted
              wallet control.
            </p>
            <CodeBlock>{`Example agent permission

Hoodie: #42
Delegate: Agent wallet
Target: Reward contract
Selector: claimReward(uint256)
maxNativeValue: 0
expiresAt: 24 hours`}</CodeBlock>
            <p className="mt-7">
              The delegate calls the HoodWallet. HoodDelegation itself is the
              permission registry; it does not execute the game or protocol
              action.
            </p>
          </DocSection>

          <DocSection id="signatures" eyebrow="28 / ERC-1271" title="Smart-account signatures.">
            <p>
              HoodWallet supports ERC-1271 contract signatures. Signature
              authority resolves to the current Hoodie owner. Delegated
              execution does not automatically grant ERC-1271 signing
              authority.
            </p>
            <CodeBlock>{`function isValidSignature(
  bytes32 hash,
  bytes memory signature
) view returns (bytes4)`}</CodeBlock>
            <p className="mt-7">
              The account also exposes <code>state()</code>, which increments
              after successful executions and can help indexers or applications
              track account activity.
            </p>
          </DocSection>

          <DocSection
            id="rules"
            eyebrow="30 / Security Model"
            title="Do not assume."
            dark
          >
            <div className="grid gap-2 md:grid-cols-2">
              {[
                "HoodWallet address ≠ owner address.",
                "Original owner ≠ current owner.",
                "Wallet deployed ≠ wallet active.",
                "Delegate ≠ ERC-1271 signer.",
                "Assets stay with the HoodWallet after NFT transfer.",
                "Old-owner delegation does not survive ownership change.",
              ].map((rule) => (
                <div
                  key={rule}
                  className="border border-[#ccff00] p-4 text-sm"
                >
                  {rule}
                </div>
              ))}
            </div>
          </DocSection>


          <DocSection
            id="test-assets"
            eyebrow="02 / Get Test Assets"
            title="Need a Hoodie + $OCH?"
            dark
          >
            <p>
              To properly test HoodOS you need access to a Robinhood Chain
              testnet Hoodie and testnet $OCH. Contact Filter8 on X and tell us
              what you are building. We can provide the test assets needed to
              work against the live testnet contracts.
            </p>
            <div className="mt-8 border border-[#ccff00] p-5 md:flex md:items-center md:justify-between md:gap-8">
              <div>
                <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">
                  Builder contact
                </p>
                <p className="mt-3 text-2xl">@0xfilter8</p>
              </div>
              <a
                href={BUILDER_X}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-block border border-[#ccff00] px-5 py-4 text-[9px] uppercase tracking-[0.14em] md:mt-0"
              >
                Contact on X ↗
              </a>
            </div>
          </DocSection>

          <DocSection
            id="counterfactual"
            eyebrow="05 / Counterfactual"
            title="Known before deployment."
          >
            <p>
              HoodWallet addresses are deterministic. That means HoodOS can
              resolve the canonical wallet address even before the ERC-6551
              account has deployed bytecode.
            </p>
            <CodeBlock>{`const wallet = await hoodOS.walletOf(tokenId);
const code = await provider.getCode(wallet);

const deployed = code !== "0x";`}</CodeBlock>
            <p className="mt-7">
              Keep these states separate in your UI: wallet known, wallet
              deployed and wallet active are three different things.
            </p>
          </DocSection>

          <DocSection
            id="create-wallet"
            eyebrow="06 / Create Wallet"
            title="Deploy the canonical account."
            dark
          >
            <p>
              Anyone can deploy the canonical ERC-6551 account for an existing
              Hoodie. Calling <code>createWallet()</code> does not grant the
              caller control over that Hoodie.
            </p>
            <CodeBlock>{`function createWallet(
  uint256 tokenId
) returns (address wallet)

function createWallets(
  uint256[] calldata tokenIds
) returns (address[] memory wallets)`}</CodeBlock>
            <p className="mt-7">
              Batch creation is useful for indexers, games, dashboards and
              tooling preparing multiple Hoodie accounts.
            </p>
          </DocSection>

          <DocSection
            id="hoodie-state"
            eyebrow="07 / Hoodie State"
            title="Read the whole account."
          >
            <p>
              HoodOS exposes a consolidated read layer through{" "}
              <code>hoodInfo(tokenId)</code> and{" "}
              <code>hoodInfoBatch(tokenIds)</code>.
            </p>
            <CodeBlock>{`HoodInfo
├── tokenId
├── owner
├── wallet
├── walletDeployed
├── active
├── activationOwner
├── activatedAt
├── walletState
├── nativeBalance
└── paymentTokenBalance`}</CodeBlock>
            <p className="mt-7">
              This is a strong starting point for dashboards, games, agents,
              explorers, inventories, leaderboards and reward systems.
            </p>
          </DocSection>

          <DocSection
            id="ownership-transfer"
            eyebrow="09 / Ownership Transfer"
            title="The account travels with the Hoodie."
          >
            <p>
              Transferring the Hoodie does not create a new HoodWallet. The
              deterministic account and everything it owns remain associated
              with the Hoodie.
            </p>
            <CodeBlock>{`Hoodie #42
└── SAME HoodWallet
    ├── ETH
    ├── OCH
    ├── Sword NFT
    └── Achievement NFT

Alice owns #42
        ↓ transfer
Bob owns #42

The HoodWallet and its assets remain the same.`}</CodeBlock>
            <p className="mt-7">
              The old activation and old-owner delegation no longer qualify
              after ownership changes, but the account identity and inventory
              remain with the Hoodie.
            </p>
          </DocSection>

          <DocSection
            id="authorization"
            eyebrow="11 / Authorization"
            title="Who may execute?"
            dark
          >
            <p>
              Before a HoodWallet forwards a call, HoodOS evaluates whether the
              proposed action is authorized.
            </p>
            <CodeBlock>{`1. HoodOS is operational
2. Operation is supported
3. Account is the canonical HoodWallet
4. Hoodie is currently active
5. Current ERC-721 owner resolves
6. Current owner may execute directly
7. Otherwise HoodDelegation must authorize the caller`}</CodeBlock>
            <p className="mt-7">
              Knowing the account address or sending assets to it never grants
              execution authority. Authority derives from current Hoodie
              ownership or explicit delegation by the current owner.
            </p>
          </DocSection>

          <DocSection
            id="can-execute"
            eyebrow="12 / canExecute"
            title="Preview authorization."
          >
            <p>
              Applications can simulate whether a proposed action is currently
              allowed before submitting it.
            </p>
            <CodeBlock>{`canExecute(
  address account,
  uint256 tokenId,
  address caller,
  address target,
  uint256 value,
  bytes calldata data,
  uint8 operation
)`}</CodeBlock>
            <p className="mt-7">
              This is useful for transaction previews, agent simulation,
              disabled UI states, session validation and permission debugging.
              The HoodWallet performs the authoritative check again during
              execution.
            </p>
          </DocSection>

          <DocSection
            id="assets"
            eyebrow="13 / Assets"
            title="The Hoodie can own."
            dark
          >
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["Native", "Native currency can be sent directly to the HoodWallet."],
                ["ERC-20", "OCH, game tokens and other fungible assets can belong directly to the Hoodie account."],
                ["ERC-721", "HoodWallet can safely receive NFTs such as equipment or achievements."],
                ["ERC-1155", "Multi-token inventories work well for consumables, resources and game items."],
              ].map(([title, copy]) => (
                <div key={title} className="border border-[#ccff00] p-5">
                  <h3 className="text-2xl">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed opacity-70">{copy}</p>
                </div>
              ))}
            </div>
            <CodeBlock>{`HoodWallet
├── 5,000 OCH
├── 200 GAME
├── Sword #18
├── Achievement #4
├── Potion × 5
└── Crystal × 1`}</CodeBlock>
          </DocSection>

          <DocSection
            id="capabilities"
            eyebrow="16 / Capabilities"
            title="Narrow by default."
          >
            <p>
              HoodDelegation supports four levels of delegated capability. Use
              the narrowest level that solves the application problem.
            </p>
            <CodeBlock>{`EXACT
  ↓
SELECTOR
  ↓
TARGET
  ↓
OPEN`}</CodeBlock>
            <p className="mt-7">
              Exact is the narrowest. Open is the broadest and should be
              requested only when truly necessary.
            </p>
          </DocSection>

          <DocSection
            id="exact"
            eyebrow="17 / Exact"
            title="One exact action."
            dark
          >
            <CodeBlock>{`grantExactCapability(
  uint256 tokenId,
  address delegate,
  address target,
  bytes calldata data,
  uint256 maxNativeValue,
  uint64 expiresAt
)`}</CodeBlock>
            <p className="mt-7">
              Exact capability matches the target and complete calldata. A
              delegate allowed to call <code>claimReward(42)</code> cannot use
              that permission for <code>claimReward(43)</code>.
            </p>
          </DocSection>

          <DocSection
            id="selector"
            eyebrow="18 / Selector"
            title="One function."
          >
            <CodeBlock>{`grantSelectorCapability(
  uint256 tokenId,
  address delegate,
  address target,
  bytes4 selector,
  uint256 maxNativeValue,
  uint64 expiresAt
)`}</CodeBlock>
            <p className="mt-7">
              A selector capability authorizes one function on one contract
              while allowing the delegate to choose its arguments. This is a
              strong default for games and agents.
            </p>
            <CodeBlock>{`Allowed:
attack(1)
attack(7)
attack(500)

Not allowed:
withdraw(...)
transfer(...)`}</CodeBlock>
          </DocSection>

          <DocSection
            id="target"
            eyebrow="19 / Target"
            title="One trusted contract."
            dark
          >
            <CodeBlock>{`grantTargetCapability(
  uint256 tokenId,
  address delegate,
  address target,
  uint256 maxNativeValue,
  uint64 expiresAt
)`}</CodeBlock>
            <p className="mt-7">
              Target capability allows any function on one contract. Use this
              when the target contract itself forms the security boundary and
              the application needs multiple functions.
            </p>
          </DocSection>

          <DocSection
            id="open"
            eyebrow="20 / Open"
            title="Broad execution."
          >
            <CodeBlock>{`grantOpenCapability(
  uint256 tokenId,
  address delegate,
  uint256 maxNativeValue,
  uint64 expiresAt
)`}</CodeBlock>
            <p className="mt-7">
              Open delegation is intentionally powerful. It may allow arbitrary
              targets and calldata within the remaining HoodOS rules. Do not ask
              users for open delegation merely because it simplifies your
              integration.
            </p>
          </DocSection>

          <DocSection
            id="limits"
            eyebrow="21 / Value Limits"
            title="Limit native value."
            dark
          >
            <p>
              Every capability includes <code>maxNativeValue</code>. This
              limits how much native currency can be attached to an authorized
              execution.
            </p>
            <CodeBlock>{`For calls that do not require native value:

maxNativeValue = 0`}</CodeBlock>
            <p className="mt-7">
              For game and agent actions that only call contract methods, zero
              is a strong default.
            </p>
          </DocSection>

          <DocSection
            id="expiration"
            eyebrow="22 / Expiration"
            title="Permissions can expire."
          >
            <p>
              Capabilities include <code>expiresAt</code> as a Unix timestamp.
            </p>
            <CodeBlock>{`expiresAt = 0
// no expiration

expiresAt = futureUnixTimestamp
// expires automatically`}</CodeBlock>
            <p className="mt-7">
              Short-lived permissions are preferable for game sessions and
              agents whenever practical.
            </p>
          </DocSection>

          <DocSection
            id="session-keys"
            eyebrow="23 / Session Keys"
            title="Play without signing every move."
            dark
          >
            <p>
              HoodDelegation can act as a session-key system. Instead of asking
              the holder to approve every move, grant a temporary wallet a
              narrow capability.
            </p>
            <CodeBlock>{`Hoodie: #42
Delegate: temporary game session wallet
Target: Dungeon Game
Selector: move(bytes32)
maxNativeValue: 0
expiresAt: 2 hours`}</CodeBlock>
            <p className="mt-7">
              The session wallet can perform the approved gameplay action
              without gaining general control over the Hoodie account.
            </p>
          </DocSection>

          <DocSection
            id="revocation"
            eyebrow="25 / Revocation"
            title="Remove permissions."
          >
            <CodeBlock>{`revokeExactCapability(
  uint256 tokenId,
  address delegate,
  address target,
  bytes calldata data
)

revokeSelectorCapability(
  uint256 tokenId,
  address delegate,
  address target,
  bytes4 selector
)

revokeTargetCapability(
  uint256 tokenId,
  address delegate,
  address target
)

revokeOpenCapability(
  uint256 tokenId,
  address delegate
)`}</CodeBlock>
            <p className="mt-7">
              Only the current Hoodie owner can manage capabilities for that
              Hoodie.
            </p>
          </DocSection>

          <DocSection
            id="read-permissions"
            eyebrow="26 / Read Permissions"
            title="Inspect delegated access."
            dark
          >
            <CodeBlock>{`getExactCapability(...)
getSelectorCapability(...)
getTargetCapability(...)
getOpenCapability(...)`}</CodeBlock>
            <CodeBlock>{`struct Capability {
  bool active;
  uint64 expiresAt;
  uint256 maxNativeValue;
}`}</CodeBlock>
            <p className="mt-7">
              These reads allow builders to create proper permission dashboards
              showing what an agent or application can currently do.
            </p>
          </DocSection>

          <DocSection
            id="ownership"
            eyebrow="27 / Ownership"
            title="Always resolve current owner."
          >
            <CodeBlock>{`function owner()
  view
  returns (address currentOwner)`}</CodeBlock>
            <p className="mt-7">
              HoodWallet ownership is derived from the ERC-721 token bound to
              the account. Never hardcode the original owner. The account can
              return <code>address(0)</code> if its token context cannot be
              resolved.
            </p>
          </DocSection>

          <DocSection
            id="state-events"
            eyebrow="29 / State + Events"
            title="Track account activity."
            dark
          >
            <p>
              HoodWallet exposes a <code>state()</code> counter that increments
              after successful executions.
            </p>
            <CodeBlock>{`event Executed(
  address indexed caller,
  address indexed target,
  uint256 value,
  uint8 operation,
  uint256 state
);

event StateUpdated(
  uint256 indexed newState
);`}</CodeBlock>
            <p className="mt-7">
              Indexers and applications can use these events to follow Hoodie
              account activity and execution progression.
            </p>
          </DocSection>

          <DocSection
            id="integration"
            eyebrow="31 / Integration Flow"
            title="Recommended app flow."
          >
            <CodeBlock>{`01  Receive / select tokenId
02  Call HoodOS.walletOf(tokenId)
03  Read Hoodie state
04  Resolve current owner
05  Check activation
06  Read relevant balances / inventory
07  Build calldata
08  Owner executes OR delegate checks capability
09  Call HoodWallet.execute()
10  Index resulting events
11  Re-check ownership whenever authorization matters`}</CodeBlock>
          </DocSection>

          <DocSection
            id="identity"
            eyebrow="32 / Hoodie Identity"
            title="The Hoodie becomes the actor."
            dark
          >
            <CodeBlock>{`Owner
  │
  ▼
Hoodie
  │
  ▼
HoodWallet
  ├── tokens
  ├── NFTs
  ├── inventory
  ├── achievements
  ├── game state
  ├── credentials
  └── interactions`}</CodeBlock>
            <p className="mt-7">
              The larger design space is not simply an NFT with a wallet. It is
              a programmable on-chain entity that can own, read, act and
              delegate.
            </p>
          </DocSection>

          <DocSection
            id="quick-start"
            eyebrow="33 / 5-Min Quick Start"
            title="First integration."
          >
            <p>
              Start by getting a testnet Hoodie and $OCH from{" "}
              <a
                href={BUILDER_X}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                @0xfilter8
              </a>
              .
            </p>
            <CodeBlock>{`import { ethers } from "ethers";

const hoodOS = new ethers.Contract(
  "${TESTNET.hoodOS}",
  [
    "function walletOf(uint256 tokenId) view returns (address)",
    "function isActive(uint256 tokenId) view returns (bool)"
  ],
  provider
);

const tokenId = 42n;
const hoodWalletAddress = await hoodOS.walletOf(tokenId);
const active = await hoodOS.isActive(tokenId);

console.log({ hoodWalletAddress, active });`}</CodeBlock>
            <CodeBlock>{`const wallet = new ethers.Contract(
  hoodWalletAddress,
  [
    "function execute(address target,uint256 value,bytes data,uint8 operation) payable returns (bytes)",
    "function owner() view returns (address)",
    "function state() view returns (uint256)"
  ],
  signer
);`}</CodeBlock>
            <CodeBlock>{`const game = new ethers.Interface([
  "function enterDungeon(uint256 dungeonId)"
]);

const data = game.encodeFunctionData(
  "enterDungeon",
  [7]
);

await wallet.execute(
  GAME_ADDRESS,
  0,
  data,
  0
);`}</CodeBlock>
            <p className="mt-7">
              Your target contract receives the call from the HoodWallet. You
              have now made the Hoodie perform an on-chain action.
            </p>
          </DocSection>

          <DocSection
            id="build-agent"
            eyebrow="34 / Build an Agent"
            title="Add controlled autonomy."
            dark
          >
            <p>
              Once direct owner execution works, add a second wallet as the
              delegate and grant it one narrow capability.
            </p>
            <CodeBlock>{`Owner
  │ grantSelectorCapability()
  ▼
Agent
  │
  ▼
HoodWallet.execute()
  │
  ▼
HoodOS
  │
  ▼
HoodDelegation
  │
  ▼
Game / Protocol`}</CodeBlock>
            <p className="mt-7">
              A strong test setup is one selector,{" "}
              <code>maxNativeValue = 0</code> and a short expiry.
            </p>
          </DocSection>

          <DocSection
            id="ideas"
            eyebrow="35 / Ideas"
            title="What should you build?"
          >
            <div className="grid gap-2 md:grid-cols-2">
              {[
                "Hoodie dungeon game",
                "Autonomous Hoodie agents",
                "Hoodie inventories",
                "Equipment NFTs",
                "Quest systems",
                "Achievement systems",
                "On-chain reputation",
                "Hoodie-vs-Hoodie games",
                "Agent competitions",
                "Token-gated worlds",
                "Session-key gaming",
                "Automated reward claiming",
                "Cross-collection games",
                "Hoodie-owned collectibles",
                "Social applications",
                "On-chain identity experiments",
              ].map((idea) => (
                <div key={idea} className="border border-black p-4 text-sm">
                  {idea}
                </div>
              ))}
            </div>
          </DocSection>

          <DocSection id="start" eyebrow="36 / Start Building" title="Your first integration.">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["01", "Get test assets", "Contact @0xfilter8 on X for a testnet Hoodie and $OCH."],
                ["02", "Resolve", "Call HoodOS.walletOf(tokenId) to find the Hoodie account."],
                ["03", "Inspect", "Read activation, ownership, balances and account state."],
                ["04", "Build", "Deploy a game, agent, quest, inventory or other Hoodie-aware contract."],
                ["05", "Execute", "Encode your action and call it through HoodWallet.execute()."],
                ["06", "Delegate", "Add narrow temporary permissions when your UX needs agents or session keys."],
              ].map(([n, title, copy]) => (
                <div key={n} className="border-2 border-black p-5">
                  <p className="text-[9px] opacity-50">{n}</p>
                  <h3 className="mt-4 text-3xl">{title}</h3>
                  <p className="mt-4 text-sm leading-relaxed opacity-70">
                    {copy}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 border-2 border-black bg-black p-6 text-[#ccff00] md:p-10">
              <p className="text-[9px] uppercase tracking-[0.18em] opacity-55">
                Test with the Hood
              </p>
              <h3 className="mt-5 text-4xl leading-[0.95] tracking-[-0.05em] md:text-6xl">
                NEED A HOODIE
                <br />
                + $OCH?
              </h3>
              <p className="mt-6 max-w-2xl text-lg opacity-75">
                Contact Filter8 on X. Tell us what you want to build and we can
                get you test assets for the Robinhood Chain testnet.
              </p>
              <a
                href={BUILDER_X}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-block border border-[#ccff00] px-5 py-4 text-[9px] uppercase tracking-[0.15em]"
              >
                Contact @0xfilter8 ↗
              </a>
            </div>
          </DocSection>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}