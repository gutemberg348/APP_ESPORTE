import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
const types = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export async function pickReceipt() {
  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.size && asset.size > 5 * 1024 * 1024)
    throw new Error("O comprovante deve ter até 5 MB.");
  const mimeType =
    asset.mimeType ||
    (
      {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      } as Record<string, string>
    )[asset.name.split(".").pop()!.toLowerCase()] ||
    "";
  if (!types.includes(mimeType))
    throw new Error("Selecione PDF, JPG, PNG ou WebP.");
  let base64: string;
  if (Platform.OS === "web") {
    const blob = asset.file || (await (await fetch(asset.uri)).blob());
    base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result),
          comma = value.indexOf(",");
        if (comma < 0) reject(new Error("Não foi possível ler o arquivo."));
        else resolve(value.slice(comma + 1));
      };
      reader.onerror = () =>
        reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsDataURL(blob);
    });
  } else base64 = await new File(asset.uri).base64();
  if (base64.length > 6990508)
    throw new Error("O comprovante deve ter até 5 MB.");
  return { name: asset.name.slice(0, 180), mimeType, base64 };
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
