export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | true>;
}

/** `--name value` or a bare `--name`. Anything else is positional. A flag is only a switch if it is in `switches`. */
export function parseArgs(argv: readonly string[], switches: readonly string[] = []): ParsedArgs {
  const parsed: ParsedArgs = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (switches.includes(name)) {
      parsed.flags[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
    parsed.flags[name] = value;
    i += 1;
  }
  return parsed;
}

export function flagString(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.flags[name];
  return typeof v === "string" ? v : undefined;
}

export function flagInt(parsed: ParsedArgs, name: string): number | undefined {
  const v = flagString(parsed, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a non-negative whole number, got "${v}"`);
  return n;
}

export const out = (line: string): void => { process.stdout.write(`${line}\n`); };
export const warn = (line: string): void => { process.stderr.write(`${line}\n`); };

/** Run a CLI main, turn a throw into one line on stderr (no stack), and exit with its code. */
export function runCli(main: () => Promise<number> | number): void {
  Promise.resolve().then(main).then((code) => process.exit(code), (err: unknown) => {
    warn(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
