/**
 * provision-auth — generate the single MBA-Vault user's login credentials.
 *
 * Runs LOCALLY on your laptop (never on the server). It prints an argon2id
 * password hash, a TOTP secret (with a QR to scan), and a session secret,
 * formatted as the env vars the app reads. Paste them into the box's auth env
 * file and redeploy. The plaintext password is never written anywhere.
 *
 * Usage:
 *   npm run provision:auth                      # interactive: prompts for username + password
 *   AUTH_USERNAME=sabih npm run provision:auth  # username from env, password prompted
 *   printf 'the-password' | tsx scripts/provision-auth.ts sabih   # non-interactive (scripting)
 */
import { createInterface } from "node:readline/promises";
import { toString as renderQr } from "qrcode";
import { verify } from "@node-rs/argon2";
import {
  hashPassword,
  newTotpSecret,
  buildTotp,
  totpUri,
  generateSessionSecret,
  TOTP_ISSUER,
} from "../src/lib/auth/provision";

const MIN_PASSWORD_LENGTH = 12;

// Control characters seen while reading a raw-mode TTY.
const ENTER = ["\n", "\r"];
const CTRL_D = String.fromCharCode(4); // Ctrl-D (EOT)
const CTRL_C = String.fromCharCode(3); // Ctrl-C (ETX)
const BACKSPACE = [String.fromCharCode(127), String.fromCharCode(8)]; // DEL, Backspace

async function main(): Promise<void> {
  const username = await resolveUsername();
  const password = await resolvePassword();

  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const passwordHash = await hashPassword(password);
  const totpSecret = newTotpSecret();
  const sessionSecret = generateSessionSecret();

  // Never emit a credential we haven't proven round-trips.
  if (!(await verify(passwordHash, password))) fail("internal: password hash did not verify");
  const totp = buildTotp(username, totpSecret);
  if (totp.validate({ token: totp.generate(), window: 1 }) === null) {
    fail("internal: TOTP self-check failed");
  }

  const qr = await renderQr(totpUri(username, totpSecret), { type: "terminal", small: true });

  process.stdout.write(
    [
      "",
      "✓ argon2id hash verified · TOTP self-check passed",
      "",
      "Scan with your authenticator app (Google Authenticator, Authy, 1Password …):",
      "",
      qr,
      "Can't scan? Enter manually:",
      `  Account:  ${TOTP_ISSUER} (${username})`,
      `  Key:      ${totpSecret}`,
      "  Type:     TOTP · SHA1 · 6 digits · 30s period",
      "",
      "─".repeat(72),
      "Add these to the box's auth env file — DO NOT commit (this repo is public):",
      "",
      `SESSION_SECRET=${sessionSecret}`,
      `AUTH_USERNAME=${username}`,
      `AUTH_PASSWORD_HASH=${passwordHash}`,
      `TOTP_SECRET=${totpSecret}`,
      "",
      "The plaintext password is not stored anywhere — only its argon2id hash.",
      "",
    ].join("\n"),
  );
}

/** Username from the first CLI arg, then AUTH_USERNAME, then an interactive prompt. */
async function resolveUsername(): Promise<string> {
  const candidate =
    process.argv[2]?.trim() ||
    process.env.AUTH_USERNAME?.trim() ||
    (process.stdin.isTTY ? await promptLine("Username: ") : "");
  if (!candidate) {
    fail("username required — pass it as the first argument, set AUTH_USERNAME, or run in a terminal");
  }
  if (!/^[\w.@-]{1,64}$/.test(candidate)) {
    fail("username may contain only letters, digits and . _ - @ (max 64 chars)");
  }
  return candidate;
}

/** Password from a hidden prompt (interactive) or from stdin (piped, for scripting). */
async function resolvePassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const piped = (await readAllStdin()).replace(/\r?\n$/, "");
    if (!piped) fail("no password received on stdin");
    return piped;
  }
  const pw = await promptHidden("Password: ");
  const confirm = await promptHidden("Confirm password: ");
  if (pw !== confirm) fail("passwords did not match");
  return pw;
}

async function promptLine(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(query)).trim();
  } finally {
    rl.close();
  }
}

/** Read a line without echoing it (raw mode), handling backspace and Ctrl-C. */
function promptHidden(query: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    let buf = "";
    const onData = (data: Buffer): void => {
      for (const ch of data.toString("utf8")) {
        if (ENTER.includes(ch) || ch === CTRL_D) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(buf);
          return;
        }
        if (ch === CTRL_C) {
          stdout.write("\n");
          process.exit(130);
        } else if (BACKSPACE.includes(ch)) {
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function fail(message: string): never {
  console.error(`provision-auth: ${message}`);
  process.exit(1);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
