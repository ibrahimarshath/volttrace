import { network } from "hardhat";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function pause(msg: string): Promise<void> {
  return new Promise((resolve) => {
    rl.question(`\n⏎  ${msg} — press Enter to continue...`, () => {
      resolve();
    });
  });
}

async function main() {
  const { ethers } = await network.connect();

  console.log("\n" + "=".repeat(55));
  console.log("   🔋 VoltTrace — Interactive Demo");
  console.log("=".repeat(55));

  // ── Deploy ───────────────────────────────────────────
  await pause("Deploy the VoltTrace contract");
  const [admin, assembler, oem, ownerA, ownerB, recycler, regulator] =
    await ethers.getSigners();
  const VoltTrace = await ethers.getContractFactory("VoltTrace");
  const contract = await VoltTrace.deploy();
  console.log(`\n✅ Contract deployed at: ${await contract.getAddress()}`);

  // ── Grant roles ──────────────────────────────────────
  await pause("Grant roles to all participants");
  await contract.grantRole(await contract.ASSEMBLER_ROLE(), assembler.address);
  await contract.grantRole(await contract.OEM_ROLE(), oem.address);
  await contract.grantRole(await contract.OWNER_ROLE(), ownerA.address);
  await contract.grantRole(await contract.OWNER_ROLE(), ownerB.address);
  await contract.grantRole(await contract.RECYCLER_ROLE(), recycler.address);
  await contract.grantRole(await contract.REGULATOR_ROLE(), regulator.address);
  console.log(`\n✅ Roles granted:`);
  console.log(`   Assembler  → ${assembler.address}`);
  console.log(`   OEM        → ${oem.address}`);
  console.log(`   Owner A    → ${ownerA.address}`);
  console.log(`   Owner B    → ${ownerB.address}`);
  console.log(`   Recycler   → ${recycler.address}`);
  console.log(`   Regulator  → ${regulator.address}`);

  // ── Create passport ──────────────────────────────────
  await pause("Assembler creates battery passport IN-ABCD-2610-B01-0001");
  await contract.connect(assembler).createPassport(
    "IN-ABCD-2610-B01-0001",
    "ipfs://bafkreiexample"
  );
  let stage = await contract.getStage(1n);
  console.log(`\n✅ Passport #1 created`);
  console.log(`   Battery ID : IN-ABCD-2610-B01-0001`);
  console.log(`   Stage      : ${stage} → Assembled`);
  console.log(`   Owner      : ${assembler.address}`);

  // ── Add document ─────────────────────────────────────
  await pause("Assembler attaches a lab certificate (hash + IPFS URI)");
  const docHash = "0x" + "ab".repeat(32);
  await contract.connect(assembler).addDocument(
    1n,
    docHash,
    "ipfs://bafkreilabcertificate"
  );
  console.log(`\n✅ Document attached`);
  console.log(`   Hash : ${docHash.slice(0, 20)}...`);
  console.log(`   URI  : ipfs://bafkreilabcertificate`);

  // ── Assembler → OEM ──────────────────────────────────
  await pause("Assembler transfers passport to OEM");
  await contract.connect(assembler).transferFrom(
    assembler.address, oem.address, 1n
  );
  stage = await contract.getStage(1n);
  console.log(`\n✅ Passport transferred to OEM`);
  console.log(`   Stage : ${stage} → WithOEM`);

  // ── OEM → Owner A ────────────────────────────────────
  await pause("OEM transfers passport to Owner A");
  await contract.connect(oem).transferFrom(
    oem.address, ownerA.address, 1n
  );
  stage = await contract.getStage(1n);
  console.log(`\n✅ Passport transferred to Owner A`);
  console.log(`   Stage : ${stage} → WithOwner`);

  // ── Owner A → Owner B (resale) ───────────────────────
  await pause("Owner A resells the vehicle — transfers passport to Owner B");
  await contract.connect(ownerA).transferFrom(
    ownerA.address, ownerB.address, 1n
  );
  stage = await contract.getStage(1n);
  console.log(`\n✅ Passport transferred to Owner B`);
  console.log(`   Stage : ${stage} → WithOwner (resale keeps same stage)`);

  // ── Owner B → Recycler ───────────────────────────────
  await pause("Owner B sends battery to Certified Recycler");
  await contract.connect(ownerB).transferFrom(
    ownerB.address, recycler.address, 1n
  );
  stage = await contract.getStage(1n);
  console.log(`\n✅ Passport transferred to Recycler`);
  console.log(`   Stage : ${stage} → WithRecycler`);

  // ── Close passport ───────────────────────────────────
  await pause("Recycler closes the passport — end of life");
  await contract.connect(recycler).closePassport(1n);
  stage = await contract.getStage(1n);
  console.log(`\n✅ Passport permanently closed`);
  console.log(`   Stage : ${stage} → Closed`);

  // ── Final record ─────────────────────────────────────
  await pause("Read the final passport record on-chain");
  const passport = await contract.getPassport(1n);
  const docs = await contract.getDocuments(1n);
  console.log(`\n📋 Final passport record:`);
  console.log(`   Battery ID : ${passport.batteryId}`);
  console.log(`   Stage      : ${passport.stage} (Closed)`);
  console.log(`   Stolen     : ${passport.stolen}`);
  console.log(`   Documents  : ${docs.length}`);

  // ── Stolen demo ──────────────────────────────────────
  console.log("\n" + "=".repeat(55));
  console.log("   🚨 Stolen Battery Demo");
  console.log("=".repeat(55));

  await pause("Assembler creates a second passport");
  await contract.connect(assembler).createPassport(
    "IN-ABCD-2610-B01-0002",
    "ipfs://bafkreiexample2"
  );
  console.log(`\n✅ Passport #2 created — Battery: IN-ABCD-2610-B01-0002`);

  await pause("Regulator flags passport #2 as STOLEN");
  await contract.connect(regulator).flagStolen(2n);
  const stolen = await contract.isPassportStolen(2n);
  console.log(`\n✅ Passport #2 flagged`);
  console.log(`   isStolen : ${stolen}`);

  await pause("Try to transfer the stolen passport to OEM — should fail");
  try {
    await contract.connect(assembler).transferFrom(
      assembler.address, oem.address, 2n
    );
    console.log("Transfer succeeded — this should not happen!");
  } catch (error: any) {
    console.log(`\n❌ Transfer REJECTED`);
    console.log(`   Error : PassportIsStolen`);
    console.log(`   The stolen passport can never move again.`);
  }

  console.log("\n" + "=".repeat(55));
  console.log(`\n✅ Demo complete. All invariants hold.`);
  console.log(`   Total passports minted: ${await contract.totalMinted()}`);
  console.log("\n" + "=".repeat(55) + "\n");

  rl.close();
}

main().catch((error) => {
  console.error(error);
  rl.close();
  process.exit(1);
});