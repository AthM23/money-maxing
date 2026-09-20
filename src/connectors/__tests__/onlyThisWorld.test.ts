import { describe, expect, it } from "vitest";
import { onlyThisWorld } from "../index.js";
import type { Connector, RawItem } from "../types.js";

const item = (external_id: string, recorded_time: string): RawItem => ({ source: "gmail", kind: "email", external_id, event_time: recorded_time, recorded_time, payload: {} });
const mailbox: Connector = {
  name: "gmail",
  pull: async () => [
    item("gj-m-advice-BTX-311", "2026-07-15T09:05:00Z"), // seeded for this world
    item("m-initech-2", "2026-06-28T15:00:00Z"), // seeded for the other world
    item("19f0ebe98c44d13d", "2026-06-28T15:00:00Z"), // the other world's copy that lost its world id: backdated, so a fixture
    item("1a02c4d5e6f70812", "2026-09-20T14:00:00Z"), // a person writing in today
  ],
};
const isSeeded = (id: string): boolean => !/^[0-9a-f]{16}$/.test(id);

describe("a live mailbox shared by two worlds", () => {
  it("keeps this world's seeded mail and what a person writes today; drops the other world's, with or without its world id", async () => {
    const got = await onlyThisWorld(mailbox, new Set(["gj-m-advice-BTX-311"]), "2026-08-31T23:59:59Z", isSeeded).pull();
    expect(got.map((i) => i.external_id)).toEqual(["gj-m-advice-BTX-311", "1a02c4d5e6f70812"]);
  });

  it("keeps this world's own mail even where the mailbox lost its world id", async () => {
    const lost: Connector = { name: "gmail", pull: async () => [{ ...item("19f0ebe98c44d13d", "2026-06-28T15:00:00Z"), payload: { date: "2026-06-28T15:00:00Z", from: "Morgan.Hale@northwind.test", subject: "Re: Renewal pricing" } }] };
    const ids = new Set(["m-initech-2", "2026-06-28T15:00:00Z|morgan.hale@northwind.test|Re: Renewal pricing"]);
    expect(await onlyThisWorld(lost, ids, "2026-08-31T23:59:59Z", isSeeded).pull()).toHaveLength(1);
  });

  it("stores written before worlds were recorded are not filtered at all", async () => {
    expect(await onlyThisWorld(mailbox, undefined, undefined, isSeeded).pull()).toHaveLength(4);
  });
});
