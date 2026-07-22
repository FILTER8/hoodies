import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type NetworkName = "mainnet" | "testnet";

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: string;
  error?: {
    code?: number;
    message?: string;
  };
};

type MetadataAttribute = {
  trait_type?: unknown;
  value?: unknown;
};

type TokenMetadata = {
  name?: unknown;
  attributes?: unknown;
  [key: string]: unknown;
};

type TraitDetail = {
  value: string | null;
  state: "present" | "none" | "suppressed-by-full-hood";
};

type NetworkConfiguration = {
  network: NetworkName;
  rpcUrl: string;
  contractAddress: string;
};

const TOKEN_URI_SELECTOR = "c87b56dd";

function getNetwork(): NetworkName {
  return process.env.NEXT_PUBLIC_NETWORK
    ?.trim()
    .toLowerCase() === "mainnet"
    ? "mainnet"
    : "testnet";
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeTokenId(value: string) {
  try {
    const tokenId = BigInt(value);

    return tokenId >= BigInt(0)
      ? tokenId
      : null;
  } catch {
    return null;
  }
}

function getNetworkConfiguration(): NetworkConfiguration {
  const network = getNetwork();

  if (network === "mainnet") {
    return {
      network,

      rpcUrl:
        process.env.ALCHEMY_RPC_URL_MAINNET?.trim() ||
        process.env.ROBINHOOD_MAINNET_RPC_URL?.trim() ||
        process.env.RPC_URL_MAINNET?.trim() ||
        "",

      contractAddress:
        process.env.NEXT_PUBLIC_COLLECTION_MAINNET_ADDRESS?.trim() ||
        process.env.NEXT_PUBLIC_COLLECTION_ADDRESS?.trim() ||
        "",
    };
  }

  return {
    network,

    rpcUrl:
      process.env.ALCHEMY_RPC_URL_TESTNET?.trim() ||
      process.env.ROBINHOOD_TESTNET_RPC_URL?.trim() ||
      process.env.RPC_URL_TESTNET?.trim() ||
      "",

    contractAddress:
      process.env.NEXT_PUBLIC_COLLECTION_TESTNET_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_COLLECTION_ADDRESS?.trim() ||
      "",
  };
}

function encodeTokenUriCall(tokenId: bigint) {
  return `0x${TOKEN_URI_SELECTOR}${tokenId
    .toString(16)
    .padStart(64, "0")}`;
}

function decodeAbiString(value: string) {
  if (
    !/^0x[0-9a-fA-F]*$/.test(value) ||
    value.length < 130
  ) {
    throw new Error(
      "The contract returned an invalid tokenURI response.",
    );
  }

  const hex = value.slice(2);

  const offsetBytes = Number.parseInt(
    hex.slice(0, 64),
    16,
  );

  const lengthPosition = offsetBytes * 2;

  const lengthBytes = Number.parseInt(
    hex.slice(
      lengthPosition,
      lengthPosition + 64,
    ),
    16,
  );

  const dataStart = lengthPosition + 64;
  const dataEnd = dataStart + lengthBytes * 2;

  if (
    !Number.isSafeInteger(offsetBytes) ||
    !Number.isSafeInteger(lengthBytes) ||
    dataEnd > hex.length
  ) {
    throw new Error(
      "The tokenURI string could not be decoded.",
    );
  }

  return Buffer.from(
    hex.slice(dataStart, dataEnd),
    "hex",
  ).toString("utf8");
}

function decodeDataUri(uri: string) {
  const comma = uri.indexOf(",");

  if (comma === -1) {
    throw new Error(
      "Malformed metadata data URI.",
    );
  }

  const header = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);

  const isBase64 = header
    .split(";")
    .includes("base64");

  return isBase64
    ? Buffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);
}

function normalizeIpfs(value: string) {
  if (value.startsWith("ipfs://ipfs/")) {
    return `https://ipfs.io/ipfs/${value.slice(
      "ipfs://ipfs/".length,
    )}`;
  }

  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.slice(
      "ipfs://".length,
    )}`;
  }

  return value;
}

async function readTokenUri(
  rpcUrl: string,
  contractAddress: string,
  tokenId: bigint,
) {
  const response = await fetch(rpcUrl, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        {
          to: contractAddress,
          data: encodeTokenUriCall(tokenId),
        },
        "latest",
      ],
    }),

    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `RPC returned HTTP ${response.status}.`,
    );
  }

  const data =
    (await response.json()) as JsonRpcResponse;

  if (data.error) {
    throw new Error(
      data.error.message ||
        "tokenURI call failed.",
    );
  }

  if (
    !data.result ||
    data.result === "0x"
  ) {
    throw new Error(
      "tokenURI returned no data. The token may not exist on the selected network.",
    );
  }

  return decodeAbiString(data.result);
}

async function readMetadata(
  tokenUri: string,
): Promise<TokenMetadata> {
  if (tokenUri.startsWith("data:")) {
    const decoded = decodeDataUri(tokenUri);

    return JSON.parse(
      decoded,
    ) as TokenMetadata;
  }

  const metadataUrl = normalizeIpfs(tokenUri);

  const response = await fetch(metadataUrl, {
    headers: {
      accept: "application/json",
    },

    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Metadata returned HTTP ${response.status}.`,
    );
  }

  return (await response.json()) as TokenMetadata;
}

function getAttributes(
  metadata: TokenMetadata,
): MetadataAttribute[] {
  if (!Array.isArray(metadata.attributes)) {
    return [];
  }

  return metadata.attributes.filter(
    (
      attribute,
    ): attribute is MetadataAttribute =>
      Boolean(
        attribute &&
          typeof attribute === "object",
      ),
  );
}

function findTrait(
  attributes: MetadataAttribute[],
  names: string[],
) {
  const acceptedNames = names.map(
    (name) =>
      name.trim().toLowerCase(),
  );

  const attribute = attributes.find(
    (item) => {
      const traitType =
        typeof item.trait_type === "string"
          ? item.trait_type
              .trim()
              .toLowerCase()
          : "";

      return acceptedNames.includes(
        traitType,
      );
    },
  );

  if (
    attribute?.value === undefined ||
    attribute.value === null
  ) {
    return null;
  }

  const value = String(
    attribute.value,
  ).trim();

  return value || null;
}

function createTraitDetail(
  value: string | null,
): TraitDetail {
  return {
    value,
    state: value
      ? "present"
      : "none",
  };
}

export async function GET(
  request: NextRequest,
) {
  const tokenIdValue =
    request.nextUrl.searchParams
      .get("tokenId")
      ?.trim() || "";

  const tokenId =
    normalizeTokenId(tokenIdValue);

  const {
    network,
    rpcUrl,
    contractAddress,
  } = getNetworkConfiguration();

  if (tokenId === null) {
    return NextResponse.json(
      {
        error: "Invalid token ID.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (!rpcUrl) {
    return NextResponse.json(
      {
        error:
          network === "mainnet"
            ? "Missing ALCHEMY_RPC_URL_MAINNET or ROBINHOOD_MAINNET_RPC_URL."
            : "Missing ALCHEMY_RPC_URL_TESTNET or ROBINHOOD_TESTNET_RPC_URL.",

        debug: {
          network,
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (!isAddress(contractAddress)) {
    return NextResponse.json(
      {
        error:
          network === "mainnet"
            ? "NEXT_PUBLIC_COLLECTION_MAINNET_ADDRESS is missing or invalid."
            : "NEXT_PUBLIC_COLLECTION_TESTNET_ADDRESS is missing or invalid.",

        debug: {
          network,
          contractAddress,
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const tokenUri = await readTokenUri(
      rpcUrl,
      contractAddress,
      tokenId,
    );

    const metadata =
      await readMetadata(tokenUri);

    const attributes =
      getAttributes(metadata);

    const hoodie =
      findTrait(attributes, [
        "Hoodie",
        "Hood",
        "Archetype",
      ]) || "Unknown";

    const dress = findTrait(
      attributes,
      [
        "Dress",
        "Clothes",
        "Clothing",
        "Body",
      ],
    );

    const mouth = findTrait(
      attributes,
      ["Mouth"],
    );

    const top = findTrait(
      attributes,
      [
        "Top",
        "Head",
        "Headwear",
      ],
    );

    const eyes = findTrait(
      attributes,
      [
        "Eyes",
        "Eye",
        "Eyewear",
      ],
    );

    return NextResponse.json(
      {
        collection: {
          name: "OnChainHoodies",
          contract: contractAddress,
        },

        token: {
          id: Number(tokenId),

          name:
            typeof metadata.name ===
              "string" &&
            metadata.name.trim()
              ? metadata.name.trim()
              : `OnChainHoodies #${tokenId.toString()}`,
        },

        image: {
          svg: `/api/hoodies/image?tokenId=${encodeURIComponent(
            tokenId.toString(),
          )}`,
        },

        traits: {
          hoodie,
          dress:
            createTraitDetail(dress),
          mouth:
            createTraitDetail(mouth),
          top:
            createTraitDetail(top),
          eyes:
            createTraitDetail(eyes),
        },

        debug: {
          network,
          contractAddress,
          rpcHost: safelyGetRpcHost(
            rpcUrl,
          ),
        },
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error(
      `Unable to load Hoodie #${tokenId.toString()} metadata`,
      {
        network,
        contractAddress,
        rpcHost:
          safelyGetRpcHost(rpcUrl),
        error,
      },
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read token metadata.",

        debug: {
          network,
          tokenId:
            tokenId.toString(),
          contractAddress,
          rpcHost:
            safelyGetRpcHost(rpcUrl),
        },
      },
      {
        status: 502,

        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

function safelyGetRpcHost(
  rpcUrl: string,
) {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-url";
  }
}