import { config } from "../config.ts";

let _key: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;
  _key = await crypto.subtle.importKey("raw", hexToBytes(config.SUBMISSION_KEY), { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);
  return _key;
}

// Zero IV: CBC with a zero IV on a single 16-byte block is deterministic (required for equality WHERE queries)
const ZERO_IV = new ArrayBuffer(16);

export async function encryptUserId(userId: number): Promise<string> {
  const key = await getKey();
  const plain = new ArrayBuffer(16);
  new DataView(plain).setBigInt64(0, BigInt(userId), false);
  const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ZERO_IV }, key, plain);
  return bytesToHex(new Uint8Array(cipher)); // 32 bytes → 64 hex chars
}

export async function decryptUserId(hex: string): Promise<number> {
  const key = await getKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ZERO_IV }, key, hexToBytes(hex));
  return Number(new DataView(plain).getBigInt64(0, false));
}

// Random IV: non-deterministic, used where equality queries are not needed.
// Stored as iv_hex (32 chars) + ciphertext_hex (64 chars) = 96 hex chars total.

export async function encryptSubmissionId(submissionId: string): Promise<string> {
  const key = await getKey();
  const plain = hexToBytes(submissionId.replace(/-/g, "")); // UUID → 16 bytes
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, plain);
  return bytesToHex(iv) + bytesToHex(new Uint8Array(cipher));
}

export async function decryptSubmissionId(encoded: string): Promise<string> {
  const key = await getKey();
  const iv = hexToBytes(encoded.slice(0, 32));
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, hexToBytes(encoded.slice(32)));
  const h = bytesToHex(new Uint8Array(plain));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return buf;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
