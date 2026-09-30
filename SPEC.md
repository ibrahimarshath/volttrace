# VoltTrace — Project Specification

**Catalogue topic:** Tokenization (Real-World Assets)
**Student:** Ibrahim
**Course:** Introduction to Smart Contracts with Solidity — Atria University × Amplificable
**Libraries:** OpenZeppelin ERC721, ERC721URIStorage, AccessControl

---

## 1. Problem Statement

EV battery packs have no tamper-proof, verifiable history. When a battery changes hands — from assembler to OEM to owner to recycler — there is no shared record of who held it, when, and whether it's legitimate. Stolen packs can be resold or quietly recycled. VoltTrace puts that record on-chain: one NFT passport per battery pack, custody restricted to approved participants, a regulator who can freeze stolen packs, and a recycler who closes the passport at end of life.

**Core guarantee:** a passport can never reach an unapproved address, and once it's flagged stolen or closed, it never moves again.

---

## 2. Roles

| Role | Who | What they do |
|---|---|---|
| Admin | Contract deployer | Approves and removes participants |
| Assembler | Pack assembler | Creates passports; sends them to an OEM |
| OEM | Vehicle manufacturer | Receives from Assembler; sends to an Owner |
| Owner | Vehicle owner / fleet operator | Receives from OEM or another Owner; sends to another Owner or a Recycler |
| Recycler | Certified recycler | Receives from an Owner; closes the passport |
| Regulator | Government regulator | Flags packs as stolen |

Each address can hold only one of these participant roles.

---

## 3. What Persists — State

| Variable | Type | Purpose |
|---|---|---|
| `_nextTokenId` | uint256 | Token ID counter, starting at 1 |
| Token ownership | ERC721 built-in | Maps token ID → current holder |
| `tokenURI` | ERC721URIStorage | Points to battery metadata on IPFS |
| `passports[tokenId]` | mapping → Passport struct | Battery ID, stage, stolen flag, creation time |
| `documents[tokenId]` | mapping → Document array | Append-only list of document records |
| `batteryIdUsed[hash]` | mapping(bytes32 => bool) | Prevents two passports for the same battery |
| Role constants | bytes32 constant | ASSEMBLER, OEM, OWNER, RECYCLER, REGULATOR |

**Passport struct:** battery ID (e.g. IN-MFGR-YYMM-BATCH-SERIAL), current stage, stolen flag, created-at timestamp.

**Document struct:** document hash, URI, who added it, when it was added.

---

## 4. Data Types

**Enum — Stage**

| Value | Stage | Meaning |
|---|---|---|
| 0 | Assembled | Held by the Assembler |
| 1 | WithOEM | Held by an OEM |
| 2 | WithOwner | Held by a vehicle Owner |
| 3 | WithRecycler | Held by a Recycler, awaiting closure |
| 4 | Closed | End of life; can never move again |

**Allowed transitions**

| From | To | Recipient must be |
|---|---|---|
| Assembled | WithOEM | OEM |
| WithOEM | WithOwner | Owner |
| WithOwner | WithOwner | Another Owner (resale) |
| WithOwner | WithRecycler | Recycler |
| WithRecycler | Closed | No transfer; the Recycler calls `closePassport` |

A stolen passport can't move from any stage.

---

## 5. What Can Act — Functions

**Admin functions**

| Function | Visibility | Who can call | Purpose |
|---|---|---|---|
| `constructor()` | — | Deploy only | Names the collection; gives the deployer the Admin role |
| `approveParticipant(address, bytes32)` | external | Admin | Adds an address to the allowlist with one role |
| `removeParticipant(address, bytes32)` | external | Admin | Removes an address (blocked if they hold a passport) |

**Lifecycle functions**

| Function | Visibility | Who can call | Purpose |
|---|---|---|---|
| `createPassport(string batteryId, string uri)` | external | Assembler | Mints a new passport at stage Assembled |
| `transferFrom` / `safeTransferFrom` | public (inherited) | Current holder | Moves the passport and advances its stage |
| `addDocument(uint256 tokenId, bytes32 docHash, string uri)` | external | Current holder | Appends a document record |
| `flagStolen(uint256 tokenId)` | external | Regulator | Permanently freezes the passport |
| `closePassport(uint256 tokenId)` | external | Recycler (current holder) | Sets the stage to Closed |

**View functions**

| Function | Visibility | Purpose |
|---|---|---|
| `getPassport(uint256 tokenId)` | external view | Returns battery ID, stage, stolen flag, created-at |
| `getStage(uint256 tokenId)` | external view | Returns the current stage |
| `isPassportStolen(uint256 tokenId)` | external view | Returns whether the pack is flagged |
| `getDocuments(uint256 tokenId)` | external view | Returns all document records |
| `isBatteryIdUsed(string batteryId)` | external view | Checks whether a battery already has a passport |
| `totalMinted()` | external view | Returns how many passports exist |

**How transfer rules are enforced:** all lifecycle checks run inside OpenZeppelin's internal `_update` hook, which every ERC-721 transfer passes through. This means `transferFrom` and `safeTransferFrom` can't be used to skip the rules. Burning is always rejected.

---

## 6. Who Can Act — Access Control

| Action | Restricted to |
|---|---|
| Approve or remove participants | Admin |
| Create a passport | Assembler |
| Transfer a passport | Current holder, only to the correct next role |
| Add a document | Current holder |
| Flag stolen | Regulator |
| Close a passport | Recycler who currently holds it, at stage WithRecycler |
| Read passport, stage, stolen status, documents | Anyone |

---

## 7. What Gets Reported — Events

| Event | When emitted | Parameters |
|---|---|---|
| `PassportCreated` | New passport minted | tokenId, batteryId, assembler |
| `StageAdvanced` | Passport moves to the next party | tokenId, from, to, newStage |
| `DocumentAdded` | Document attached | tokenId, docHash, uri, addedBy |
| `PackFlaggedStolen` | Regulator flags a pack | tokenId, flaggedBy |
| `PassportClosed` | Recycler closes the passport | tokenId, recycler |

---

## 8. Custom Errors

| Error | Thrown when |
|---|---|
| `EmptyBatteryId` | Battery ID is blank |
| `DuplicateBatteryId` | Battery ID already has a passport |
| `RecipientNotApproved` | Recipient doesn't have the required role |
| `InvalidTransition` | Transfer attempted from a stage that doesn't allow it |
| `PassportIsStolen` | Any action on a stolen passport |
| `PassportIsClosed` | Any action on a closed passport |
| `AlreadyFlaggedStolen` | Regulator flags the same pack twice |
| `NotPassportHolder` | Caller doesn't hold the passport |
| `NotReadyForClosure` | Closure attempted before stage WithRecycler |
| `InvalidDocument` | Document hash is empty or URI is blank |
| `BurnNotAllowed` | Attempt to send a passport to the zero address |

---

## 9. What Must Never Happen — Invariants

| # | Invariant |
|---|---|
| I1 | A passport must never be held by an address that isn't approved for its current stage |
| I2 | A stolen passport must never move again, and no documents can be added to it |
| I3 | A closed passport must never move again, and no documents can be added to it |
| I4 | A passport's stage only moves forward, along the allowed transitions |
| I5 | One battery ID must never have more than one passport |
| I6 | A document record, once added, must never be changed or removed |
| I7 | A passport must never be burned |
| I8 | Token ID 0 is never minted; the first passport is ID 1 |

---

## 10. Design Decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Access model | AccessControl roles | Ownable | Five participant types need different permissions; Ownable only supports one owner |
| Allowlist manager | Separate Admin | Regulator | Separation of duties: the party that flags fraud shouldn't also decide who participates |
| Enforcing rules | Inside `_update` | Custom `transfer()` | A custom function leaves `transferFrom` open as a bypass |
| Owner-to-Owner transfers | Allowed | Blocked | Vehicles get resold; blocking it would push resales off the record |
| Closing | Stage set to Closed | Burning the NFT | Burning deletes the record; history must stay viewable |
| Stolen flag | Permanent | Reversible | Matches approved description; prevents pressure to lift flags |
| Who adds documents | Current holder | Any participant | Whoever physically has the battery can attest to it |
| Documents on-chain | Hash + URI only | Full files | Storage is the most expensive operation; files live on IPFS |

---

## 11. Security Considerations

| Risk | How it's addressed |
|---|---|
| Unauthorised minting, flagging, closing | Role checks on every privileged function, each tested |
| Bypassing rules via `transferFrom` | All checks live in `_update`, which every transfer passes through |
| Transfer of stolen or closed pack | Checked in `_update` before any transfer |
| Passport stranded with unapproved address | Removing a participant who holds passports is blocked |
| Reentrancy | No Ether handled; external call in `safeTransferFrom` happens after state is updated |
| Duplicate passports for one battery | Battery ID hash checked before minting |
| Single admin key | Accepted for testnet demo; production would use a multisig |
| False data at entry | Out of scope; contract proves records weren't altered afterward |

Slither 0.11.6 was run. All findings were in OpenZeppelin library code. Zero genuine issues in VoltTrace.sol.

---

## 12. Gas Considerations

- Custom errors instead of revert strings
- Role identifiers as `constant`
- `calldata` for string parameters in external functions
- Duplicate check via mapping lookup, no loops
- `uint64` for timestamps, `bytes32` for hashes to pack storage slots

---

## 13. Test Plan

| # | Test | Type | Covers |
|---|---|---|---|
| T1 | Assembler creates a passport; stage, owner and event correct | Success | Core flow, I8 |
| T2 | Full lifecycle: Assembler → OEM → Owner → Recycler → Closed | Success | Core flow, I4 |
| T3 | Owner resells to another Owner | Success | Lifecycle |
| T4 | Holder adds a document; record stored and event emitted | Success | Documents |
| T5 | Non-assembler calls `createPassport` → reverts | Failure | Access control |
| T6 | Non-regulator calls `flagStolen` → reverts | Failure | Access control |
| T7 | Non-admin calls `grantRole` → reverts | Failure | Access control |
| T8 | Non-holder calls `addDocument` → reverts | Failure | Access control |
| T9 | Non-recycler calls `closePassport` → reverts | Failure | Access control, I4 |
| T10 | `transferFrom` to unapproved address → reverts | Failure | I1, bypass |
| T11 | Transfer to wrong role → reverts | Failure | I1, I4 |
| T12 | Stolen passport: transfer and addDocument both revert | Failure | I2 |
| T13 | Closed passport: transfer and addDocument both revert | Failure | I3 |
| T14 | Duplicate battery ID → reverts | Failure | I5 |
| T15 | Existing documents unchanged after later actions | Success | I6 |
| T16 | Transfer to zero address → reverts | Failure | I7 |
| T17 | Recycler cannot close at wrong stage → reverts | Failure | I1 |

17 tests total: 5 success, 12 failure.

---

## 14. Deployment

**Network:** Sepolia testnet
**Contract address:** `0x5288C0C8c67ea5E3Be693e4F42CfA4210515e44e`
**Verified on Blockscout:** https://eth-sepolia.blockscout.com/address/0x5288C0C8c67ea5E3Be693e4F42CfA4210515e44e#code
**Verified on Sourcify:** https://sourcify.dev/server/repo-ui/11155111/0x5288C0C8c67ea5E3Be693e4F42CfA4210515e44e

---

## 15. Scope Boundary

**In scope:** one passport per battery, participant allowlist, fixed lifecycle, stolen flag, closure, documents as hash + URI, events, tests, Sepolia deployment.

**Out of scope:** frontend, consortium governance, financial bonds, live BMS data, full EU field set, BPAN mapping, second-life operators, multiple battery types, real KYC, un-flagging stolen packs, pricing or payments.