import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Paperclip, Download, Trash2 } from "lucide-react-native";
import type { PayoutAttachment, ReceiptParent } from "@nacional/shared/finance";
import {
  AdminButton,
  AdminField,
  AdminNotice,
  AdminSection,
} from "./AdminControls";
import { Text } from "../Typography";
import { Sheet } from "../Sheet";
import { withdrawalsApi } from "../../services/withdrawals";
import { openReceipt, pickReceipt } from "../../services/receipt-files";
import { useSession } from "../../providers/SessionProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { messageOf } from "../../utils/format";
export function PayoutAttachments({
  parent,
  readOnly = false,
}: {
  parent: ReceiptParent;
  readOnly?: boolean;
}) {
  const { token } = useSession(),
    { colors } = useTheme(),
    revision = useRef(0),
    lock = useRef(false);
  const [items, setItems] = useState<PayoutAttachment[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [removed, setRemoved] = useState<PayoutAttachment | null>(null),
    [reason, setReason] = useState("");
  const parentKey = JSON.stringify(parent);
  async function load() {
    if (!token) return;
    const current = ++revision.current;
    try {
      const data = await withdrawalsApi.attachments(token, parent);
      if (current === revision.current) setItems(data);
    } catch (err) {
      if (current === revision.current) setError(messageOf(err));
    }
  }
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [token, parentKey]);
  async function perform(work: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <AdminSection
      title="Comprovantes"
      description="PDF, JPG, PNG ou WebP · até 5 MB por arquivo · até 5 anexos ativos. Acesso restrito ao admin."
    >
      {!readOnly && (
        <AdminButton
          label="Anexar comprovante"
          icon={Paperclip}
          loading={busy}
          disabled={items.filter((f) => !f.removedAt).length >= 5}
          onPress={() =>
            void perform(async () => {
              const file = await pickReceipt();
              if (!file) return;
              await withdrawalsApi.upload(token!, parent, file);
              setNotice("Comprovante anexado.");
              await load();
            })
          }
        />
      )}
      {items.map((file) => (
        <View
          key={file.id}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            padding: 12,
            gap: 8,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
            {file.name}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            {(file.byteLength / 1024).toLocaleString("pt-BR", {
              maximumFractionDigits: 0,
            })}{" "}
            KB · {new Date(file.createdAt).toLocaleDateString("pt-BR")}
            {file.removedAt ? " · Removido: " + file.removalReason : ""}
          </Text>
          {!file.removedAt && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <AdminButton
                label="Baixar / abrir"
                icon={Download}
                disabled={busy}
                onPress={() =>
                  void perform(async () => {
                    await openReceipt(
                      await withdrawalsApi.content(token!, file.id),
                    );
                  })
                }
              />
              {!readOnly && (
                <AdminButton
                  label="Remover"
                  icon={Trash2}
                  variant="ghost"
                  disabled={busy}
                  onPress={() => {
                    setRemoved(file);
                    setReason("");
                  }}
                />
              )}
            </View>
          )}
        </View>
      ))}
      {!items.length && (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Nenhum comprovante anexado.
        </Text>
      )}
      {!!notice && <AdminNotice tone="success">{notice}</AdminNotice>}
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      {removed && (
        <Sheet
          visible
          title="Remover comprovante"
          onClose={busy ? () => {} : () => setRemoved(null)}
        >
          <AdminNotice>
            O arquivo deixa de ficar disponível para download, e a remoção
            permanece na auditoria.
          </AdminNotice>
          <AdminField
            label="Motivo"
            value={reason}
            onChange={setReason}
            maxLength={500}
            multiline
          />
          {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
          <AdminButton
            variant="danger"
            label="Confirmar remoção"
            loading={busy}
            disabled={reason.trim().length < 5}
            onPress={() =>
              void perform(async () => {
                await withdrawalsApi.remove(token!, removed.id, reason.trim());
                setRemoved(null);
                await load();
              })
            }
          />
        </Sheet>
      )}
    </AdminSection>
  );
}
