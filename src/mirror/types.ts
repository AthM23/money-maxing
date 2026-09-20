import type { QboClient } from "../connectors/qboClient.js";

/**
 * The three calls the mirror makes, and nothing else. The mirror is written against this rather than `QboClient` so a
 * test can hand it a fake that records every request: the point of the tests is the exact request sequence.
 */

/** Anything QuickBooks hands back that we keep: only the Id is relied on. */
export interface QboObject { Id: string; [field: string]: unknown }

/** One text file attached to one QuickBooks entity. */
export interface QboUpload {
  entity_type: string; // 'CreditMemo'
  entity_id: string;
  file_name: string;
  content_type: string; // 'text/plain'
  content: string;
}

/** `requestId` is QuickBooks' idempotency key (`requestid`): only a create that carries one is re-sent after a 5xx. */
export interface QboCreateOptions { requestId?: string }

export interface QboLike {
  create(entity: string, body: Record<string, unknown>, opts?: QboCreateOptions): Promise<QboObject>;
  query(sql: string): Promise<QboObject[]>;
  upload(file: QboUpload): Promise<QboObject>;
}

/** The JSON part of the multipart upload (`file_metadata_01`). Exported so the dry run shows exactly what would be sent. */
export function attachableMetadata(file: QboUpload): Record<string, unknown> {
  return {
    AttachableRef: [{ EntityRef: { type: file.entity_type, value: file.entity_id } }],
    FileName: file.file_name,
    ContentType: file.content_type,
  };
}

/** The real client behind the mirror's interface. */
export function qboLike(client: QboClient): QboLike {
  return {
    create: (entity, body, opts) => client.create<QboObject>(entity, body, opts?.requestId !== undefined ? { requestId: opts.requestId } : {}),
    query: (sql) => client.query<QboObject>(sql),
    upload: (file) => client.upload<QboObject>(attachableMetadata(file), { name: file.file_name, contentType: file.content_type, content: file.content }),
  };
}
