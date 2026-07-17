import { assertProductionConfiguration } from "./lib/runtime-config";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertProductionConfiguration();
  }
}
