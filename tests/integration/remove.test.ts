import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runImportCli } from "../../scripts/import/cli.mts";
import { listObjects } from "../../scripts/import/images.mts";
import { runRemoveCli } from "../../scripts/import/remove.mts";
import {
  FIXTURE_IMAGES,
  copyFixtureSnapshot,
  importEnv,
  resetDatabase,
  serviceClient,
  silentIo,
  startImageServer,
  tableCounts,
} from "./import-helpers";

let server: Awaited<ReturnType<typeof startImageServer>>;
const client = serviceClient();
const host = () =>
  new URL(process.env.IMPORT_SUPABASE_URL ?? "http://invalid").host;

beforeAll(async () => {
  server = await startImageServer(FIXTURE_IMAGES);
  expect(
    await runImportCli(
      ["--snapshot", await copyFixtureSnapshot()],
      silentIo(importEnv(server.baseUrl))
    )
  ).toBe(0);
});

afterAll(async () => {
  await server.close();
  await resetDatabase();
});

describe("catalog:remove (FR-12, SC-12)", () => {
  it.each([
    [[]],
    [["--confirm", "other.example.test"]],
    [["--confirm", process.env.IMPORT_SUPABASE_URL ?? "x"]],
    [["--confirm", ""]],
  ])("refuses with %j and changes nothing (Review Focus 5)", async (args) => {
    const before = await tableCounts();
    const code = await runRemoveCli(args, silentIo(importEnv(server.baseUrl)));
    expect([1, 2]).toContain(code);
    expect(await tableCounts()).toEqual(before);
  });

  it("removes every catalog row and every object with the right host", async () => {
    const io = silentIo(importEnv(server.baseUrl));
    expect(await runRemoveCli(["--", "--confirm", host()], io)).toBe(0);
    const counts = await tableCounts();
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
    const listed = await listObjects(
      client.storage.from("catalog"),
      "products"
    );
    expect(listed.ok && listed.value).toEqual([]);
    expect(io.lines.join("\n")).toContain("products:");
  });
});
