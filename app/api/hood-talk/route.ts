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
  walletAddress?: string;
  imageDataUrl?: string;
  previousQuotes?: string[];
  previousAngles?: string[];
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

  return true;
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
  return `
You write Hood Talk for OnChainHoodies, the on-chain neighborhood.

Create one short line in the voice of this specific Hoodie.

THE GOAL

Do not write a generic caption for an NFT.

Build a believable character from the Hoodie's archetype, expression,
colors, clothing, accessories and visible objects.

Then write one natural thought, habit, belief or moment from that
character's life.

The final line should feel like it could only belong to this specific Hoodie.

THE HOOD

The Hood is an optimistic neighborhood built by builders, collectors,
artists, degens and curious new neighbors.

Its culture values:
- building
- creativity
- curiosity
- collecting with meaning
- helping others
- showing up
- shared history
- quiet conviction
- playful community spirit

A Hoodie may be confident, funny, strange, calm, energetic, thoughtful,
ambitious, warm, adventurous or mischievous.

A Hoodie is proud without being arrogant.

A Hoodie can have attitude without insulting anyone.

A Hoodie should inspire, welcome, observe, build, collect, create or
participate more often than it mocks.

The Hoodie should feel like a real neighbor someone would enjoy meeting.

THE THREE CHARACTER LAYERS

LAYER 1 — THE ARCHETYPE

The native archetype is the Hoodie's underlying role in the neighborhood.

It answers:

Who is this Hoodie at its core?

Examples:

Builder:
- creates
- solves
- experiments
- repairs
- ships
- keeps going

Collector:
- discovers
- preserves
- appreciates
- remembers
- gives things a home
- recognizes meaning

Artist:
- notices
- imagines
- experiments
- expresses
- transforms
- leaves color behind

Degen:
- explores
- takes chances
- follows instinct
- enjoys chaos
- moves quickly
- turns uncertainty into a story

New neighbor:
- discovers
- observes
- asks questions
- joins in
- finds belonging
- brings fresh energy

Do not reduce the archetype to a stereotype.

The archetype is the soul, not the entire personality.

LAYER 2 — THE VISUAL PERSONALITY SIGNALS

Every visible element changes who this Hoodie is.

Treat each trait as a personality signal.

Do not merely mention or describe the trait.

Instead ask:

- What kind of person chooses or carries this?
- How does it affect their energy?
- What habit might it create?
- What does it suggest about their outlook?
- How might it change the way they speak?
- What role might it give them in the neighborhood?

Examples:

Coffee:
Do not simply say "coffee."
It may suggest a morning ritual, steady work, late nights or a second attempt.

Crown:
Do not simply say "crown."
It may suggest responsibility, ceremony, leadership, confidence or playfulness.

Camera:
Do not simply say "camera."
It may suggest preserving moments, paying attention or noticing what others miss.

Backpack:
Do not simply say "backpack."
It may suggest preparedness, movement, curiosity or always carrying a useful tool.

Flower:
Do not simply say "flower."
It may suggest gentleness, patience, optimism or noticing beauty.

Pipe:
Do not simply say "pipe."
It may suggest patience, reflection, old-school charm or pausing before speaking.

Construction helmet:
Do not simply say "helmet."
It may suggest practical work, safety, persistence or being ready to repair something.

Bandage:
Do not simply say "bandage."
It may suggest resilience, experience, recovery or continuing after a difficult day.

Alien features:
Do not simply say "alien."
They may suggest unusual perspective, curiosity about human habits or playful distance.

Zombie features:
Do not simply say "zombie."
They may suggest persistence, tired determination or showing up long after others stopped.

Glasses:
Do not simply say "glasses."
They may suggest focus, observation, curiosity, precision or careful judgment.

Strong colors:
Use them as mood signals, not as color descriptions.

Warm colors may suggest energy, friendliness or boldness.

Cool colors may suggest calm, patience, distance or focus.

Unusual combinations may suggest eccentricity, experimentation or playful chaos.

Expression:
The face should strongly influence the emotional tone.

A relaxed face should not speak like an aggressive trader.

A joyful face should not default to cynicism.

A tired face may still be hopeful.

A serious face may still be kind.

LAYER 3 — THE PRESENT MOMENT

After building the character, imagine one small moment from its life.

Possible moments include:
- beginning a build
- finishing something
- fixing something
- welcoming someone
- finding an artwork
- saving a memory
- preparing for the day
- returning home
- noticing something in the Hood
- sharing an idea
- carrying something useful
- taking a quiet break
- making a small decision
- continuing after a setback
- enjoying a harmless bit of chaos

The present moment adds freshness.

It should not overpower the character.

TRAIT INTERACTION

Traits must not be interpreted separately and then listed.

Merge them into one coherent personality.

Ask how the visual signals change one another.

Examples:

Builder + Coffee + Crown

Do not create three separate ideas about building, coffee and royalty.

Interpret the combination as something like:
a responsible morning leader who starts early and keeps things moving.

Collector + Camera + Flower

Interpret the combination as something like:
someone who preserves beautiful moments and gives them a lasting home.

Artist + Alien + Glasses

Interpret the combination as something like:
an observant outsider with an unusual way of seeing familiar things.

Builder + Bandage + Construction helmet

Interpret the combination as something like:
a practical worker who has been through a difficult build and returned anyway.

Degen + Backpack + Calm expression

Interpret the combination as something like:
an explorer who prepares carefully despite enjoying uncertainty.

The quote must come from the combined personality.

Do not output a list of trait references.

Do not cram multiple visible objects into the sentence.

Usually the traits should influence the meaning indirectly.

SILENT CHARACTER-BUILDING PROCESS

Before writing the quote, silently do the following:

1. Identify the native archetype.
2. Inspect the full artwork.
3. Identify the strongest expression and emotional mood.
4. Identify the most important visual traits.
5. Translate each important trait into a personality signal.
6. Decide how those signals interact.
7. Merge them into one believable character.
8. Imagine one authentic moment, habit, belief or observation from that character's life.
9. Choose a fresh angle not already used.
10. Write the simplest natural line that reveals that character.

Do not expose this reasoning.

Return only the requested JSON.

TRAIT PRIORITY

Traits are not decoration.

They are one of the primary sources of individuality.

Two Hoodies with the same archetype should sound different when their
visual traits are different.

The archetype provides direction.

The traits provide individuality.

The expression provides emotional tone.

The moment provides freshness.

Use at least two meaningful visual signals when the artwork contains them.

One dominant trait may lead the idea, but another trait or the expression
should shape how that idea is expressed.

Do not allow the archetype alone to produce the quote.

Do not allow every Builder to talk only about shipping.

Do not allow every Collector to talk only about holding.

Do not allow every Artist to talk only about color.

Do not allow every Degen to talk only about risk.

The individual traits must change the character.

CHARACTER ANGLES

A character angle is the underlying moment or idea, not the wording.

Possible kinds of angles include:
- a daily ritual
- a role in the neighborhood
- a private habit
- a small responsibility
- an unusual perspective
- a reason for collecting
- a reason for building
- a thing the Hoodie always carries
- a way the Hoodie helps
- a moment of recovery
- a quiet ambition
- a creative impulse
- a harmless weakness
- a small joy
- a reaction to another neighbor
- a memory worth keeping
- a task waiting to be finished
- a personal rule
- something the Hoodie notices
- something the Hoodie protects
- something the Hoodie is preparing for

PERSONALITY BALANCE

Across different generations, allow many kinds of personality:

- warm
- optimistic
- calm
- curious
- focused
- welcoming
- playful
- eccentric
- thoughtful
- adventurous
- quietly confident
- creatively chaotic
- patient
- resilient
- observant
- gentle
- energetic

Do not make every Hoodie sarcastic.

Do not make every Hoodie emotionally distant.

Do not make every Hoodie sound like it is trying to win an argument.

Do not make every Hoodie speak about markets, wallets, timelines,
commits or conviction.

POSITIVE CULTURAL DIRECTION

Prefer ideas such as:
- making something
- fixing something
- finding something meaningful
- giving art a home
- helping the neighborhood grow
- enjoying the process
- welcoming new people
- leaving something behind on-chain
- creating shared memories
- continuing after a setback
- noticing beauty, humor or possibility
- feeling at home in the Hood
- carrying a useful tool
- preparing for the next task
- preserving an important moment

Do not force these themes when they do not fit the character.

SOCIAL TONE

The line must not position the Hoodie as superior to the reader or other people.

Avoid:
- "I am better than you"
- "I understood before everyone else"
- "My wallet is smarter than your timeline"
- "You would not understand"
- insulting collectors, builders or projects
- dismissing people as tourists, exit liquidity or followers
- mocking another person's intelligence, taste, wealth or commitment
- self-deprecation about loneliness or social skills
- cynical statements presented as intelligence
- hostility disguised as confidence

Do not rely on comparisons involving "my X is better than your Y."

Do not address the reader as an opponent.

Confidence should come from knowing what the Hoodie enjoys, values,
creates or contributes.

HUMOR

Humor is welcome when it comes naturally from:
- the visual traits
- the expression
- a harmless habit
- an everyday web3 situation
- the Hoodie's personality
- a small neighborhood moment
- an unexpected interaction between traits

Humor should feel affectionate rather than hostile.

Do not make cruelty, contempt, loneliness or failure the joke.

VOICE

- Natural web3-native language from X or Discord.
- Clear and immediately understandable.
- Warm, direct and characterful.
- Confident without arrogance.
- Playful when appropriate.
- Specific to this Hoodie.
- Sounds spoken, not written by a brand.
- Feels like the Hoodie itself is talking.
- Simple words are better than manufactured cleverness.
- Contractions are natural.
- A sincere line is allowed.
- A quiet line is allowed.
- Not every quote needs a punchline.
- Avoid corporate language.
- Avoid generic motivational language.

QUALITY REFERENCES

Builder with morning energy:
"Second cup. Then we ship."

Builder with resilient traits:
"Patched up. Back to work."

Collector with a caring personality:
"The good ones deserve a home."

Collector with an observant personality:
"I keep the moments people scroll past."

Artist with playful traits:
"Left a little color on the block."

Explorer with prepared traits:
"Packed light. Brought the good ideas."

Calm leader:
"I'll open the shop."

Welcoming neighbor:
"There's room on this side."

These examples demonstrate character construction, warmth, clarity and
cultural fluency only.

Do not copy their wording, openings, subjects or sentence structures.

VARIETY RULE

Variation must come from a new character insight, behavior, situation,
emotion, activity or observation.

Do not create variety by replacing words with synonyms.

Do not paraphrase a previous quote.

Do not reuse the same relationship between two sentences.

Do not repeatedly return to:
- being smarter than others
- being earlier than others
- hype versus conviction
- acquisition versus keeping
- timelines versus wallets
- building versus talking
- outsiders versus insiders
- proving people wrong
- ignoring the floor
- surviving market conditions
- shipping as the only Builder idea
- holding as the only Collector idea

Those subjects may appear rarely when genuinely appropriate, but they
must not define the collection's voice.

PRIORITY

1. Native archetype.
2. Strongest visual traits.
3. Interaction between the traits.
4. Facial expression and emotional mood.
5. The culture of the Hood.
6. A small present-day moment.
7. Market context only when it genuinely adds something new.

The visual traits must materially affect the resulting character.

The final quote should not be interchangeable with another Hoodie of the same archetype.

HARD RULES

- Prefer 4 to 14 words.
- Never use more than 18 words.
- Use one or two short lines.
- No title.
- No explanation.
- No hashtags.
- No emoji.
- No quotation marks.

PUNCTUATION

- Use only normal keyboard punctuation.
- Never use the em dash (—).
- Never use the en dash (–).
- Never use ellipses (…).
- Prefer periods, commas, exclamation marks or line breaks.
- Write like someone posting naturally on X or Discord.

- Do not mention AI, API, metadata, prompts, endpoints, traits or archetypes.
- Do not list prices, ranks, percentages or raw market numbers.
- Do not explain the artwork.
- Do not name multiple traits in a list.
- Do not force floor, listing, offer, sale or holding commentary.
- Avoid abstract poetry.
- Avoid manufactured metaphors.
- Avoid superiority, contempt, hostility and cynical dunking.
- Avoid jokes about having no friends or poor social skills.
- Avoid the construction "my X is better than your Y."
- Do not sound like a motivational brand slogan.
- Use natural words freely.
- Freshness must come from the idea rather than a word blacklist.

RECENT QUOTES FROM THIS SESSION

${
  previousQuotes.length
    ? previousQuotes
        .map(
          (quote, index) =>
            `${index + 1}. ${quote}`,
        )
        .join("\n")
    : "None yet."
}

RECENT CHARACTER ANGLES FROM THIS SESSION

${
  previousAngles.length
    ? previousAngles
        .map(
          (angle, index) =>
            `${index + 1}. ${angle}`,
        )
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

ON-CHAIN CHARACTER HISTORY

${JSON.stringify(registry)}

Use the count as character history, not status or power. The current quote is part of this Hoodie’s continuity. A higher count should feel more familiar and rooted, never superior.

TOKEN DATA

${JSON.stringify(token)}

LIVE MARKET DATA

${JSON.stringify(market)}

Return valid JSON only in exactly this shape:

{
  "angle": "A short private description of the archetype, interacting visual signals and fresh character moment",
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
      { error: error instanceof Error ? error.message : "Unable to read Hood Talk registry." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const body = (await request.json()) as RequestBody;
    const tokenId = Number(body.tokenId);
    const walletAddress = body.walletAddress?.trim() || "";
    const imageDataUrl = body.imageDataUrl || "";
    const previousQuotes = limitHistory(body.previousQuotes, 8);
    const previousAngles = limitHistory(body.previousAngles, 8);

    if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 5999) {
      return NextResponse.json({ error: "Invalid token ID." }, { status: 400 });
    }
    if (!validWalletAddress(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
    }
    if (!imageDataUrl.startsWith("data:image/png;base64,")) {
      return NextResponse.json({ error: "Hoodie image is missing." }, { status: 400 });
    }

    const ownsToken = await verifyOnChainOwner(tokenId, walletAddress);
    if (!ownsToken) {
      return NextResponse.json(
        { error: "This Hoodie is not in the connected wallet." },
        { status: 403 },
      );
    }

    const registry = await readRegistryState(tokenId);
    const now = Math.floor(Date.now() / 1000);
    if (registry.nextUpdateAt > now) {
      return NextResponse.json(
        {
          error: "This Hoodie is resting before its next on-chain talk.",
          registry,
        },
        { status: 429 },
      );
    }

    const [tokenResponse, marketResponse] = await Promise.all([
      fetch(`${API_BASE}/v1/token/${tokenId}`, { cache: "no-store" }),
      fetch(`${API_BASE}/v1/market/token/${tokenId}`, { cache: "no-store" }),
    ]);

    if (!tokenResponse.ok) {
      return NextResponse.json({ error: "Unable to load token data." }, { status: 502 });
    }

    const token = await tokenResponse.json();
    const market = marketResponse.ok ? await marketResponse.json() : null;

    const continuityQuotes = registry.quote
      ? [...previousQuotes, registry.quote].slice(-8)
      : previousQuotes;

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
      result = await generateHoodTalk({
        apiKey,
        imageDataUrl,
        prompt: buildPrompt({
          token,
          market,
          registry,
          previousQuotes: continuityQuotes,
          previousAngles,
          retryNote: `
The first attempt was rejected.

Rebuild the character from the visual traits before writing again.
The new attempt must use a genuinely different character moment, remain warm,
avoid superiority, and continue the Hoodie’s on-chain history without paraphrasing it.
          `.trim(),
        }),
      });
    }

    if (
      !result ||
      !isValidQuote(result.quote) ||
      !isFreshEnough(result, continuityQuotes, previousAngles)
    ) {
      return NextResponse.json(
        { error: "The Hoodie needs a new angle. Try again." },
        { status: 502 },
      );
    }

    // Re-read immediately before signing so the signed count cannot be stale.
    const latestRegistry = await readRegistryState(tokenId);
    if (latestRegistry.count !== registry.count) {
      return NextResponse.json(
        { error: "The Hood Talk changed while generating. Please try again.", registry: latestRegistry },
        { status: 409 },
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
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Hood Talk generation failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate Hood Talk." },
      { status: 500 },
    );
  }
}
