import { NextResponse } from "next/server";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  keccak256,
  randomBytes,
} from "ethers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAIN_ID = 4663;

const HOOD_BREAK_SCORES =
  "0xd520fD747949dd9C670d05f561aC3EEcFBb0ea16";

const HOOD_OS =
  "0x1993c5515E81d2768f7F8D8a1e6e38Bbf4e4beB9";

const PING =
  "0xc7fe67AC39a6EDD78d5B842c6f42e11Da37eb17D";

const HOOD_FRAME =
  "0x2bf9b2f4988d65bb54f9d9faff4a09af69c0ddd6";

const HOOD_ART =
  "0x1947095c30E458a8DEDF6BbD8E97C39e67256d51";

const EXPECTED_SIGNER =
  "0x206B9eD31717de68AB6a7Ab9AeccA9964642e015";

const HOOD_OS_ABI = [
  "function walletOf(uint256 tokenId) view returns (address)",
] as const;

const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
] as const;

type SignRequest = {
  hoodieId?: string | number;
  pingId?: string | number;
  frameId?: string | number;
  artId?: string | number;
  elapsedMs?: number;
  bricks?: number;
};

function sameAddress(
  a: string,
  b: string
) {
  return (
    a.toLowerCase() ===
    b.toLowerCase()
  );
}

function fail(
  error: string,
  status = 400
) {
  return NextResponse.json(
    {
      error,
    },
    {
      status,
    }
  );
}

export async function POST(
  request: Request
) {
  /*
   * IMPORTANT:
   * This route is intentionally a MAINNET INTEGRATION TEST signer.
   *
   * It proves the complete browser -> verifier -> HoodWallet -> score-contract
   * path for Hoodie #2. It DOES NOT independently replay/validate Hood Break
   * physics, so do not use this route as the public production verifier.
   *
   * Required env:
   * HOOD_BREAK_TEST_SIGNING=true
   * HOOD_BREAK_SIGNER_PRIVATE_KEY=0x...
   * ROBINHOOD_MAINNET_RPC_URL=https://...
   */
  if (
    process.env
      .HOOD_BREAK_TEST_SIGNING !==
    "true"
  ) {
    return fail(
      "Test score signing is disabled.",
      403
    );
  }

  const rpcUrl =
    process.env
      .ROBINHOOD_MAINNET_RPC_URL;

  const privateKey =
    process.env
      .HOOD_BREAK_SIGNER_PRIVATE_KEY;

  if (!rpcUrl) {
    return fail(
      "ROBINHOOD_MAINNET_RPC_URL is missing on the server.",
      500
    );
  }

  if (!privateKey) {
    return fail(
      "HOOD_BREAK_SIGNER_PRIVATE_KEY is missing on the server.",
      500
    );
  }

  let body: SignRequest;

  try {
    body =
      (await request.json()) as
        SignRequest;
  } catch {
    return fail(
      "Invalid JSON body."
    );
  }

  let hoodieId: bigint;
  let pingId: bigint;
  let frameId: bigint;
  let artId: bigint;

  try {
    hoodieId =
      BigInt(
        body.hoodieId ??
        ""
      );

    pingId =
      BigInt(
        body.pingId ??
        ""
      );

    frameId =
      BigInt(
        body.frameId ??
        ""
      );

    artId =
      BigInt(
        body.artId ??
        ""
      );
  } catch {
    return fail(
      "Invalid asset IDs."
    );
  }

  /*
   * For this first live integration test, deliberately restrict the signer
   * to Hoodie #2. Remove this restriction only when an authoritative
   * gameplay verifier replaces this test signer.
   */
  if (
    hoodieId !==
    BigInt(2)
  ) {
    return fail(
      "Live test signer is restricted to Hoodie #2.",
      403
    );
  }

  const elapsedMs =
    Math.trunc(
      Number(
        body.elapsedMs
      )
    );

  const bricks =
    Math.trunc(
      Number(
        body.bricks
      )
    );

  if (
    !Number.isSafeInteger(
      elapsedMs
    ) ||
    elapsedMs <=
      0 ||
    elapsedMs >
      4_294_967_295
  ) {
    return fail(
      "Invalid elapsedMs."
    );
  }

  if (
    !Number.isSafeInteger(
      bricks
    ) ||
    bricks <=
      0 ||
    bricks >
      4_294_967_295
  ) {
    return fail(
      "Invalid bricks."
    );
  }

  const provider =
    new JsonRpcProvider(
      rpcUrl,
      CHAIN_ID,
      {
        staticNetwork:
          true,
      }
    );

  const [
    network,
    latestBlock,
  ] =
    await Promise.all([
      provider.getNetwork(),
      provider.getBlock(
        "latest"
      ),
    ]);

  if (
    network.chainId !==
    BigInt(CHAIN_ID)
  ) {
    return fail(
      "Signer RPC is not Robinhood mainnet.",
      500
    );
  }

  if (!latestBlock) {
    return fail(
      "Unable to read latest block.",
      500
    );
  }

  const hoodOS =
    new Contract(
      HOOD_OS,
      HOOD_OS_ABI,
      provider
    );

  const canonicalWallet =
    String(
      await hoodOS.walletOf(
        hoodieId
      )
    );

  const [
    pingOwner,
    frameOwner,
    artOwner,
  ] =
    await Promise.all([
      new Contract(
        PING,
        ERC721_ABI,
        provider
      ).ownerOf(
        pingId
      ),
      new Contract(
        HOOD_FRAME,
        ERC721_ABI,
        provider
      ).ownerOf(
        frameId
      ),
      new Contract(
        HOOD_ART,
        ERC721_ABI,
        provider
      ).ownerOf(
        artId
      ),
    ]);

  if (
    !sameAddress(
      String(
        pingOwner
      ),
      canonicalWallet
    )
  ) {
    return fail(
      "Ping is not in the Hoodie HoodWallet."
    );
  }

  if (
    !sameAddress(
      String(
        frameOwner
      ),
      canonicalWallet
    )
  ) {
    return fail(
      "HoodFrame is not in the Hoodie HoodWallet."
    );
  }

  if (
    !sameAddress(
      String(
        artOwner
      ),
      canonicalWallet
    )
  ) {
    return fail(
      "HoodArt is not in the Hoodie HoodWallet."
    );
  }

  const signer =
    new Wallet(
      privateKey,
      provider
    );

  if (
    !sameAddress(
      signer.address,
      EXPECTED_SIGNER
    )
  ) {
    return fail(
      `Configured private key resolves to ${signer.address}, expected ${EXPECTED_SIGNER}.`,
      500
    );
  }

  const runId =
    keccak256(
      randomBytes(
        32
      )
    );

  const deadline =
    BigInt(
      latestBlock.timestamp +
        15 * 60
    );

  const domain = {
    name:
      "HoodBreakScores",
    version:
      "1",
    chainId:
      CHAIN_ID,
    verifyingContract:
      HOOD_BREAK_SCORES,
  };

  const types = {
    FullHoodRun: [
      {
        name:
          "hoodieId",
        type:
          "uint256",
      },
      {
        name:
          "pingId",
        type:
          "uint256",
      },
      {
        name:
          "frameId",
        type:
          "uint256",
      },
      {
        name:
          "artId",
        type:
          "uint256",
      },
      {
        name:
          "elapsedMs",
        type:
          "uint32",
      },
      {
        name:
          "bricks",
        type:
          "uint32",
      },
      {
        name:
          "runId",
        type:
          "bytes32",
      },
      {
        name:
          "deadline",
        type:
          "uint256",
      },
    ],
  };

  const signature =
    await signer.signTypedData(
      domain,
      types,
      {
        hoodieId,
        pingId,
        frameId,
        artId,
        elapsedMs,
        bricks,
        runId,
        deadline,
      }
    );

  return NextResponse.json(
    {
      signature,
      runId,
      deadline:
        deadline.toString(),
      hoodWallet:
        canonicalWallet,
      mode:
        "hoodie-2-live-test",
    },
    {
      headers: {
        "cache-control":
          "no-store",
      },
    }
  );
}
