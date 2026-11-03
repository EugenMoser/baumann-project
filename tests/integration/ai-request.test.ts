import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { reserveRequest } from "@/lib/ai/limits";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN_A = "int-ai-request-a@example.test";
const ADMIN_B = "int-ai-request-b@example.test";
let adminA: SupabaseClient<Database>;
let adminB: SupabaseClient<Database>;

const service = () =>
  createClient<Database>(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

// The log is append-only for admins; the service role cleans up.
async function deleteRequestsOf(...clients: SupabaseClient<Database>[]) {
  for (const client of clients) {
    const { data } = await client.auth.getUser();
    if (data.user)
      await service()
        .from("ai_request")
        .delete()
        .eq("requested_by", data.user.id);
  }
}

// Start of the current calendar month in Europe/Berlin, like the database
// function. DST never switches on the 1st: April to October start in summer
// time.
function berlinMonthStart(now: Date): string {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .split("-");
  const summer = Number(month) >= 4 && Number(month) <= 10;
  return new Date(
    `${year}-${month}-01T00:00:00${summer ? "+02:00" : "+01:00"}`
  ).toISOString();
}

beforeAll(async () => {
  adminA = await sessionClient(ADMIN_A, true);
  adminB = await sessionClient(ADMIN_B, true);
});
afterAll(async () => {
  await deleteRequestsOf(adminA, adminB);
  await deleteUser(ADMIN_A);
  await deleteUser(ADMIN_B);
});

describe("reserve_ai_request (SC-7)", () => {
  // A race over HTTP is not deterministic; several rounds make a missing
  // lock show up reliably.
  it("two parallel reservations at limit - 1 yield one id and one monthly_cap", async () => {
    for (let round = 0; round < 10; round++) {
      const { count: existing, error } = await service()
        .from("ai_request")
        .select("id", { count: "exact", head: true })
        .gte("created_at", berlinMonthStart(new Date()));
      expect(error).toBeNull();
      const settings = { monthlyCap: (existing ?? 0) + 1, hourlyLimit: 1000 };

      const results = await Promise.all([
        reserveRequest(adminA, 1, settings),
        reserveRequest(adminB, 1, settings),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([
        { ok: false, error: "monthly_cap" },
      ]);
    }
  });
});
