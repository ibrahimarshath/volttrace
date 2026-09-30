// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract VoltTrace is ERC721URIStorage, AccessControl {

    // ── Enums ─────────────────────────────────────────────────────────────
    enum Stage { Assembled, WithOEM, WithOwner, WithRecycler, Closed }

    // ── Structs ───────────────────────────────────────────────────────────
    struct Passport {
        string  batteryId;
        Stage   stage;
        bool    stolen;
        uint64  createdAt;
    }

    struct Document {
        bytes32 docHash;
        string  uri;
        address addedBy;
        uint64  addedAt;
    }

    // ── Roles ─────────────────────────────────────────────────────────────
    bytes32 public constant ASSEMBLER_ROLE = keccak256("ASSEMBLER_ROLE");
    bytes32 public constant OEM_ROLE       = keccak256("OEM_ROLE");
    bytes32 public constant OWNER_ROLE     = keccak256("OWNER_ROLE");
    bytes32 public constant RECYCLER_ROLE  = keccak256("RECYCLER_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    // ── State ─────────────────────────────────────────────────────────────
    uint256 private _nextTokenId = 1;

    mapping(uint256 => Passport)   private _passports;
    mapping(uint256 => Document[]) private _documents;
    mapping(bytes32 => bool)       private _batteryIdUsed;

    // ── Errors ────────────────────────────────────────────────────────────
    error EmptyBatteryId();
    error DuplicateBatteryId(string batteryId);
    error RecipientNotApproved(address to, Stage currentStage);
    error InvalidTransition(uint256 tokenId, Stage currentStage);
    error PassportIsStolen(uint256 tokenId);
    error PassportIsClosed(uint256 tokenId);
    error AlreadyFlaggedStolen(uint256 tokenId);
    error NotPassportHolder(uint256 tokenId, address caller);
    error NotReadyForClosure(uint256 tokenId, Stage currentStage);
    error InvalidDocument();
    error BurnNotAllowed(uint256 tokenId);

    // ── Events ────────────────────────────────────────────────────────────
    event PassportCreated(uint256 indexed tokenId, string batteryId, address indexed assembler);
    event StageAdvanced(uint256 indexed tokenId, Stage from, Stage to, address indexed newHolder);
    event DocumentAdded(uint256 indexed tokenId, bytes32 docHash, string uri, address indexed addedBy);
    event PackFlaggedStolen(uint256 indexed tokenId, address indexed regulator);
    event PassportClosed(uint256 indexed tokenId, address indexed recycler);

    // ── Constructor ───────────────────────────────────────────────────────
    constructor() ERC721("VoltTrace", "VLT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ── createPassport ────────────────────────────────────────────────────
    function createPassport(
        string calldata batteryId,
        string calldata uri
    ) external onlyRole(ASSEMBLER_ROLE) returns (uint256) {
        if (bytes(batteryId).length == 0) revert EmptyBatteryId();

        bytes32 idHash = keccak256(bytes(batteryId));
        if (_batteryIdUsed[idHash]) revert DuplicateBatteryId(batteryId);

        uint256 tokenId = _nextTokenId++;
        _batteryIdUsed[idHash] = true;

        _passports[tokenId] = Passport({
            batteryId: batteryId,
            stage:     Stage.Assembled,
            stolen:    false,
            createdAt: uint64(block.timestamp)
        });

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);

        emit PassportCreated(tokenId, batteryId, msg.sender);
        return tokenId;
    }

    // ── flagStolen ────────────────────────────────────────────────────────
    function flagStolen(uint256 tokenId)
        external onlyRole(REGULATOR_ROLE)
    {
        Passport storage p = _passports[tokenId];
        if (p.stolen) revert AlreadyFlaggedStolen(tokenId);
        if (p.stage == Stage.Closed) revert PassportIsClosed(tokenId);

        p.stolen = true;
        emit PackFlaggedStolen(tokenId, msg.sender);
    }

    // ── closePassport ─────────────────────────────────────────────────────
    function closePassport(uint256 tokenId)
        external onlyRole(RECYCLER_ROLE)
    {
        if (ownerOf(tokenId) != msg.sender) revert NotPassportHolder(tokenId, msg.sender);

        Passport storage p = _passports[tokenId];
        if (p.stolen) revert PassportIsStolen(tokenId);
        if (p.stage != Stage.WithRecycler) revert NotReadyForClosure(tokenId, p.stage);

        p.stage = Stage.Closed;
        emit PassportClosed(tokenId, msg.sender);
    }

    // ── addDocument ───────────────────────────────────────────────────────
    function addDocument(
        uint256 tokenId,
        bytes32 docHash,
        string calldata uri
    ) external {
        if (ownerOf(tokenId) != msg.sender) revert NotPassportHolder(tokenId, msg.sender);

        Passport storage p = _passports[tokenId];
        if (p.stolen) revert PassportIsStolen(tokenId);
        if (p.stage == Stage.Closed) revert PassportIsClosed(tokenId);
        if (docHash == bytes32(0) || bytes(uri).length == 0) revert InvalidDocument();

        _documents[tokenId].push(Document({
            docHash: docHash,
            uri:     uri,
            addedBy: msg.sender,
            addedAt: uint64(block.timestamp)
        }));

        emit DocumentAdded(tokenId, docHash, uri, msg.sender);
    }

    // ── View functions ────────────────────────────────────────────────────
    function getPassport(uint256 tokenId)
        external view
        returns (string memory batteryId, Stage stage, bool stolen, uint64 createdAt)
    {
        Passport storage p = _passports[tokenId];
        return (p.batteryId, p.stage, p.stolen, p.createdAt);
    }

    function getStage(uint256 tokenId) external view returns (Stage) {
        return _passports[tokenId].stage;
    }

    function isPassportStolen(uint256 tokenId) external view returns (bool) {
        return _passports[tokenId].stolen;
    }

    function getDocuments(uint256 tokenId) external view returns (Document[] memory) {
        return _documents[tokenId];
    }

    function isBatteryIdUsed(string calldata batteryId) external view returns (bool) {
        return _batteryIdUsed[keccak256(bytes(batteryId))];
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ── _update (transfer rules) ──────────────────────────────────────────
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }

        if (to == address(0)) revert BurnNotAllowed(tokenId);

        Passport storage p = _passports[tokenId];

        if (p.stolen) revert PassportIsStolen(tokenId);
        if (p.stage == Stage.Closed) revert PassportIsClosed(tokenId);

        Stage newStage;
        bytes32 requiredRole;

        if (p.stage == Stage.Assembled) {
            newStage     = Stage.WithOEM;
            requiredRole = OEM_ROLE;
        } else if (p.stage == Stage.WithOEM) {
            newStage     = Stage.WithOwner;
            requiredRole = OWNER_ROLE;
        } else if (p.stage == Stage.WithOwner) {
            if (hasRole(OWNER_ROLE, to)) {
                newStage     = Stage.WithOwner;
                requiredRole = OWNER_ROLE;
            } else if (hasRole(RECYCLER_ROLE, to)) {
                newStage     = Stage.WithRecycler;
                requiredRole = RECYCLER_ROLE;
            } else {
                revert RecipientNotApproved(to, p.stage);
            }
        } else {
            revert InvalidTransition(tokenId, p.stage);
        }

        if (!hasRole(requiredRole, to)) revert RecipientNotApproved(to, p.stage);

        Stage oldStage = p.stage;
        p.stage = newStage;

        emit StageAdvanced(tokenId, oldStage, newStage, to);

        return super._update(to, tokenId, auth);
    }

    // ── supportsInterface ─────────────────────────────────────────────────
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

}