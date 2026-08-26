import {
  activeChain,
  activeExplorerUrl,
  activeRpcUrl,
  appNetwork,
} from "./network";

/* -------------------------------------------------------------------------- */
/* Collection */
/* -------------------------------------------------------------------------- */

const mainnetCollectionAddress =
  process.env.NEXT_PUBLIC_HOODIES_MAINNET_ADDRESS?.trim() ||
  process.env.NEXT_PUBLIC_COLLECTION_ADDRESS?.trim() ||
  "0x9ec6c5b9f572a9b02138e553bc5f5882da735f45";

const testnetCollectionAddress =
  process.env.NEXT_PUBLIC_HOODIES_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Hood Talk */
/* -------------------------------------------------------------------------- */

const mainnetRegistryAddress =
  process.env.NEXT_PUBLIC_HOOD_TALK_REGISTRY_MAINNET_ADDRESS?.trim() || "";

const testnetRegistryAddress =
  process.env.NEXT_PUBLIC_HOOD_TALK_REGISTRY_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Renderer */
/* -------------------------------------------------------------------------- */

const mainnetRendererAddress =
  process.env.NEXT_PUBLIC_RENDERER_MAINNET_ADDRESS?.trim() ||
  process.env.NEXT_PUBLIC_RENDERER_ADDRESS?.trim() ||
  "";

const testnetRendererAddress =
  process.env.NEXT_PUBLIC_RENDERER_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Pixel Data */
/* -------------------------------------------------------------------------- */

const mainnetPixelDataAddress =
  process.env.NEXT_PUBLIC_PIXEL_DATA_MAINNET_ADDRESS?.trim() ||
  process.env.NEXT_PUBLIC_PIXEL_DATA_ADDRESS?.trim() ||
  "";

const testnetPixelDataAddress =
  process.env.NEXT_PUBLIC_PIXEL_DATA_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Builder Fund */
/* -------------------------------------------------------------------------- */

const mainnetBuilderFundAddress =
  "0xC7c165bA3fCf9244A45977D4809202b1DC803941";

const testnetBuilderFundAddress = "";

/* -------------------------------------------------------------------------- */
/* HoodOS */
/* -------------------------------------------------------------------------- */

const mainnetHoodOSAddress =
  process.env.NEXT_PUBLIC_HOODOS_MAINNET_ADDRESS?.trim() ||
  "0x1993c5515E81d2768f7F8D8a1e6e38Bbf4e4beB9";

const testnetHoodOSAddress =
  process.env.NEXT_PUBLIC_HOODOS_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* HoodWallet */
/* -------------------------------------------------------------------------- */

const mainnetGoatAddress =
  process.env.NEXT_PUBLIC_GOAT_MAINNET_ADDRESS?.trim() || "";

const testnetGoatAddress =
  process.env.NEXT_PUBLIC_GOAT_TESTNET_ADDRESS?.trim() || "";

const mainnetHoodWalletAddress =
  process.env.NEXT_PUBLIC_HOODWALLET_MAINNET_ADDRESS?.trim() ||
  "0x62DF5D2C60b9B434D017cf90765c4a96e0d486a5";

const testnetHoodWalletAddress =
  process.env.NEXT_PUBLIC_HOODWALLET_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Ping */
/* -------------------------------------------------------------------------- */

const mainnetPingAddress =
  process.env.NEXT_PUBLIC_PING_MAINNET_ADDRESS?.trim() ||
  "0xc7fe67AC39a6EDD78d5B842c6f42e11Da37eb17D";

const testnetPingAddress =
  process.env.NEXT_PUBLIC_PING_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Ping Activation Rewards */
/* -------------------------------------------------------------------------- */

const mainnetPingRewardVaultAddress =
  process.env.NEXT_PUBLIC_PING_REWARD_VAULT_MAINNET_ADDRESS?.trim() ||
  "0xCE3247CBeFb86f2fBD3EACdEf8d69C3ABd1CE2Ad";

const testnetPingRewardVaultAddress =
  process.env.NEXT_PUBLIC_PING_REWARD_VAULT_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Treasury Vault */
/* -------------------------------------------------------------------------- */

const mainnetTreasuryVaultAddress =
  process.env.NEXT_PUBLIC_TREASURY_VAULT_MAINNET_ADDRESS?.trim() ||
  "0xB4C949eF42a39BB1F37e81661Ddf95f08d5965EC";

const testnetTreasuryVaultAddress =
  process.env.NEXT_PUBLIC_TREASURY_VAULT_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Hood Delegation */
/* -------------------------------------------------------------------------- */

const mainnetHoodDelegationAddress =
  process.env.NEXT_PUBLIC_HOOD_DELEGATION_MAINNET_ADDRESS?.trim() ||
  "0x2C3046462bd09890C14c8A465ae4eDC41515A0c6";

const testnetHoodDelegationAddress =
  process.env.NEXT_PUBLIC_HOOD_DELEGATION_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* $OCH */
/* -------------------------------------------------------------------------- */

const mainnetOCHAddress =
  process.env.NEXT_PUBLIC_OCH_MAINNET_ADDRESS?.trim() ||
  "0x8BDD5adFF8A9D08372323d5BAF5e8e52605AF983";

const testnetOCHAddress =
  process.env.NEXT_PUBLIC_OCH_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* OCH Allocation Vault */
/* -------------------------------------------------------------------------- */

const mainnetOCHAllocationVaultAddress =
  process.env.NEXT_PUBLIC_OCH_ALLOCATION_VAULT_MAINNET_ADDRESS?.trim() ||
  "0x06749fF825EcEfAf4B9fdccdbD4FF4F3e0A2c6c3";

const testnetOCHAllocationVaultAddress =
  process.env.NEXT_PUBLIC_OCH_ALLOCATION_VAULT_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* OCH Team Vesting */
/* -------------------------------------------------------------------------- */

const mainnetOCHTeamVestingAddress =
  process.env.NEXT_PUBLIC_OCH_TEAM_VESTING_MAINNET_ADDRESS?.trim() ||
  "0x61793969bB3324def570071a226952238A2B6A95";

const testnetOCHTeamVestingAddress =
  process.env.NEXT_PUBLIC_OCH_TEAM_VESTING_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* OCH Liquidity Locker */
/* -------------------------------------------------------------------------- */

const mainnetOCHLiquidityLockerAddress =
  process.env.NEXT_PUBLIC_OCH_LIQUIDITY_LOCKER_MAINNET_ADDRESS?.trim() ||
  "0x05b234033E4F050A2a70E6E379a8D11288394DCd";

const testnetOCHLiquidityLockerAddress =
  process.env.NEXT_PUBLIC_OCH_LIQUIDITY_LOCKER_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* OCH Protocol Multisig */
/* -------------------------------------------------------------------------- */

const mainnetOCHProtocolMultisigAddress =
  process.env.NEXT_PUBLIC_OCH_PROTOCOL_MULTISIG_MAINNET_ADDRESS?.trim() ||
  "0x8779512111eBC8649080BF0dAa0C3C69CF0f7C5d";

const testnetOCHProtocolMultisigAddress =
  process.env.NEXT_PUBLIC_OCH_PROTOCOL_MULTISIG_TESTNET_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Site Config */
/* -------------------------------------------------------------------------- */

export const siteConfig = {
  name: "OnChainHoodies",
  shortName: "HOODIES",

  description:
    "A fully on-chain neighborhood built by builders for the people of Web3.",

  xUrl: "https://x.com/OnChainHoodies",

  githubUrl: "https://github.com/FILTER8/hoodies",

  mintbayUrl: "https://mintbay.xyz",

  discordUrl: "https://discord.com/invite/y6dHgccE7R",

  openSeaUrl:
    process.env.NEXT_PUBLIC_OPENSEA_URL?.trim() || "#",

  network: appNetwork,
  chain: activeChain,
  chainId: activeChain.id,
  chainName: activeChain.name,

  rpcUrl: activeRpcUrl,
  explorerUrl: activeExplorerUrl,

  /* ---------------------------------------------------------------------- */
  /* Core Contracts                                                         */
  /* ---------------------------------------------------------------------- */

  collectionAddress:
    appNetwork === "mainnet"
      ? mainnetCollectionAddress
      : testnetCollectionAddress,

  builderFundAddress:
    appNetwork === "mainnet"
      ? mainnetBuilderFundAddress
      : testnetBuilderFundAddress,

  hoodTalkRegistryAddress:
    appNetwork === "mainnet"
      ? mainnetRegistryAddress
      : testnetRegistryAddress,

  rendererAddress:
    appNetwork === "mainnet"
      ? mainnetRendererAddress
      : testnetRendererAddress,

  pixelDataAddress:
    appNetwork === "mainnet"
      ? mainnetPixelDataAddress
      : testnetPixelDataAddress,

  /* ---------------------------------------------------------------------- */
  /* HoodOS                                                                 */
  /* ---------------------------------------------------------------------- */

  hoodOSAddress:
    appNetwork === "mainnet"
      ? mainnetHoodOSAddress
      : testnetHoodOSAddress,

  hoodWalletAddress:
    appNetwork === "mainnet"
      ? mainnetHoodWalletAddress
      : testnetHoodWalletAddress,

  goatAddress:
    appNetwork === "mainnet"
      ? mainnetGoatAddress
      : testnetGoatAddress,

  /* ---------------------------------------------------------------------- */
  /* Ping                                                                   */
  /* ---------------------------------------------------------------------- */

  pingAddress:
    appNetwork === "mainnet"
      ? mainnetPingAddress
      : testnetPingAddress,

  pingRewardVaultAddress:
    appNetwork === "mainnet"
      ? mainnetPingRewardVaultAddress
      : testnetPingRewardVaultAddress,

  /* ---------------------------------------------------------------------- */
  /* Protocol Infrastructure                                                */
  /* ---------------------------------------------------------------------- */

  treasuryVaultAddress:
    appNetwork === "mainnet"
      ? mainnetTreasuryVaultAddress
      : testnetTreasuryVaultAddress,

  hoodDelegationAddress:
    appNetwork === "mainnet"
      ? mainnetHoodDelegationAddress
      : testnetHoodDelegationAddress,

  /* ---------------------------------------------------------------------- */
  /* OCH Protocol                                                           */
  /* ---------------------------------------------------------------------- */

  ochAddress:
    appNetwork === "mainnet"
      ? mainnetOCHAddress
      : testnetOCHAddress,

  ochAllocationVaultAddress:
    appNetwork === "mainnet"
      ? mainnetOCHAllocationVaultAddress
      : testnetOCHAllocationVaultAddress,

  ochTeamVestingAddress:
    appNetwork === "mainnet"
      ? mainnetOCHTeamVestingAddress
      : testnetOCHTeamVestingAddress,

  ochLiquidityLockerAddress:
    appNetwork === "mainnet"
      ? mainnetOCHLiquidityLockerAddress
      : testnetOCHLiquidityLockerAddress,

  ochProtocolMultisigAddress:
    appNetwork === "mainnet"
      ? mainnetOCHProtocolMultisigAddress
      : testnetOCHProtocolMultisigAddress,
};

/* -------------------------------------------------------------------------- */
/* Explorer Helpers */
/* -------------------------------------------------------------------------- */

export function shortAddress(address: string) {
  if (!address) return "Coming soon";

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function contractExplorerUrl(address: string) {
  if (!address) return "#";

  return `${siteConfig.explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

export function transactionExplorerUrl(hash: string) {
  if (!hash) return "#";

  return `${siteConfig.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}