import { Platform } from "react-native";
import { pickUploadFile } from "./upload-file";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
const types = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export function pickReceipt() {
  return pickUploadFile({ types, maxBytes: 5 * 1024 * 1024, tooLarge: "O comprovante deve ter até 5 MB.", unsupported: "Selecione PDF, JPG, PNG ou WebP." });
}

export async function openReceipt(file: {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
}) {
  if (Platform.OS === "web") {
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
      url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "O dispositivo não permite abrir o compartilhamento de arquivos.",
    );
  const extension =
    {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[file.mimeType] || "bin";
  const local = new File(
    Paths.cache,
    `comprovante-${file.id}-${Date.now()}.${extension}`,
  );
  if (!local.exists) local.create();
  await local.write(file.base64, { encoding: "base64" });
  try {
    await Sharing.shareAsync(local.uri, {
      mimeType: file.mimeType,
      dialogTitle: file.name,
    });
  } finally {
    // The receiving app may still be reading the shared URI after the sheet closes.
    setTimeout(() => {
      try {
        if (local.exists) local.delete();
      } catch {}
    }, 300000);
  }
}
