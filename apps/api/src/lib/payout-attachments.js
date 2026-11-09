import { createHash } from "node:crypto";
import { AppError } from "./errors.js";
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export function decodePayoutAttachment({ name, mimeType, base64 }) {
  if (base64.length > 6990508)
    throw new AppError(
      413,
      "RECEIPT_TOO_LARGE",
      "O comprovante deve ter até 5 MB.",
    );
  if (base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64))
    throw new AppError(
      422,
      "INVALID_RECEIPT",
      "O arquivo não está em uma codificação válida.",
    );
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64)
    throw new AppError(
      422,
      "INVALID_RECEIPT",
      "O arquivo não está em uma codificação válida.",
    );
  if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES)
    throw new AppError(
      413,
      "RECEIPT_TOO_LARGE",
      "O comprovante deve ter até 5 MB.",
    );
  const valid =
    mimeType === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-" &&
        bytes
          .subarray(Math.max(0, bytes.length - 1024))
          .includes(Buffer.from("%%EOF"))
      : mimeType === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mimeType === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : mimeType === "image/webp"
            ? bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP"
            : false;
  if (!valid)
    throw new AppError(
      422,
      "INVALID_RECEIPT_TYPE",
      "O conteúdo não corresponde a um PDF, JPG, PNG ou WebP válido.",
    );
  const extension = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
  }[mimeType];
  const cleanName =
    name
      .normalize("NFKC")
      .replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g, "_")
      .replace(/^\.+/, "")
      .replace(/\.[^.]*$/, "")
      .trim()
      .slice(0, 170) || "comprovante";
  return {
    name: cleanName + extension,
    mimeType,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    content: bytes,
  };
}
