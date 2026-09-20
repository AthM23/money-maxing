import { describe, expect, it } from "vitest";
import { QboClient, type FetchLike } from "../../connectors/qboClient.js";
import { qboLike } from "../types.js";

interface Call { url: string; method: string; headers: Record<string, string>; body: string }

function clientWith(uploadResponse: unknown): { client: QboClient; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body ?? "" });
    const json = url.includes("oauth2") ? { access_token: "at", refresh_token: "rt", expires_in: 3600 } : uploadResponse;
    return new Response(JSON.stringify(json), { status: 200 });
  };
  const client = new QboClient({ clientId: "id", clientSecret: "secret", realmId: "123", refreshToken: "rt", baseUrl: "https://qbo.test" }, { fetch: fetchFn, onRefreshToken: () => {} });
  return { client, calls };
}

const FILE = { entity_type: "CreditMemo", entity_id: "900", file_name: "workpaper-dec_1.txt", content_type: "text/plain", content: "WORKPAPER dec_1\nünïcode – ok\n" };

describe("QboClient.upload through the mirror's adapter", () => {
  it("posts multipart/form-data with file_metadata_01 and file_content_01 to /upload, authenticated", async () => {
    const { client, calls } = clientWith({ AttachableResponse: [{ Attachable: { Id: "5000", FileName: FILE.file_name } }], time: "t" });
    const made = await qboLike(client).upload(FILE);
    expect(made.Id).toBe("5000");

    const call = calls.find((c) => c.url.includes("/upload"))!;
    expect(call.url).toBe("https://qbo.test/v3/company/123/upload?minorversion=75");
    expect(call.method).toBe("POST");
    expect(call.headers.Authorization).toBe("Bearer at");
    const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(call.headers["Content-Type"] ?? "")?.[1];
    expect(boundary).toBeTruthy();

    // parse it back the way a server would: the string body must be a well-formed form
    const form = await new Response(call.body, { headers: { "Content-Type": call.headers["Content-Type"]! } }).formData();
    expect([...form.keys()]).toEqual(["file_metadata_01", "file_content_01"]);
    const meta = form.get("file_metadata_01") as File;
    expect(meta.type).toBe("application/json");
    expect(JSON.parse(await meta.text())).toEqual({ AttachableRef: [{ EntityRef: { type: "CreditMemo", value: "900" } }], FileName: FILE.file_name, ContentType: "text/plain" });
    const content = form.get("file_content_01") as File;
    expect(content.name).toBe(FILE.file_name);
    expect(content.type).toBe("text/plain");
    expect(await content.text()).toBe(FILE.content);
  });

  it("turns a Fault inside AttachableResponse into an error", async () => {
    const { client } = clientWith({ AttachableResponse: [{ Fault: { type: "ValidationFault", Error: [{ Message: "Invalid Reference Id", code: "2500" }] } }] });
    await expect(qboLike(client).upload(FILE)).rejects.toThrow(/upload failed.*Invalid Reference Id/);
  });
});
