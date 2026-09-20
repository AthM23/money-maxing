/**
 * Trace ids are a pure function of the idempotency key, so the seeder can point a contract or a decision point
 * at evidence that ingestion has not loaded yet, and a re-ingest lands on the same id.
 */
export function traceId(source: string, externalId: string, version = 1): string {
  const slug = externalId.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `tr_${source}_${slug}${version > 1 ? `_v${version}` : ""}`;
}
