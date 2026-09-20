/** Flatten a trace payload to the text a quote is checked against: every string leaf, in document order. */
export function payloadText(payloadJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return payloadJson;
  }
  const out: string[] = [];
  collect(parsed, out);
  return out.join("\n");
}

function collect(node: unknown, out: string[]): void {
  if (typeof node === "string") out.push(node);
  else if (typeof node === "number" || typeof node === "boolean") out.push(String(node));
  else if (Array.isArray(node)) for (const item of node) collect(item, out);
  else if (node && typeof node === "object") for (const value of Object.values(node)) collect(value, out);
}
