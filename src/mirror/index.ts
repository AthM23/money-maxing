import { QboClient, qboConfigFromEnv } from "../connectors/qboClient.js";
import { qboLike, type QboLike } from "./types.js";

export { JOURNAL_ENTRY_NOT_BUILT, MIRROR_SUBSCRIBER, MIRROR_TOPICS, NO_MAPPING, mirrorOnce } from "./mirror.js";
export type { MirrorOpts, MirrorResult, MirrorStatus, MirrorStep } from "./mirror.js";
export { applyCreditBody, centsToAmount, centsToDecimal, creditMemoBody, creditMemoDocNumber, paymentBody, sourceEmailText, workpaperText } from "./payloads.js";
export { tieOut, tieOutText } from "./tieout.js";
export type { TieOut, TieRow, TieSide, TieStatus } from "./tieout.js";
export { attachableMetadata, qboLike } from "./types.js";
export type { QboLike, QboObject, QboUpload } from "./types.js";

/** The real sandbox client from .env (and the rotated refresh-token file), the way the QuickBooks seeder builds it. Throws naming every missing variable. */
export function liveQboClient(env: Record<string, string | undefined> = process.env): QboLike {
  return qboLike(new QboClient(qboConfigFromEnv(env)));
}
