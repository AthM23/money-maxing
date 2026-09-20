import { describe, expect, it } from "vitest";
import { openWorldDb } from "../../ledger/db.js";
import { generateWorld } from "../generate.js";
import { seedLocal } from "../local.js";
import { applySlackUserMap, slackUserMapFromEnv } from "../slackUsers.js";

const { world } = generateWorld();

describe("Slack user map", () => {
  it("changes nothing when no mapping is given: who plays which role is not guessed", () => {
    expect(slackUserMapFromEnv(world, {})).toEqual({});
    const db = openWorldDb();
    seedLocal(db, world);
    expect(applySlackUserMap(db, world, {})).toEqual({ owners: 0, approvers: 0 });
    expect(db.prepare("SELECT owner_user FROM party WHERE id = 'wayne'").get()).toEqual({ owner_user: "U_SAM" });
  });

  it("explicit map beats an email match, which beats the default", () => {
    const env = { SLACK_USER_MAP: '{"U_SAM":"UREAL1"}', SLACK_DEFAULT_USER: "UDEFAULT" };
    const map = slackUserMapFromEnv(world, env, { U_SAM: "UEMAIL", U_DANA: "UEMAIL2" });
    expect(map).toMatchObject({ U_SAM: "UREAL1", U_DANA: "UEMAIL2", U_CTRL: "UDEFAULT" });
  });

  it("puts real ids where Person A's transport reads them, keeps approver.id, and is idempotent", () => {
    const db = openWorldDb();
    seedLocal(db, world);
    const map = slackUserMapFromEnv(world, { SLACK_USER_MAP: '{"U_SAM":"UREAL1","U_CTRL":"UREAL2"}' });
    const first = applySlackUserMap(db, world, map);
    expect(first.approvers).toBe(1);
    expect(first.owners).toBe(world.parties.filter((p) => p.owner === "U_SAM").length);
    expect(applySlackUserMap(db, world, map)).toEqual(first);
    expect(db.prepare("SELECT owner_user FROM party WHERE id = 'wayne'").get()).toEqual({ owner_user: "UREAL1" });
    expect(db.prepare("SELECT owner_user FROM party WHERE id = 'initech'").get()).toEqual({ owner_user: "U_DANA" });
    // the transport's lookup: a click from UREAL2 is the controller, with the controller's limit
    expect(db.prepare("SELECT id, limit_cents FROM approver WHERE slack_user = 'UREAL2'").get()).toEqual({ id: "U_CTRL", limit_cents: 1_000_000 });
  });

  it("refuses a map that is not JSON or names someone the world does not have", () => {
    expect(() => slackUserMapFromEnv(world, { SLACK_USER_MAP: "U_SAM=U1" })).toThrow(/must be JSON/);
    expect(() => slackUserMapFromEnv(world, { SLACK_USER_MAP: '{"U_NOBODY":"U1"}' })).toThrow(/U_NOBODY/);
  });
});
