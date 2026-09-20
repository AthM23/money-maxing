export type SutName = "none" | "kernel-pack";

export interface CliOptions {
  stage: "min" | "all";
  baseline: boolean;
  seed: number;
  outcomesPath?: string;
  pack?: string;
  /** Absent means "none" (current behaviour) — kept optional, like outcomesPath and pack above,
   *  so a call site that never passes --sut sees exactly the CliOptions shape it always has. */
  sut?: SutName;
}

const DEFAULTS: CliOptions = { stage: "all", baseline: false, seed: 0 };

/** `--stage min|all` `--baseline` `--seed N` `--outcomes path.json` `--pack ap` `--sut none|kernel-pack`.
 *  Throws on anything it doesn't recognise — an unrecognised invocation is a harness error, not a silent no-op. */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { ...DEFAULTS };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case "--stage":
        options.stage = parseStage(requireValue(argv, i));
        i += 2;
        break;
      case "--baseline":
        options.baseline = true;
        i += 1;
        break;
      case "--seed":
        options.seed = parseSeed(requireValue(argv, i));
        i += 2;
        break;
      case "--outcomes":
        options.outcomesPath = requireValue(argv, i);
        i += 2;
        break;
      case "--pack":
        options.pack = requireValue(argv, i);
        i += 2;
        break;
      case "--sut":
        options.sut = parseSut(requireValue(argv, i));
        i += 2;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(argv: readonly string[], flagIndex: number): string {
  const value = argv[flagIndex + 1];
  if (value === undefined) {
    throw new Error(`${argv[flagIndex]} requires a value`);
  }
  return value;
}

function parseStage(value: string): "min" | "all" {
  if (value !== "min" && value !== "all") {
    throw new Error(`--stage must be "min" or "all", got "${value}"`);
  }
  return value;
}

function parseSeed(value: string): number {
  const seed = Number(value);
  if (!Number.isInteger(seed)) {
    throw new Error(`--seed must be an integer, got "${value}"`);
  }
  return seed;
}

function parseSut(value: string): SutName {
  if (value !== "none" && value !== "kernel-pack") {
    throw new Error(`--sut must be "none" or "kernel-pack", got "${value}"`);
  }
  return value;
}
