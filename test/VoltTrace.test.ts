import { expect } from "chai";
import { network } from "hardhat";

describe("VoltTrace", function () {

  async function deployFixture() {
    const { ethers } = await network.connect();

    const [admin, assembler, oem, ownerA, ownerB, recycler, regulator, stranger] =
      await ethers.getSigners();

    const VoltTrace = await ethers.getContractFactory("VoltTrace");
    const contract = await VoltTrace.deploy();

    await contract.grantRole(await contract.ASSEMBLER_ROLE(), assembler.address);
    await contract.grantRole(await contract.OEM_ROLE(), oem.address);
    await contract.grantRole(await contract.OWNER_ROLE(), ownerA.address);
    await contract.grantRole(await contract.OWNER_ROLE(), ownerB.address);
    await contract.grantRole(await contract.RECYCLER_ROLE(), recycler.address);
    await contract.grantRole(await contract.REGULATOR_ROLE(), regulator.address);

    return { contract, ethers, admin, assembler, oem, ownerA, ownerB, recycler, regulator, stranger };
  }

  // ── T1 ────────────────────────────────────────────────────────────────
  it("T1: assembler can create a passport and stage is Assembled", async function () {
    const { contract, assembler } = await deployFixture();

    const tx = await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0001",
      "ipfs://bafkreiexample"
    );

    await expect(tx)
      .to.emit(contract, "PassportCreated")
      .withArgs(1n, "IN-ABCD-2610-B01-0001", assembler.address);

    expect(await contract.ownerOf(1n)).to.equal(assembler.address);
    expect(await contract.getStage(1n)).to.equal(0n);
    expect(await contract.totalMinted()).to.equal(1n);
  });

  // ── T2 ────────────────────────────────────────────────────────────────
  it("T2: full lifecycle Assembler → OEM → Owner → Recycler → Closed", async function () {
    const { contract, assembler, oem, ownerA, recycler } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0002",
      "ipfs://bafkreiexample2"
    );

    await contract.connect(assembler).transferFrom(assembler.address, oem.address, 1n);
    expect(await contract.getStage(1n)).to.equal(1n);

    await contract.connect(oem).transferFrom(oem.address, ownerA.address, 1n);
    expect(await contract.getStage(1n)).to.equal(2n);

    await contract.connect(ownerA).transferFrom(ownerA.address, recycler.address, 1n);
    expect(await contract.getStage(1n)).to.equal(3n);

    await contract.connect(recycler).closePassport(1n);
    expect(await contract.getStage(1n)).to.equal(4n);
  });

  // ── T3 ────────────────────────────────────────────────────────────────
  it("T3: owner can transfer to another owner (resale)", async function () {
    const { contract, assembler, oem, ownerA, ownerB } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0003",
      "ipfs://bafkreiexample3"
    );

    await contract.connect(assembler).transferFrom(assembler.address, oem.address, 1n);
    await contract.connect(oem).transferFrom(oem.address, ownerA.address, 1n);

    await contract.connect(ownerA).transferFrom(ownerA.address, ownerB.address, 1n);
    expect(await contract.getStage(1n)).to.equal(2n);
    expect(await contract.ownerOf(1n)).to.equal(ownerB.address);
  });

  // ── T4 ────────────────────────────────────────────────────────────────
  it("T4: holder can add a document and record is stored", async function () {
    const { contract, assembler } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0004",
      "ipfs://bafkreiexample4"
    );

    const docHash = "0x" + "ab".repeat(32);
    const uri = "ipfs://bafkreidocument";

    const tx = await contract.connect(assembler).addDocument(1n, docHash, uri);

    await expect(tx)
      .to.emit(contract, "DocumentAdded")
      .withArgs(1n, docHash, uri, assembler.address);

    const docs = await contract.getDocuments(1n);
    expect(docs.length).to.equal(1);
    expect(docs[0].docHash).to.equal(docHash);
    expect(docs[0].uri).to.equal(uri);
    expect(docs[0].addedBy).to.equal(assembler.address);
  });

  // ── T5 ────────────────────────────────────────────────────────────────
  it("T5: non-assembler cannot create a passport", async function () {
    const { contract, ethers, stranger } = await deployFixture();

    await expect(
      contract.connect(stranger).createPassport(
        "IN-ABCD-2610-B01-0005",
        "ipfs://bafkreiexample5"
      )
    ).to.revert(ethers);
  });

  // ── T6 ────────────────────────────────────────────────────────────────
  it("T6: non-regulator cannot flag a passport as stolen", async function () {
    const { contract, ethers, assembler, stranger } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0006",
      "ipfs://bafkreiexample6"
    );

    await expect(
      contract.connect(stranger).flagStolen(1n)
    ).to.revert(ethers);
  });

  // ── T7 ────────────────────────────────────────────────────────────────
  it("T7: non-admin cannot grant roles", async function () {
    const { contract, ethers, stranger } = await deployFixture();

    await expect(
      contract.connect(stranger).grantRole(
        await contract.ASSEMBLER_ROLE(),
        stranger.address
      )
    ).to.revert(ethers);
  });

  // ── T8 ────────────────────────────────────────────────────────────────
  it("T8: non-holder cannot add a document", async function () {
    const { contract, assembler, stranger } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0008",
      "ipfs://bafkreiexample8"
    );

    const docHash = "0x" + "cd".repeat(32);

    await expect(
      contract.connect(stranger).addDocument(1n, docHash, "ipfs://bafkreidoc2")
    ).to.be.revertedWithCustomError(contract, "NotPassportHolder");
  });

  // ── T9 ────────────────────────────────────────────────────────────────
  it("T9: non-recycler cannot close a passport", async function () {
    const { contract, ethers, assembler, stranger } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0009",
      "ipfs://bafkreiexample9"
    );

    await expect(
      contract.connect(stranger).closePassport(1n)
    ).to.revert(ethers);
  });

  // ── T10: Transfer to unapproved address via transferFrom ──────────────
  it("T10: transferFrom to unapproved address reverts", async function () {
    const { contract, assembler, stranger } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0010",
      "ipfs://bafkreiexample10"
    );

    await expect(
      contract.connect(assembler).transferFrom(assembler.address, stranger.address, 1n)
    ).to.be.revertedWithCustomError(contract, "RecipientNotApproved");
  });

  // ── T11: Transfer to wrong role reverts ───────────────────────────────
  it("T11: transfer to wrong role reverts (Assembler → Owner skipping OEM)", async function () {
    const { contract, assembler, ownerA } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0011",
      "ipfs://bafkreiexample11"
    );

    // Assembler tries to send directly to Owner, skipping OEM
    await expect(
      contract.connect(assembler).transferFrom(assembler.address, ownerA.address, 1n)
    ).to.be.revertedWithCustomError(contract, "RecipientNotApproved");
  });

  // ── T12: Stolen passport cannot move or receive documents ─────────────
  it("T12: stolen passport cannot be transferred or have documents added", async function () {
    const { contract, ethers, assembler, oem, regulator } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0012",
      "ipfs://bafkreiexample12"
    );

    await contract.connect(regulator).flagStolen(1n);
    expect(await contract.isPassportStolen(1n)).to.equal(true);

    // Transfer should fail
    await expect(
      contract.connect(assembler).transferFrom(assembler.address, oem.address, 1n)
    ).to.be.revertedWithCustomError(contract, "PassportIsStolen");

    // addDocument should fail
    const docHash = "0x" + "ef".repeat(32);
    await expect(
      contract.connect(assembler).addDocument(1n, docHash, "ipfs://bafkreidoc3")
    ).to.be.revertedWithCustomError(contract, "PassportIsStolen");
  });

  // ── T13: Closed passport cannot move or receive documents ─────────────
  it("T13: closed passport cannot be transferred or have documents added", async function () {
    const { contract, assembler, oem, ownerA, recycler } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0013",
      "ipfs://bafkreiexample13"
    );

    // Move to Closed
    await contract.connect(assembler).transferFrom(assembler.address, oem.address, 1n);
    await contract.connect(oem).transferFrom(oem.address, ownerA.address, 1n);
    await contract.connect(ownerA).transferFrom(ownerA.address, recycler.address, 1n);
    await contract.connect(recycler).closePassport(1n);

    // Transfer should fail
    await expect(
      contract.connect(recycler).transferFrom(recycler.address, ownerA.address, 1n)
    ).to.be.revertedWithCustomError(contract, "PassportIsClosed");

    // addDocument should fail
    const docHash = "0x" + "aa".repeat(32);
    await expect(
      contract.connect(recycler).addDocument(1n, docHash, "ipfs://bafkreidoc4")
    ).to.be.revertedWithCustomError(contract, "PassportIsClosed");
  });

  // ── T14: Duplicate battery ID reverts ────────────────────────────────
  it("T14: duplicate battery ID reverts", async function () {
    const { contract, assembler } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0014",
      "ipfs://bafkreiexample14"
    );

    await expect(
      contract.connect(assembler).createPassport(
        "IN-ABCD-2610-B01-0014",
        "ipfs://bafkreiexample14b"
      )
    ).to.be.revertedWithCustomError(contract, "DuplicateBatteryId");
  });

  // ── T15: Documents are immutable after being added ────────────────────
  it("T15: documents cannot be changed after being added", async function () {
    const { contract, assembler } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0015",
      "ipfs://bafkreiexample15"
    );

    const docHash = "0x" + "bb".repeat(32);
    await contract.connect(assembler).addDocument(1n, docHash, "ipfs://bafkreidoc5");

    // Add a second document to prove the first stays unchanged
    const docHash2 = "0x" + "cc".repeat(32);
    await contract.connect(assembler).addDocument(1n, docHash2, "ipfs://bafkreidoc6");

    const docs = await contract.getDocuments(1n);
    expect(docs.length).to.equal(2);
    expect(docs[0].docHash).to.equal(docHash); // First doc unchanged
    expect(docs[1].docHash).to.equal(docHash2);
  });

  // ── T16: Burning a passport reverts ──────────────────────────────────
  it("T16: burning a passport reverts", async function () {
    const { contract, assembler } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0016",
      "ipfs://bafkreiexample16"
    );

       await expect(
      contract.connect(assembler).transferFrom(
        assembler.address,
        "0x0000000000000000000000000000000000000000",
        1n
      )
    ).to.be.revertedWithCustomError(contract, "ERC721InvalidReceiver");
  });

  // ── T17: Wrong stage closure reverts ─────────────────────────────────
  it("T17: recycler cannot close a passport not at WithRecycler stage", async function () {
    const { contract, assembler, recycler } = await deployFixture();

    await contract.connect(assembler).createPassport(
      "IN-ABCD-2610-B01-0017",
      "ipfs://bafkreiexample17"
    );

    // Passport is still at Assembled, not WithRecycler
    await expect(
      contract.connect(recycler).closePassport(1n)
    ).to.be.revertedWithCustomError(contract, "NotPassportHolder");
  });

});