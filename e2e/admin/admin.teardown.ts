import { test as teardown } from "@playwright/test";
import { serviceClient } from "./support";

// Products created by the admin specs use the slug prefix "e2e-"; removing
// them keeps later runs and the pgTAP counts stable. The service role
// bypasses the "no delete while published" policy on purpose.
teardown("remove e2e products", async () => {
  const { error } = await serviceClient()
    .from("product")
    .delete()
    .like("slug", "e2e-%");
  if (error) throw error;
});
