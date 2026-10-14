/** EIP-712 Seaport 1.6 single-order signature payload for the HUMAN Hoodie owner.
 * The owner signs off-chain. The HoodWallet validates that signature using ERC-1271.
 */
export const ORDER_TYPES = {
 OfferItem: [
  {name:'itemType',type:'uint8'}, {name:'token',type:'address'},
  {name:'identifierOrCriteria',type:'uint256'}, {name:'startAmount',type:'uint256'}, {name:'endAmount',type:'uint256'},
 ],
 ConsiderationItem: [
  {name:'itemType',type:'uint8'}, {name:'token',type:'address'},
  {name:'identifierOrCriteria',type:'uint256'}, {name:'startAmount',type:'uint256'}, {name:'endAmount',type:'uint256'},
  {name:'recipient',type:'address'},
 ],
 OrderComponents: [
  {name:'offerer',type:'address'}, {name:'zone',type:'address'},
  {name:'offer',type:'OfferItem[]'}, {name:'consideration',type:'ConsiderationItem[]'},
  {name:'orderType',type:'uint8'}, {name:'startTime',type:'uint256'}, {name:'endTime',type:'uint256'},
  {name:'zoneHash',type:'bytes32'}, {name:'salt',type:'uint256'},
  {name:'conduitKey',type:'bytes32'}, {name:'counter',type:'uint256'},
 ],
} as const;
export function signingDomain(chainId:number, verifyingContract:string) {
 return { name:'Seaport', version:'1.6', chainId, verifyingContract } as const;
}
export function orderValues(value: Record<string,unknown>) {
 const copy:Record<string,unknown> = { ...value };
 delete copy.totalOriginalConsiderationItems;
 return copy;
}
