// Generates the dev TLS pair used by Next.js, scripts/dev-tls.ts, and the Go API.
//   bun scripts/gen-cert.ts [extra-address]
//
// Solid-OIDC needs crypto.subtle, which browsers expose only in a secure context,
// so every host-facing port speaks TLS. The certificate must cover every name a
// client will use:
//   - localhost and 127.0.0.1, which the default stack is pinned to
//   - any address passed as an argument, kept for setups that serve the LAN
// An extra SAN does not move the issuer: Community Solid Server accepts one
// identifier space (`-b` / CSS_BASE_URL), so the browser origin must match it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const certsDir = resolve(import.meta.dir, "..", "certs");
const crtPath = resolve(certsDir, "chainify.crt");
const keyPath = resolve(certsDir, "chainify.key");
const openSslConfig = resolve(certsDir, "chainify.openssl.cnf");

const extraAddress = process.argv[2]?.trim() ?? "";
if (extraAddress && !/^\d{1,3}(\.\d{1,3}){3}$/.test(extraAddress)) {
  throw new Error(`expected an IPv4 address, got "${extraAddress}"`);
}

mkdirSync(certsDir, { recursive: true });

// IP SANs are written as "IP:" entries; DNS SANs as "DNS:" entries. A client
// verifying an https URL that uses an IP literal only accepts an IP SAN.
const altEntries = ["DNS.1 = localhost", "IP.1  = 127.0.0.1"];
if (extraAddress) {
  altEntries.push(`IP.2  = ${extraAddress}`);
}

const config = `[req]
distinguished_name = dn
x509_extensions = v3
prompt = no

[dn]
CN = chainify-dev

[v3]
basicConstraints = critical, CA:TRUE
keyUsage = critical, digitalSignature, keyCertSign, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt

[alt]
${altEntries.join("\n")}
`;
writeFileSync(openSslConfig, config);

execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "825",
    "-keyout",
    keyPath,
    "-out",
    crtPath,
    "-config",
    openSslConfig,
  ],
  { stdio: "inherit" },
);

if (!existsSync(crtPath) || !existsSync(keyPath)) {
  throw new Error("openssl did not produce both chainify.crt and chainify.key");
}

console.log(`certificate: ${crtPath}`);
console.log(`private key: ${keyPath}`);
console.log(`subjectAltName: ${altEntries.map((e) => e.replace(/\s*=\s*/, " ")).join(", ")}`);
console.log(
  "trust it once per client: import chainify.crt into the OS/browser root store, or accept the warning.",
);
