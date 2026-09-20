export const WORLD_PATH = "world/northwind.json";
/** Gitignored, and outside anything a tool can reach: agents have no file tools and no table holds it. */
export const ANSWER_KEY_PATH = "world/answer-key.json";

/** The worlds a seeder can load. One database holds one world at a time; `--reset` before changing. */
export const WORLDS = {
  northwind: { path: WORLD_PATH, answer_key: ANSWER_KEY_PATH },
  "global-july": { path: "world/global-july.json", answer_key: "world/answer-key.global-july.json" },
} as const;
export type WorldName = keyof typeof WORLDS;

/** `--world=<name>` on the seed CLI, else `FOOTNOTE_WORLD`, else the Northwind world every existing test is built on. */
export function worldName(argv: string[] = [], env: NodeJS.ProcessEnv = process.env): WorldName {
  const raw = argv.find((a) => a.startsWith("--world="))?.split("=")[1] ?? env.FOOTNOTE_WORLD ?? "northwind";
  if (!(raw in WORLDS)) throw new Error(`--world must be one of ${Object.keys(WORLDS).join(", ")}`);
  return raw as WorldName;
}
