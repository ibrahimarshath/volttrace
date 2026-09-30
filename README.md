
---

## Deployment

**Network:** Sepolia testnet
**Contract address:** `0x5288C0C8c67ea5E3Be693e4F42CfA4210515e44e`
**Verified on Blockscout:** https://eth-sepolia.blockscout.com/address/0x5288C0C8c67ea5E3Be693e4F42CfA4210515e44e#code
**Verified on Sourcify:** https://sourcify.dev/server/repo-ui/11155111/0x5288C0C8c67ea5E3Be693e4F42CfA4210515e44e

### Demonstration sequence

The following calls demonstrate the full lifecycle:

1. Admin grants roles to Assembler, OEM, Owner, Recycler and Regulator
2. Assembler creates passport `IN-ABCD-2610-B01-0001`
3. Assembler attaches a lab certificate (hash + IPFS URI)
4. Assembler transfers to OEM → stage advances to WithOEM
5. OEM transfers to Owner → stage advances to WithOwner
6. Owner transfers to Recycler → stage advances to WithRecycler
7. Recycler closes the passport → stage set to Closed
8. Second passport created → Regulator flags it stolen
9. Attempted transfer of stolen passport → reverts with PassportIsStolen

---

## What is out of scope

- Frontend, web portal, backend or mobile app
- Consortium and node governance
- Financial bonds and slashing
- Live BMS data streams and hardware attestation
- Full EU field set (~80 fields) and carbon footprint rating
- BPAN ID mapping (regulation still in draft)
- Second-life operators and refurbishment
- Multiple battery types
- Real KYC verification
- Un-flagging stolen batteries
- Marketplace, pricing or payments

---

## Libraries used

- [OpenZeppelin Contracts v5](https://github.com/OpenZeppelin/openzeppelin-contracts) — ERC721URIStorage and AccessControl
- [Hardhat v3](https://hardhat.org) — compilation, testing and deployment
- [ethers.js v6](https://docs.ethers.org) — contract interaction in tests

## AI assistance

Claude (Anthropic) was used to help draft the spec, scope document and portions of the contract and test code. Every line was reviewed and is understood by the author. The design decisions, invariants and security considerations are the author's own. 