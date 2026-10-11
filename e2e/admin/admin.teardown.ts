import { test as teardown } from "@playwright/test";
import { removeE2eData } from "./support";

// Products, categories, colours and materials created by the admin specs use
// the prefixes "e2e-", "E2E %" and "E2E-%"; removing them keeps later runs
// and the pgTAP counts stable. Media rows and Storage files of e2e products
// go first so no orphans remain. The service role bypasses the "no delete
// while published" policy on purpose.
teardown("remove e2e data", async () => {
  await removeE2eData();
});
