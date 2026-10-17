import type * as Forge from "node-forge";
import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import { binaryToBytes, bytesToBinary } from "../content";
import { PdfEngineError } from "../errors";
import { visualFrame, visualToPage } from "../geometry";
import { loadPdf } from "../load";
import { canDraw } from "../text";
import type { Box } from "./edit";

/**
 * Digital (cryptographic) signatures: PKCS#7 detached signatures as Acrobat makes them
 * (adbe.pkcs7.detached), signed with the key in a .p12/.pfx file.
 *
 * node-forge reads the .p12 and builds the signature. Verification doesn't use forge (its RSA
 * verify has a known weakness); it parses the structures itself and checks with WebCrypto, which
 * also handles EC keys.
 */

async function loadForge(): Promise<typeof Forge> {
  const mod = (await import("node-forge")) as unknown as { default?: typeof Forge } & typeof Forge;
  return mod.default ?? mod;
}

/** Room reserved for the signature: enough for a certificate chain of a few certificates. */
const SIGNATURE_BYTES = 16384;
const PLACEHOLDER = 9999999999;

export interface DigitalSignOptions {
  /** The .p12/.pfx file holding the certificate and private key. */
  p12: Uint8Array;
  password: string;
  reason?: string;
  location?: string;
  /** Show a signature box on a page; invisible when left out. */
  appearance?: { pageIndex: number; box: Box };
}

interface Identity {
  key: Forge.pki.rsa.PrivateKey;
  certificate: Forge.pki.Certificate;
  chain: Forge.pki.Certificate[];
  name: string;
}

async function readIdentity(p12: Uint8Array, password: string): Promise<Identity> {
  const forge = await loadForge();
  let parsed: Forge.pkcs12.Pkcs12Pfx;
  try {
    parsed = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytesToBinary(p12)), password);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/password|MAC/i.test(message)) {
      throw new PdfEngineError("wrong-password", "That certificate password isn't right.");
    }
    if (/OID is not RSA/i.test(message)) {
      throw new PdfEngineError(
        "bad-input",
        "Only RSA certificates can be used for signing so far.",
      );
    }
    throw new PdfEngineError(
      "bad-input",
      "This doesn't look like a .p12 or .pfx certificate file.",
    );
  }
  const bags = (type: string) => parsed.getBags({ bagType: type })[type] ?? [];
  const keyBag = [...bags(forge.pki.oids.pkcs8ShroudedKeyBag!), ...bags(forge.pki.oids.keyBag!)][0];
  const certificates = bags(forge.pki.oids.certBag!)
    .map((b) => b.cert)
    .filter((c): c is Forge.pki.Certificate => !!c);
  const key = keyBag?.key as Forge.pki.rsa.PrivateKey | undefined;
  if (!key || certificates.length === 0) {
    throw new PdfEngineError(
      "bad-input",
      "The certificate file needs both a certificate and its private key.",
    );
  }
  // The signing certificate is the one whose public key matches the private key.
  const certificate =
    certificates.find((c) => (c.publicKey as Forge.pki.rsa.PublicKey).n?.equals(key.n)) ??
    certificates[0]!;
  const name =
    (certificate.subject.getField("CN")?.value as string | undefined) ??
    (certificate.subject.getField("O")?.value as string | undefined) ??
    "Unknown signer";
  return { key, certificate, chain: certificates.filter((c) => c !== certificate), name };
}

function findBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const ascii = (s: string) => new TextEncoder().encode(s);

/**
 * Signs the PDF. Returns the signed file; any later change to it (other than another signature
 * added as an incremental update) shows up as tampering when verified.
 */
export async function signPdfDigitally(
  bytes: Uint8Array,
  options: DigitalSignOptions,
): Promise<Uint8Array> {
  const identity = await readIdentity(options.p12, options.password);
  const forge = await loadForge();
  const doc = await loadPdf(bytes);
  const { context } = doc;
  const now = new Date();

  const sig = context.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: "adbe.pkcs7.detached",
    ByteRange: [0, PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
  }) as PDFDict;
  sig.set(PDFName.of("Contents"), PDFHexString.of("0".repeat(SIGNATURE_BYTES * 2)));
  sig.set(PDFName.of("M"), PDFString.fromDate(now));
  sig.set(PDFName.of("Name"), PDFHexString.fromText(identity.name));
  if (options.reason) sig.set(PDFName.of("Reason"), PDFHexString.fromText(options.reason));
  if (options.location) sig.set(PDFName.of("Location"), PDFHexString.fromText(options.location));
  const sigRef = context.register(sig);

  const pageIndex = options.appearance?.pageIndex ?? 0;
  if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
    throw new PdfEngineError("bad-input", `Page ${pageIndex + 1} doesn't exist.`);
  }
  const page = doc.getPage(pageIndex);
  let rect = [0, 0, 0, 0];
  if (options.appearance) {
    // A visible stamp drawn into the page (so it's covered by the signature), plus the widget
    // over it so viewers open the signature details when it's clicked.
    const frame = visualFrame(page);
    const { box } = options.appearance;
    const w = box.width * frame.width;
    const h = box.height * frame.height;
    const left = box.x * frame.width;
    const top = (1 - box.y) * frame.height;
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = [
      `Digitally signed by ${identity.name}`,
      `Date: ${now.toISOString().replace("T", " ").slice(0, 19)} UTC`,
      ...(options.reason ? [`Reason: ${options.reason}`] : []),
      ...(options.location ? [`Location: ${options.location}`] : []),
    ].filter((l) => canDraw(font, l));
    const size = Math.max(5, Math.min(10, h / (lines.length * 1.35)));
    lines.forEach((line, i) => {
      const { x, y } = visualToPage(page, left + 4, top - 4 - size * (i + 1) * 1.25);
      page.drawText(line, {
        x,
        y,
        size,
        font,
        color: rgb(0.1, 0.1, 0.35),
        maxWidth: w - 8,
        rotate: degrees(frame.rotation),
      });
    });
    const a = visualToPage(page, left, top);
    const b = visualToPage(page, left + w, top - h);
    rect = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
  }

  const appearance = context.register(
    context.stream("", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, rect[2]! - rect[0]!, rect[3]! - rect[1]!],
    }),
  );
  const existingFields = (doc.catalog
    .lookupMaybe(PDFName.of("AcroForm"), PDFDict)
    ?.lookupMaybe(PDFName.of("Fields"), PDFArray)
    ?.size() ?? 0) as number;
  const widget = context.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    Rect: rect,
    V: sigRef,
    F: 132, // Print + Locked
    P: page.ref,
    AP: { N: appearance },
  }) as PDFDict;
  widget.set(PDFName.of("T"), PDFHexString.fromText(`Signature${existingFields + 1}`));
  const widgetRef = context.register(widget);

  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(widgetRef);
  else page.node.set(PDFName.of("Annots"), context.obj([widgetRef]));
  let form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (!form) {
    form = context.obj({ Fields: [] }) as PDFDict;
    doc.catalog.set(PDFName.of("AcroForm"), context.register(form));
  }
  const fields = form.lookupMaybe(PDFName.of("Fields"), PDFArray);
  if (fields) fields.push(widgetRef);
  else form.set(PDFName.of("Fields"), context.obj([widgetRef]));
  form.set(PDFName.of("SigFlags"), PDFNumber.of(3));

  // The signature dictionary must sit in the file as plain text to be patched below.
  const pdf = await doc.save({ useObjectStreams: false });

  const contentsAt = findBytes(pdf, ascii(`<${"0".repeat(SIGNATURE_BYTES * 2)}>`));
  const rangeText = `${PLACEHOLDER} ${PLACEHOLDER} ${PLACEHOLDER}`;
  const rangeAt = findBytes(pdf, ascii(rangeText));
  if (contentsAt < 0 || rangeAt < 0) {
    throw new PdfEngineError("invalid", "Couldn't prepare the file for signing.");
  }
  const contentsEnd = contentsAt + SIGNATURE_BYTES * 2 + 2;
  const byteRange = [0, contentsAt, contentsEnd, pdf.length - contentsEnd];
  pdf.set(
    ascii(`${byteRange[1]} ${byteRange[2]} ${byteRange[3]}`.padEnd(rangeText.length, " ")),
    rangeAt,
  );

  // Sign everything except the hole left for the signature itself.
  const signed = new Uint8Array(byteRange[1]! + byteRange[3]!);
  signed.set(pdf.subarray(0, contentsAt), 0);
  signed.set(pdf.subarray(contentsEnd), contentsAt);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(bytesToBinary(signed));
  p7.addCertificate(identity.certificate);
  for (const cert of identity.chain) p7.addCertificate(cert);
  p7.addSigner({
    key: identity.key,
    certificate: identity.certificate,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data! },
      { type: forge.pki.oids.messageDigest! },
      { type: forge.pki.oids.signingTime!, value: now as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  if (der.length > SIGNATURE_BYTES) {
    throw new PdfEngineError("bad-input", "The certificate chain is too large to embed.");
  }
  const hex = Array.from(binaryToBytes(der), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .padEnd(SIGNATURE_BYTES * 2, "0");
  pdf.set(ascii(hex), contentsAt + 1);
  return pdf;
}

// ---------------------------------------------------------------------------------------------
// Verification

export interface SignatureReport {
  /** Who signed (certificate common name or organization). */
  signer: string;
  issuer: string;
  selfSigned: boolean;
  signedAt?: string;
  reason?: string;
  location?: string;
  /** The signed bytes hash to the value inside the signature: nothing was altered. */
  intact: boolean;
  /** The signature math checks out against the signer's certificate. */
  validSignature: boolean;
  /** The signature covers the whole file (nothing was appended afterwards). */
  coversWholeFile: boolean;
  /** The certificate was within its validity period at signing time. */
  certificateValidAtSigning: boolean;
  /** Why something couldn't be checked, if anything. */
  problem?: string;
}

interface Node {
  tagClass: number;
  type: number;
  constructed: boolean;
  value: Node[] | string;
}

const kids = (node: Node | undefined): Node[] => (Array.isArray(node?.value) ? node!.value : []);

const OID = {
  signingTime: "1.2.840.113549.1.9.5",
  messageDigest: "1.2.840.113549.1.9.4",
  rsa: "1.2.840.113549.1.1.1",
  ec: "1.2.840.10045.2.1",
  cn: "2.5.4.3",
  o: "2.5.4.10",
};
const DIGESTS: Record<string, string> = {
  "1.3.14.3.2.26": "SHA-1",
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
};
const CURVES: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
};

/** Reads common name (or organization) from an X.500 name. */
function nameOf(forge: typeof Forge, name: Node | undefined): string {
  let o = "";
  for (const rdn of kids(name)) {
    for (const attr of kids(rdn)) {
      const [type, value] = kids(attr);
      const oid = forge.asn1.derToOid(type!.value as string);
      const text = typeof value?.value === "string" ? forge.util.decodeUtf8(value.value) : "";
      if (oid === OID.cn) return text;
      if (oid === OID.o) o = text;
    }
  }
  return o || "Unknown";
}

interface Certificate {
  der: string;
  serial: string;
  issuerDer: string;
  subjectDer: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  spki: Node;
}

function readCertificate(forge: typeof Forge, cert: Node): Certificate | null {
  const tbs = kids(cert)[0];
  let fields = kids(tbs);
  // Version is an optional explicit [0].
  if (fields[0]?.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC) fields = fields.slice(1);
  const [serial, , issuer, validity, subject, spki] = fields;
  if (!serial || !issuer || !validity || !subject || !spki) return null;
  const time = (node: Node | undefined) =>
    node?.type === forge.asn1.Type.UTCTIME
      ? forge.asn1.utcTimeToDate(node.value as string)
      : forge.asn1.generalizedTimeToDate(node?.value as string);
  const [notBefore, notAfter] = kids(validity);
  const toDer = (n: Node) => forge.asn1.toDer(n as unknown as Forge.asn1.Asn1).getBytes();
  return {
    der: toDer(cert),
    serial: forge.util.bytesToHex(serial.value as string).replace(/^(00)+/, ""),
    issuerDer: toDer(issuer),
    subjectDer: toDer(subject),
    subject: nameOf(forge, subject),
    issuer: nameOf(forge, issuer),
    notBefore: time(notBefore),
    notAfter: time(notAfter),
    spki,
  };
}

const toArrayBuffer = (s: string) => binaryToBytes(s).buffer as ArrayBuffer;

/** Converts a DER ECDSA signature (SEQUENCE of r, s) to the raw r‖s that WebCrypto expects. */
function ecdsaRaw(forge: typeof Forge, der: string, size: number): ArrayBuffer {
  const [r, s] = kids(forge.asn1.fromDer(der) as unknown as Node);
  const fit = (v: string) => {
    const bytes = binaryToBytes(v);
    const trimmed = bytes.subarray(Math.max(0, bytes.length - size));
    const out = new Uint8Array(size);
    out.set(trimmed, size - trimmed.length);
    return out;
  };
  const out = new Uint8Array(size * 2);
  out.set(fit(r!.value as string), 0);
  out.set(fit(s!.value as string), size);
  return out.buffer;
}

async function checkSignature(
  forge: typeof Forge,
  cert: Certificate,
  hash: string,
  signedDer: string,
  signature: string,
): Promise<boolean | "unsupported"> {
  const spkiDer = forge.asn1.toDer(cert.spki as unknown as Forge.asn1.Asn1).getBytes();
  const [algorithm] = kids(cert.spki);
  const [algOid, params] = kids(algorithm);
  const alg = forge.asn1.derToOid(algOid!.value as string);
  const subtle = globalThis.crypto.subtle;
  if (alg === OID.rsa) {
    const key = await subtle.importKey(
      "spki",
      toArrayBuffer(spkiDer),
      { name: "RSASSA-PKCS1-v1_5", hash },
      false,
      ["verify"],
    );
    return subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      toArrayBuffer(signature),
      toArrayBuffer(signedDer),
    );
  }
  if (alg === OID.ec && params) {
    const curve = CURVES[forge.asn1.derToOid(params.value as string)];
    if (!curve) return "unsupported";
    const key = await subtle.importKey(
      "spki",
      toArrayBuffer(spkiDer),
      { name: "ECDSA", namedCurve: curve },
      false,
      ["verify"],
    );
    const size = curve === "P-256" ? 32 : curve === "P-384" ? 48 : 66;
    return subtle.verify(
      { name: "ECDSA", hash },
      key,
      ecdsaRaw(forge, signature, size),
      toArrayBuffer(signedDer),
    );
  }
  return "unsupported";
}

/** Finds and checks every digital signature in the file. */
export async function verifySignatures(bytes: Uint8Array): Promise<SignatureReport[]> {
  const forge = await loadForge();
  const doc = await loadPdf(bytes).catch(() => null);
  if (!doc) return [];
  const reports: SignatureReport[] = [];

  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : null;
    const range = dict?.lookupMaybe(PDFName.of("ByteRange"), PDFArray);
    const contents = dict?.get(PDFName.of("Contents"));
    if (!dict || !range || !(contents instanceof PDFHexString || contents instanceof PDFString))
      continue;
    if (dict.get(PDFName.of("Type")) && dict.get(PDFName.of("Type")) !== PDFName.of("Sig"))
      continue;

    const text = (key: string) => {
      const v = dict.get(PDFName.of(key));
      return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : undefined;
    };
    const report: SignatureReport = {
      signer: text("Name") ?? "Unknown",
      issuer: "Unknown",
      selfSigned: false,
      reason: text("Reason"),
      location: text("Location"),
      intact: false,
      validSignature: false,
      coversWholeFile: false,
      certificateValidAtSigning: false,
    };
    reports.push(report);

    try {
      const [a, b, c, d] = range.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : -1));
      if ([a, b, c, d].some((v) => v === undefined || v < 0) || c! + d! > bytes.length) {
        report.problem = "The signature's byte range is invalid.";
        continue;
      }
      report.coversWholeFile = a === 0 && c! + d! === bytes.length;
      const signed = new Uint8Array(b! + d!);
      signed.set(bytes.subarray(a!, a! + b!), 0);
      signed.set(bytes.subarray(c!, c! + d!), b!);

      const cms = (
        forge.asn1.fromDer as unknown as (der: string, options: object) => Forge.asn1.Asn1
      )(
        bytesToBinary(contents.asBytes()),
        // The signature is zero-padded to its reserved size; don't parse the padding.
        { strict: false, parseAllBytes: false, decodeBitStrings: false },
      ) as unknown as Node;
      // ContentInfo → [0] → SignedData
      const signedData = kids(kids(kids(cms)[1])[0]);
      const certificates = signedData.find(
        (n) => n.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && n.type === 0,
      )?.value as Node[] | undefined;
      const signerInfos = signedData.at(-1);
      const signerInfo = kids(signerInfos)[0];
      if (!signerInfo) {
        report.problem = "No signer found in the signature.";
        continue;
      }
      const parts = kids(signerInfo);
      const [issuerAndSerial] = parts.slice(1, 2);
      const digestAlg = forge.asn1.derToOid(kids(parts[2])[0]!.value as string);
      const attrs = parts.find(
        (n) => n.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && n.type === 0,
      );
      const signature = parts.find(
        (n) => n.type === forge.asn1.Type.OCTETSTRING && n.tagClass === 0,
      )?.value as string | undefined;
      const hash = DIGESTS[digestAlg];
      if (!hash || !attrs || !signature) {
        report.problem = "This kind of signature can't be checked yet.";
        continue;
      }

      const [sidIssuer, sidSerial] = kids(issuerAndSerial);
      const wantedIssuer = forge.asn1.toDer(sidIssuer as unknown as Forge.asn1.Asn1).getBytes();
      const wantedSerial = forge.util.bytesToHex(sidSerial!.value as string).replace(/^(00)+/, "");
      const certs = (certificates ?? [])
        .map((c) => readCertificate(forge, c))
        .filter((c) => c !== null);
      const cert = certs.find((c) => c.issuerDer === wantedIssuer && c.serial === wantedSerial);
      if (!cert) {
        report.problem = "The signer's certificate isn't included.";
        continue;
      }
      report.signer = cert.subject;
      report.issuer = cert.issuer;
      report.selfSigned = cert.issuerDer === cert.subjectDer;

      let messageDigest: string | undefined;
      for (const attr of kids(attrs)) {
        const [type, values] = kids(attr);
        const oid = forge.asn1.derToOid(type!.value as string);
        const value = kids(values)[0];
        if (oid === OID.messageDigest) messageDigest = value?.value as string;
        if (oid === OID.signingTime && value) {
          const date =
            value.type === forge.asn1.Type.UTCTIME
              ? forge.asn1.utcTimeToDate(value.value as string)
              : forge.asn1.generalizedTimeToDate(value.value as string);
          report.signedAt = date.toISOString();
        }
      }
      if (!report.signedAt) {
        const m = dict.get(PDFName.of("M"));
        const date = m instanceof PDFString ? m.decodeDate() : undefined;
        if (date) report.signedAt = date.toISOString();
      }
      const at = report.signedAt ? new Date(report.signedAt) : new Date();
      report.certificateValidAtSigning = at >= cert.notBefore && at <= cert.notAfter;

      const digest = new Uint8Array(await globalThis.crypto.subtle.digest(hash, signed));
      report.intact = messageDigest !== undefined && bytesToBinary(digest) === messageDigest;

      // The signature covers the attributes, re-tagged as a SET (RFC 5652 §5.4).
      const attrSet = { ...attrs, tagClass: forge.asn1.Class.UNIVERSAL, type: forge.asn1.Type.SET };
      const attrDer = forge.asn1.toDer(attrSet as unknown as Forge.asn1.Asn1).getBytes();
      const ok = await checkSignature(forge, cert, hash, attrDer, signature);
      if (ok === "unsupported") report.problem = "This signature algorithm can't be checked yet.";
      else report.validSignature = ok;
    } catch {
      report.problem = report.problem ?? "The signature couldn't be read.";
    }
  }
  return reports;
}
