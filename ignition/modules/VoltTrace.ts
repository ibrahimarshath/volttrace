import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const VoltTraceModule = buildModule("VoltTraceModule", (m) => {
  const voltTrace = m.contract("VoltTrace");

  return { voltTrace };
});

export default VoltTraceModule;