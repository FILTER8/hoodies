export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
export const ROBINHOOD_TESTNET_CHAIN_HEX = "0xb626";
export const ROBINHOOD_TESTNET_RPC_URL =
  "https://rpc.testnet.chain.robinhood.com";
export const ROBINHOOD_TESTNET_EXPLORER_URL =
  "https://explorer.testnet.chain.robinhood.com";

export const HOOD_TALK_REGISTRY_ABI = [
  {
    type: "function",
    name: "getHoodTalk",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "quote", type: "string" },
      { name: "author", type: "address" },
      { name: "updatedAt", type: "uint64" },
      { name: "count", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "nextUpdateAt",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "setHoodTalk",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "quote", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hoodies",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "authorizedSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "HoodTalkUpdated",
    anonymous: false,
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "count", type: "uint32", indexed: false },
      { name: "updatedAt", type: "uint64", indexed: false },
      { name: "quote", type: "string", indexed: false },
    ],
  },
] as const;

export const ERC721_OWNER_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
