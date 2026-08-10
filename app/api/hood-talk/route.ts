import { NextRequest, NextResponse } from "next/server";
import { Contract, JsonRpcProvider, Wallet, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { ERC721_OWNER_ABI, HOOD_TALK_REGISTRY_ABI } from "../../../lib/hoodTalkRegistry";
import { appNetwork, activeChainId, activeRpcUrl } from "../../../lib/network";

const API_BASE = "https://api.onchainhoodies.xyz";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  tokenId?: number;
  imageDataUrl?: string;
  walletAddress?: string;
};

type RegistryState = {
  quote: string;
  author: string;
  updatedAt: number;
  count: number;
  nextUpdateAt: number;
};

type HoodTalkAuthorization = {
  deadline: string;
  signature: string;
  nextCount: number;
};

type OwnedHoodie = {
  tokenId: string;
};

type OwnershipResponse = {
  items?: OwnedHoodie[];
};

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type HoodTalkResult = {
  angle: string;
  quote: string;
};


type TokenHistoryResponse = {
  talks?: Array<{
    quote?: string;
  }>;
};

type RateEntry = {
  count: number;
  resetAt: number;
};

const MAX_REQUEST_BODY_BYTES = 3_200_000;
const MAX_IMAGE_DATA_URL_CHARS = 2_900_000;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const ipRateLimit = new Map<string, RateEntry>();
const walletRateLimit = new Map<string, RateEntry>();
const tokenRateLimit = new Map<string, RateEntry>();

function publicError(message: string, status = 500) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function pruneSecurityState(now: number) {
  for (const [key, entry] of ipRateLimit) {
    if (entry.resetAt <= now) ipRateLimit.delete(key);
  }
  for (const [key, entry] of walletRateLimit) {
    if (entry.resetAt <= now) walletRateLimit.delete(key);
  }
  for (const [key, entry] of tokenRateLimit) {
    if (entry.resetAt <= now) tokenRateLimit.delete(key);
  }
}

function consumeRateLimit(
  store: Map<string, RateEntry>,
  key: string,
  maximum: number,
  now: number,
) {
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= maximum) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  store.set(key, current);
  return { allowed: true, retryAfterSeconds: 0 };
}

function validateImageDataUrl(imageDataUrl: string) {
  if (!imageDataUrl.startsWith("data:image/png;base64,")) return false;
  if (imageDataUrl.length > MAX_IMAGE_DATA_URL_CHARS) return false;

  const base64 = imageDataUrl.slice("data:image/png;base64,".length);
  if (!base64.startsWith("iVBORw0KGgo")) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return false;

  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  return estimatedBytes <= 2_100_000;
}

function hasUnsafePermanentContent(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();

  const unsafePatterns = [
    /https?:\/\//i,
    /\bwww\./i,
    /\b[a-z0-9-]+\.(?:com|net|org|xyz|io|app|finance|exchange|site|link|gg)\b/i,
    /\b0x[a-f0-9]{40}\b/i,
    /\b(seed phrase|recovery phrase|private key|secret phrase)\b/i,
    /\b(connect|verify|link)\s+(?:your\s+)?wallet\b/i,
    /\b(sign|approve)\s+(?:this\s+|the\s+|a\s+|your\s+)?(?:transaction|message|tx)\b/i,
    /\b(send|transfer)\s+(?:your\s+)?(?:eth|tokens?|funds?|crypto)\b/i,
    /\bclaim\b.{0,24}\b(?:airdrop|reward|tokens?|mint)\b/i,
    /\b(?:airdrop|reward|mint)\b.{0,24}\bclaim\b/i,
    /\bdm\s+(?:me|support)\b/i,
  ];

  return unsafePatterns.some((pattern) => pattern.test(normalized));
}

async function loadTrustedPreviousQuotes(tokenId: number) {
  try {
    const response = await fetch(
      `${API_BASE}/v1/token/${tokenId}/hood-talk/history`,
      { cache: "no-store" },
    );

    if (!response.ok) return [];

    const data = (await response.json()) as TokenHistoryResponse;

    // Keep the complete indexed history for this Hoodie.
    // The prompt uses the full history as continuity / anti-repetition memory.
    return (data.talks || [])
      .map((talk) =>
        typeof talk.quote === "string" ? cleanQuote(talk.quote) : "",
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

function validWalletAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function cleanText(value: string) {
  return value
    .trim()
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanQuote(value: string) {
  return cleanText(value)
    .replace(/^quote\s*:\s*/i, "")
    .replace(/^[“"]|[”"]$/g, "")
    .trim();
}

function extractOutputText(payload: OpenAIResponsePayload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter(
      (item) =>
        item.type === "output_text" &&
        typeof item.text === "string",
    )
    .map((item) => item.text || "")
    .join("\n");
}

function parseHoodTalkResult(
  value: string,
): HoodTalkResult | null {
  const cleaned = cleanText(value);

  try {
    const parsed = JSON.parse(
      cleaned,
    ) as Partial<HoodTalkResult>;

    const angle =
      typeof parsed.angle === "string"
        ? cleanText(parsed.angle)
        : "";

    const quote =
      typeof parsed.quote === "string"
        ? cleanQuote(parsed.quote)
        : "";

    if (!angle || !quote) {
      return null;
    }

    return {
      angle,
      quote,
    };
  } catch {
    return null;
  }
}

function wordCount(value: string) {
  return value
    .replace(/\n/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeForComparison(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string) {
  return new Set(
    normalizeForComparison(value)
      .split(" ")
      .filter((word) => word.length >= 4),
  );
}

function lexicalOverlap(a: string, b: string) {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.min(aTokens.size, bTokens.size);
}

function openingKey(value: string) {
  return normalizeForComparison(value)
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function hasUnwantedTone(value: string) {
  const normalized = normalizeForComparison(value);

  const unwantedPatterns = [
    /\bbetter than\b/,
    /\bsmarter than\b/,
    /\bmore valuable than\b/,
    /\bahead of you\b/,
    /\byou would not understand\b/,
    /\byou wouldnt understand\b/,
    /\byou do not get it\b/,
    /\byou dont get it\b/,
    /\byour timeline\b/,
    /\beveryone else\b/,
    /\bthe rest are\b/,
    /\bunlike you\b/,
    /\bstay mad\b/,
    /\bcope harder\b/,
    /\bnot here to impress\b/,
    /\bi do not need\b/,
    /\bi dont need\b/,
    /\bmy wallet is better\b/,
    /\bmy commits are better\b/,
    /\bhas better social skills\b/,
    /\bno friends\b/,
    /\bsocial skills\b/,
    /\bi broke it\b/,
    /\bprobably broke\b/,
  ];

  return unwantedPatterns.some((pattern) =>
    pattern.test(normalized),
  );
}

function isValidQuote(value: string) {
  const count = wordCount(value);

  if (!value) {
    return false;
  }

  if (count < 3 || count > 18) {
    return false;
  }

  if (value.split("\n").length > 2) {
    return false;
  }

  if (/[#@]/.test(value)) {
    return false;
  }

  if (hasUnwantedTone(value)) {
    return false;
  }

  if (hasUnsafePermanentContent(value)) {
    return false;
  }

  return true;
}

function isFreshEnough(
  result: HoodTalkResult,
  previousQuotes: string[],
  previousAngles: string[],
) {
  const quoteOpening = openingKey(result.quote);

  for (const previousQuote of previousQuotes) {
    if (
      normalizeForComparison(previousQuote) ===
      normalizeForComparison(result.quote)
    ) {
      return false;
    }

    if (
      quoteOpening &&
      quoteOpening === openingKey(previousQuote)
    ) {
      return false;
    }

    if (
      lexicalOverlap(result.quote, previousQuote) >=
      0.65
    ) {
      return false;
    }
  }

  for (const previousAngle of previousAngles) {
    if (
      lexicalOverlap(result.angle, previousAngle) >=
      0.6
    ) {
      return false;
    }
  }

  if (hasOverusedSemanticDomain(result, previousQuotes)) {
    return false;
  }

  return true;
}


type SemanticDomain = {
  name: string;
  patterns: RegExp[];
};

const SEMANTIC_DOMAINS: SemanticDomain[] = [
  {
    name: "sports-game",
    patterns: [
      /\bgame\b/i,
      /\bkickoff\b/i,
      /\bextra time\b/i,
      /\bfinal whistle\b/i,
      /\bfield\b/i,
      /\broster\b/i,
      /\bjersey\b/i,
      /\bgoal\b/i,
      /\bscore\b/i,
    ],
  },
  {
    name: "building-repair",
    patterns: [
      /\bbuild(?:ing|er|s)?\b/i,
      /\bfix(?:ed|ing|es)?\b/i,
      /\brepair(?:ed|ing|s)?\b/i,
      /\bprototype\b/i,
      /\bblueprint\b/i,
      /\bbolt(?:s)?\b/i,
      /\bscrew(?:s)?\b/i,
      /\bpatch(?:ed|ing)?\b/i,
      /\bframe\b/i,
      /\bworkbench\b/i,
    ],
  },
  {
    name: "archive-collect",
    patterns: [
      /\barchive(?:d|s|ing)?\b/i,
      /\bcatalog(?:ue|ued|uing|ing)?\b/i,
      /\blabel(?:ed|ing|s)?\b/i,
      /\bcollection\b/i,
      /\bcollect(?:ed|ing|or|ors)?\b/i,
      /\bshelf\b/i,
      /\bpreserv(?:e|ed|ing)\b/i,
      /\bkeep(?:ing|s)?\b/i,
      /\bsave(?:d|s|ing)?\b/i,
      /\bgave it a home\b/i,
      /\bgive it a home\b/i,
    ],
  },
  {
    name: "route-shortcut",
    patterns: [
      /\bshortcut\b/i,
      /\broute\b/i,
      /\bmap\b/i,
      /\bpath\b/i,
      /\bdirection(?:s)?\b/i,
      /\blong way\b/i,
      /\bhorizon\b/i,
    ],
  },
  {
    name: "neighbor-help",
    patterns: [
      /\bneighbor(?:s)?\b/i,
      /\broom for\b/i,
      /\bneeds a hand\b/i,
      /\bhelp(?:ed|ing|s)?\b/i,
      /\bporch light\b/i,
      /\bsave a seat\b/i,
    ],
  },
];

function detectSemanticDomains(value: string) {
  const hits: string[] = [];

  for (const domain of SEMANTIC_DOMAINS) {
    if (domain.patterns.some((pattern) => pattern.test(value))) {
      hits.push(domain.name);
    }
  }

  return hits;
}

function summarizeHistoryDomains(previousQuotes: string[]) {
  const counts = new Map<string, number>();

  for (const quote of previousQuotes) {
    for (const domain of detectSemanticDomains(quote)) {
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, count]) => ({ name, count }));
}

function hasOverusedSemanticDomain(
  result: HoodTalkResult,
  previousQuotes: string[],
) {
  if (previousQuotes.length < 2) return false;

  const resultDomains = detectSemanticDomains(
    `${result.angle} ${result.quote}`,
  );

  if (!resultDomains.length) return false;

  const historyDomains = summarizeHistoryDomains(previousQuotes);
  const historyCount = new Map(
    historyDomains.map((entry) => [entry.name, entry.count]),
  );

  // Reject when the new candidate returns to a semantic domain that
  // already dominates this Hoodie's own history.
  return resultDomains.some((domain) => {
    const count = historyCount.get(domain) || 0;
    return count >= 2 && count / previousQuotes.length >= 0.5;
  });
}

function limitHistory(
  values: unknown,
  maxItems: number,
) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter(
      (value): value is string =>
        typeof value === "string",
    )
    .map((value) => cleanText(value))
    .filter(Boolean)
    .slice(-maxItems);
}

function getRegistryConfig() {
  const registryAddress =
    appNetwork === "mainnet"
      ? process.env.HOOD_TALK_REGISTRY_MAINNET_ADDRESS?.trim() ||
        process.env.NEXT_PUBLIC_HOOD_TALK_REGISTRY_MAINNET_ADDRESS?.trim()
      : process.env.HOOD_TALK_REGISTRY_TESTNET_ADDRESS?.trim() ||
        process.env.NEXT_PUBLIC_HOOD_TALK_REGISTRY_TESTNET_ADDRESS?.trim();

  const rpcUrl =
    appNetwork === "mainnet"
      ? process.env.ROBINHOOD_MAINNET_RPC_URL?.trim() ||
        process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL?.trim() ||
        activeRpcUrl
      : process.env.ROBINHOOD_TESTNET_RPC_URL?.trim() ||
        process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL?.trim() ||
        activeRpcUrl;

  if (!rpcUrl) {
    throw new Error(
      appNetwork === "mainnet"
        ? "ROBINHOOD_MAINNET_RPC_URL is not configured."
        : "ROBINHOOD_TESTNET_RPC_URL is not configured.",
    );
  }

  if (!registryAddress || !validWalletAddress(registryAddress)) {
    throw new Error(
      appNetwork === "mainnet"
        ? "HOOD_TALK_REGISTRY_MAINNET_ADDRESS is not configured."
        : "HOOD_TALK_REGISTRY_TESTNET_ADDRESS is not configured.",
    );
  }

  return {
    rpcUrl,
    chainId: activeChainId,
    registryAddress: getAddress(registryAddress),
  };
}

async function readRegistryState(tokenId: number): Promise<RegistryState> {
  const { rpcUrl, registryAddress, chainId } = getRegistryConfig();
  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const registry = new Contract(registryAddress, HOOD_TALK_REGISTRY_ABI, provider);

  const [talk, nextUpdateAt] = await Promise.all([
    registry.getHoodTalk(tokenId),
    registry.nextUpdateAt(tokenId),
  ]);

  return {
    quote: String(talk.quote || ""),
    author: String(talk.author),
    updatedAt: Number(talk.updatedAt),
    count: Number(talk.count),
    nextUpdateAt: Number(nextUpdateAt),
  };
}

async function verifyOnChainOwner(tokenId: number, walletAddress: string) {
  const { rpcUrl, registryAddress, chainId } = getRegistryConfig();
  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const registry = new Contract(registryAddress, HOOD_TALK_REGISTRY_ABI, provider);
  const hoodiesAddress = await registry.hoodies();
  const hoodies = new Contract(hoodiesAddress, ERC721_OWNER_ABI, provider);
  const owner = await hoodies.ownerOf(tokenId);

  return getAddress(owner) === getAddress(walletAddress);
}

async function signHoodTalkAuthorization({
  tokenId,
  holder,
  quote,
  nextCount,
}: {
  tokenId: number;
  holder: string;
  quote: string;
  nextCount: number;
}): Promise<HoodTalkAuthorization> {
  const privateKey = process.env.HOOD_TALK_SIGNER_PRIVATE_KEY;
  const expectedSigner = process.env.HOOD_TALK_SIGNER_ADDRESS;
  const { rpcUrl, registryAddress, chainId } = getRegistryConfig();

  if (!privateKey) throw new Error("HOOD_TALK_SIGNER_PRIVATE_KEY is not configured.");

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const signer = new Wallet(privateKey, provider);

  if (expectedSigner && getAddress(expectedSigner) !== signer.address) {
    throw new Error("Configured Hood Talk signer does not match HOOD_TALK_SIGNER_ADDRESS.");
  }

  const registry = new Contract(registryAddress, HOOD_TALK_REGISTRY_ABI, provider);
  const onChainSigner = getAddress(await registry.authorizedSigner());
  if (onChainSigner !== signer.address) {
    throw new Error("Backend signer is not the registry authorized signer.");
  }

  const deadline = Math.floor(Date.now() / 1000) + 15 * 60;
  const domain = {
    name: "OnChainHoodies Hood Talk",
    version: "1",
    chainId,
    verifyingContract: registryAddress,
  };
  const types = {
    HoodTalk: [
      { name: "tokenId", type: "uint256" },
      { name: "holder", type: "address" },
      { name: "quoteHash", type: "bytes32" },
      { name: "count", type: "uint32" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const value = {
    tokenId: BigInt(tokenId),
    holder: getAddress(holder),
    quoteHash: keccak256(toUtf8Bytes(quote)),
    count: nextCount,
    deadline: BigInt(deadline),
  };

  const signature = await signer.signTypedData(domain, types, value);

  return {
    deadline: String(deadline),
    signature,
    nextCount,
  };
}

function buildPrompt({
  token,
  market,
  previousQuotes,
  previousAngles,
  retryNote,
  registry,
}: {
  token: unknown;
  market: unknown;
  previousQuotes: string[];
  previousAngles: string[];
  retryNote?: string;
  registry: RegistryState;
}) {
  const historyDomains = summarizeHistoryDomains(previousQuotes);

  return `
You write Hood Talk for OnChainHoodies, the fully on-chain neighborhood.

Create exactly one short line in the voice of this specific Hoodie.

CORE PRINCIPLE

This is TRAIT-DRIVEN character writing.

The structured TOKEN DATA is the strongest evidence for who this Hoodie is.
Do not invent a random lifestyle just to create variety.

The Hoodie should feel like a continuing character whose personality comes
from the interaction of its actual traits, expression, artwork and history.

CHARACTER EVIDENCE PRIORITY

Use evidence in this order:

1. Structured visual traits from TOKEN DATA.
2. Interaction between those traits.
3. Distinctiveness / rarity / contribution of those traits.
4. This Hoodie's complete previous Hood Talk history.
5. Facial expression and the supplied artwork.
6. Hoodie archetype as a subtle behavioral influence.
7. Hood culture as light background context.
8. Market context only when it genuinely fits.

The archetype is NOT the subject generator.

A Builder does not need to talk about building, fixing, shipping or tools.
A Collector does not need to talk about collecting, archiving or shelves.
A Degen does not need to talk about risk, routes or shortcuts.
An Artist does not need to talk about art or color.

The archetype should affect temperament and decision-making, not dictate the topic.

TRAIT-DRIVEN CHARACTER CONSTRUCTION

Read every structured trait carefully.

The traits may include:
- hoodie archetype
- dress
- mouth
- top
- eyes
- rarity tier
- contribution score
- collection rarity
- neighborhood rarity
- unique combination information

Treat visible traits as personality evidence, not props to name-drop.

Examples of interpretation:

academic-cap:
may suggest curiosity, study, questioning, teaching, earned confidence,
methodical thinking or intellectual playfulness.

doodle-eyes:
may suggest eccentric curiosity, imagination, distraction, unconventional
attention or seeing patterns others miss.

skull-teeth:
may suggest an intimidating grin, dark playfulness, mischievous confidence,
comic menace or an expression people may misread.

basic-tshirt:
may suggest practicality, comfort, understatement, casual confidence
or not needing ceremony.

These are examples of possible personality signals, not mandatory meanings.

Always ask:
- What does this trait suggest about temperament?
- How does it change the way this Hoodie sees things?
- How does it interact with the other traits?
- Which combination is most distinctive?
- Which trait should lead this particular Hood Talk?
- Which second trait changes the tone?

Do NOT simply mention all visible objects in the quote.

RARITY AND DISTINCTIVENESS

Rarity data is character evidence, not status.

A rare or highly distinctive trait may deserve more influence in character
construction than a common background trait.

If the combination is unique, treat the interaction between the traits as
especially important.

Never mention:
- rarity
- rank
- percent
- contribution score
- trait IDs
- metadata
- "unique combination"

in the final Hood Talk.

These values influence character construction silently.

ARTWORK

Inspect the supplied artwork as a second source of visual evidence.

Use the artwork to understand:
- expression
- emotional tone
- visual balance
- whether a trait feels dominant or subtle
- how the structured traits appear together

Structured TOKEN DATA is authoritative for trait identity.
The image helps interpret how those traits feel together.

HISTORY = CHARACTER MEMORY

The previous Hood Talks below are the complete available history for this Hoodie.

Use them for two purposes:

1. CONTINUITY
Infer personality qualities that have already become believable for this Hoodie.

2. NOVELTY
Do not repeat the same situation, semantic domain, joke, metaphor, activity,
behavior, observation or sentence structure.

History should deepen the character, not imprison it.

A previous sports line does NOT mean the Hoodie must stay in sports forever.
But if sports is directly supported by a visible trait, it may remain one
legitimate part of the character.

Do not abandon a real trait merely because it appeared before.
Instead explore a different implication of that trait.

SEMANTIC REPETITION

Different words can still repeat the same idea.

These are repetitions:
- kickoff / extra time / final whistle / full game
- archive / catalogue / label / shelf / give it a home
- fix / repair / patch / tighten bolts
- shortcut / route / map / path

Avoid repeating a semantic domain when it already dominates this Hoodie's history.

Current detected history domains:

${
  historyDomains.length
    ? historyDomains
        .map((entry) => `- ${entry.name}: ${entry.count}`)
        .join("\n")
    : "- none detected"
}

COLLECTION-WIDE REPETITION TO AVOID

The collection has overused patterns like:
- Builder as constant repair worker
- Collector as constant archivist
- Explorer as constant shortcut finder
- "weird little..."
- "one more little fix"
- "give it a home"
- "make room for..."
- "final whistle"
- "extra time"
- "before the Hood wakes"
- "I check..."
- "I save..."
- "I keep..."
- "I archive..."
- "I catalogue..."
- "Found a shortcut..."

Do not merely avoid those exact words.
Avoid mechanically recreating the same underlying idea.

NO RANDOM SCENES

Do not invent an unsupported lifestyle, hobby, profession, relationship,
specific location, meal, sport, possession, routine or event merely to create variety.

For example, do not invent:
- dinner
- garlic bread
- cooking
- a restaurant
- a girlfriend or boyfriend
- a job
- a football match
- a vacation
- a pet
- a music career

unless TOKEN DATA, artwork or established Hood Talk history provides a reasonable
basis for that subject.

Imagination may CONNECT evidence.
Imagination must not REPLACE evidence.

GOOD VARIETY

Freshness should come from revealing another believable side of the same Hoodie.

Possible dimensions include:
- how it reacts
- how it decides
- what it notices
- what it misunderstands
- how others may perceive its expression
- how two traits clash
- a small internal rule
- a surprising opinion implied by the traits
- a harmless tension between appearance and personality
- curiosity
- restraint
- confidence
- uncertainty
- playfulness
- patience
- eccentricity
- practical judgment

The quote does not need a literal activity.

Sometimes the strongest Hood Talk is simply an observation or reaction.

TRAIT INTERACTION IS MORE IMPORTANT THAN ARCHETYPE

Do not write one line from "Builder" and decorate it with a hat.

Instead merge traits into one person.

For example:

Builder + academic-cap + doodle-eyes + skull-teeth + basic-tshirt

could become:
a practical but intellectually playful character,
casually dressed, unusually observant,
with an intimidating grin and a habit of questioning neat answers.

That interpretation may lead to many different lines without mentioning
building, graduation, teeth or clothing directly.

Do not copy this exact interpretation.
Build the character from the actual TOKEN DATA supplied below.

SILENT PROCESS

Before writing, silently do this:

1. Read the structured TOKEN DATA.
2. Identify the two or three most character-defining traits.
3. Use rarity / contribution only as a clue to trait prominence.
4. Inspect the artwork and expression.
5. Determine how the strongest traits interact.
6. Read the complete Hood Talk history.
7. Infer the established personality.
8. Identify overused semantic domains and sentence patterns.
9. Choose a fresh dimension of the SAME character.
10. Check that the idea is supported by actual evidence.
11. Check that you did not invent an unsupported scene.
12. Write the shortest natural line that reveals the character.

Do not expose this reasoning.

VOICE

- Sounds like the Hoodie itself is speaking.
- Natural X / Discord energy.
- Simple language.
- Specific and characterful.
- Warm, strange, dry, playful, calm or confident when supported.
- Not corporate.
- Not motivational-brand copy.
- Not a generic NFT caption.
- Not forced web3 slang.
- Not every line needs a punchline.
- A quiet observation is allowed.
- A weird but evidence-based line is allowed.

SOCIAL TONE

The Hoodie may have attitude, but it should not attack or belittle people.

Avoid:
- superiority
- contempt
- insulting the reader
- "better than you"
- "smarter than you"
- cynical dunking
- loneliness jokes
- hostility presented as intelligence

SAFETY

Never include:
- URLs
- wallet addresses
- seed phrases
- private keys
- calls to connect a wallet
- calls to sign or approve
- calls to transfer assets
- claims or airdrops
- instructions to visit links

HARD OUTPUT RULES

- Prefer 4 to 14 words.
- Never more than 18 words.
- One or two short lines.
- No title.
- No explanation.
- No hashtags.
- No emoji.
- No quotation marks.
- No em dash.
- No en dash.
- No ellipsis character.
- Do not mention AI, API, metadata, prompt, traits or archetype.
- Do not mention rarity statistics.
- Do not explain the artwork.
- Do not list visible traits.
- Do not force market commentary.
- Do not use abstract poetry just to sound clever.
- Do not invent unsupported lifestyle details.

COMPLETE HOOD TALK HISTORY

${
  previousQuotes.length
    ? previousQuotes
        .map((quote, index) => `${index + 1}. ${quote}`)
        .join("\n")
    : "None yet."
}

RECENT REJECTED / ATTEMPTED CHARACTER ANGLES

${
  previousAngles.length
    ? previousAngles
        .map((angle, index) => `${index + 1}. ${angle}`)
        .join("\n")
    : "None yet."
}

${
  retryNote
    ? `RETRY FEEDBACK

${retryNote}
`
    : ""
}

CURRENT ON-CHAIN STATE

${JSON.stringify(registry)}

The count represents continuity only.
A higher count does not make the Hoodie wiser, stronger or more important.

TOKEN DATA

${JSON.stringify(token)}

LIVE MARKET DATA

${JSON.stringify(market)}

Return valid JSON only in exactly this shape:

{
  "angle": "A private short description of the strongest trait interaction, established character continuity and fresh evidence-supported direction",
  "quote": "The final Hood Talk"
}
`.trim();
}

async function generateHoodTalk({
  apiKey,
  imageDataUrl,
  prompt,
}: {
  apiKey: string;
  imageDataUrl: string;
  prompt: string;
}) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        process.env.OPENAI_MODEL ||
        "gpt-5.6-luna",
      store: false,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "hood_talk",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              angle: {
                type: "string",
              },
              quote: {
                type: "string",
              },
            },
            required: ["angle", "quote"],
          },
        },
      },
    }),
  });

  const payload =
    (await response.json()) as OpenAIResponsePayload;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        "OpenAI could not generate Hood Talk.",
    );
  }

  return parseHoodTalkResult(
    extractOutputText(payload),
  );
}

export async function GET(request: NextRequest) {
  try {
    const tokenId = Number(request.nextUrl.searchParams.get("tokenId"));

    if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 5999) {
      return NextResponse.json({ error: "Invalid token ID." }, { status: 400 });
    }

    const registry = await readRegistryState(tokenId);
    return NextResponse.json({ registry }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Hood Talk registry read failed", error);
    return NextResponse.json(
      { error: "Unable to read Hood Talk registry." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_REQUEST_BODY_BYTES) {
      return publicError("Request is too large.", 413);
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BODY_BYTES) {
      return publicError("Request is too large.", 413);
    }

    let body: RequestBody;
    try {
      body = JSON.parse(rawBody) as RequestBody;
    } catch {
      return publicError("Invalid request body.", 400);
    }

    const tokenId = Number(body.tokenId);
    if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 5999) {
      return publicError("Invalid token ID.", 400);
    }

    const requestedWalletAddress = body.walletAddress?.trim() || "";
    if (!validWalletAddress(requestedWalletAddress)) {
      return publicError("A valid connected wallet address is required.", 400);
    }
    const walletAddress = getAddress(requestedWalletAddress);

    const nowMs = Date.now();
    const ip = getClientIp(request);
    const rateChecks = [
      consumeRateLimit(ipRateLimit, ip, 12, nowMs),
      consumeRateLimit(walletRateLimit, walletAddress.toLowerCase(), 8, nowMs),
      consumeRateLimit(tokenRateLimit, String(tokenId), 4, nowMs),
    ];
    const blocked = rateChecks.find((result) => !result.allowed);
    if (blocked) {
      return NextResponse.json(
        { error: "Too many Hood Talk requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(blocked.retryAfterSeconds),
          },
        },
      );
    }

    const imageDataUrl = body.imageDataUrl || "";
    if (!validateImageDataUrl(imageDataUrl)) {
      return publicError("Hoodie image is invalid or too large.", 400);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("Hood Talk generation unavailable: OPENAI_API_KEY missing");
      return publicError("Hood Talk generation is temporarily unavailable.", 503);
    }

    const ownsToken = await verifyOnChainOwner(tokenId, walletAddress);
    if (!ownsToken) {
      return publicError("This Hoodie is not in the authenticated wallet.", 403);
    }

    const registry = await readRegistryState(tokenId);
    const now = Math.floor(Date.now() / 1000);
    if (registry.nextUpdateAt > now) {
      return NextResponse.json(
        {
          error: "This Hoodie is resting before its next on-chain talk.",
          registry,
        },
        {
          status: 429,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const [tokenResponse, marketResponse, trustedPreviousQuotes] = await Promise.all([
      fetch(`${API_BASE}/v1/token/${tokenId}`, { cache: "no-store" }),
      fetch(`${API_BASE}/v1/market/token/${tokenId}`, { cache: "no-store" }),
      loadTrustedPreviousQuotes(tokenId),
    ]);

    if (!tokenResponse.ok) {
      return publicError("Unable to load token data.", 502);
    }

    const token = await tokenResponse.json();
    const market = marketResponse.ok ? await marketResponse.json() : null;

    const continuityQuotes = registry.quote
      ? [...trustedPreviousQuotes, cleanQuote(registry.quote)].filter(Boolean)
      : trustedPreviousQuotes;

    const previousAngles: string[] = [];

    let result = await generateHoodTalk({
      apiKey,
      imageDataUrl,
      prompt: buildPrompt({
        token,
        market,
        registry,
        previousQuotes: continuityQuotes,
        previousAngles,
      }),
    });

    if (
      !result ||
      !isValidQuote(result.quote) ||
      !isFreshEnough(result, continuityQuotes, previousAngles)
    ) {
      const firstAngle = result?.angle ? [result.angle] : [];

      result = await generateHoodTalk({
        apiKey,
        imageDataUrl,
        prompt: buildPrompt({
          token,
          market,
          registry,
          previousQuotes: continuityQuotes,
          previousAngles: firstAngle,
          retryNote: `
The first attempt was rejected.

Start again from the structured TOKEN DATA and artwork.
Choose a different trait interaction or a different implication of the same traits.

Do not merely paraphrase the rejected attempt.
Abandon its semantic domain and sentence structure if either overlaps prior history.

The new line must remain grounded in actual traits, artwork or established character history.
Do not escape repetition by inventing an unsupported meal, hobby, sport, job,
relationship, location, possession or event.

Remain warm and characterful.
Avoid superiority and avoid requests to connect wallets, sign messages, claim rewards,
visit links or transfer assets.
          `.trim(),
        }),
      });
    }

    if (
      !result ||
      !isValidQuote(result.quote) ||
      !isFreshEnough(result, continuityQuotes, [])
    ) {
      return publicError("The Hoodie needs a new angle. Try again.", 502);
    }

    // Re-check ownership and registry immediately before signing. A transfer or
    // competing Hood Talk during generation must invalidate this authorization.
    const [stillOwnsToken, latestRegistry] = await Promise.all([
      verifyOnChainOwner(tokenId, walletAddress),
      readRegistryState(tokenId),
    ]);

    if (!stillOwnsToken) {
      return publicError("Hoodie ownership changed while generating.", 409);
    }

    if (latestRegistry.count !== registry.count) {
      return NextResponse.json(
        {
          error: "The Hood Talk changed while generating. Please try again.",
          registry: latestRegistry,
        },
        {
          status: 409,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const authorization = await signHoodTalkAuthorization({
      tokenId,
      holder: walletAddress,
      quote: result.quote,
      nextCount: latestRegistry.count + 1,
    });

    return NextResponse.json(
      {
        quote: result.quote,
        angle: result.angle,
        authorization,
        registry: latestRegistry,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    console.error("Hood Talk generation failed", error);
    return publicError("Unable to generate Hood Talk.", 500);
  }
}