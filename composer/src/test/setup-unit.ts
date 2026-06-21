import { beforeEach } from "vitest";
import { __resetPersistenceSettledForTests } from "@/lib/persistence-settled";
import { resetAllStores } from "@/test/stores";

beforeEach(async () => {
  await resetAllStores();
  __resetPersistenceSettledForTests();
});
