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

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return buf;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
