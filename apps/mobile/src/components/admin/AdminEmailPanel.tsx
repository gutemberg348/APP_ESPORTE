import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Mail, RefreshCw } from "lucide-react-native";
import type { Member } from "@nacional/shared/types";
import {
  AdminButton,
  AdminNotice,
  AdminSection,
  AdminSelect,
} from "./AdminControls";
import { AdminBadge } from "./AdminLayout";
import { Text } from "../Typography";
import { useTheme } from "../../theme/ThemeProvider";
import { useSession } from "../../providers/SessionProvider";
import { recoveryApi, type EmailStatus } from "../../services/recovery";
import { messageOf } from "../../utils/format";
export function AdminEmailPanel({
  refreshKey,
  users,
}: {
  refreshKey: number;
  users: Member[];
}) {
  const { token } = useSession(),
    { colors } = useTheme(),
    revision = useRef(0),
    lock = useRef(false);
  const [data, setData] = useState<EmailStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [userId, setUserId] = useState("");
  async function refresh() {
    if (!token) return;
    const current = ++revision.current;
    try {
      const value = await recoveryApi.status(token);
      if (current === revision.current) setData(value);
    } catch (err) {
      if (current === revision.current) setError(messageOf(err));
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [token, refreshKey]);
  async function perform(work: () => Promise<{ message: string }>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      setNotice(result.message);
      await refresh();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <AdminSection
        title="Recuperação de senha por email"
        description="As credenciais SMTP ficam somente no .env da API."
      >
        <AdminBadge
          label={data?.enabled ? "Envio habilitado" : "SMTP não configurado"}
          tone={data?.enabled ? "success" : "warning"}
        />
        <Text style={{ color: colors.text, fontSize: 13 }}>
          Remetente: {data?.sender || "Não informado"}
        </Text>
        <Text selectable style={{ color: colors.muted, fontSize: 12 }}>
          Página de recuperação: {data?.publicUrl || "Carregando..."}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Validade: {data?.ttlMinutes || 15} minutos · uso único · encerra
          sessões após alterar a senha
        </Text>
        <AdminNotice>
          Preencha SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD,
          SMTP_FROM_EMAIL e PASSWORD_RESET_PUBLIC_URL em apps/api/.env.
          Configure MAIL_DATA_SECRET com um segredo exclusivo de 64 caracteres e
          SMTP_ENABLED=true. Reinicie a API após salvar. Use uma senha de
          aplicativo se o provedor exigir.
        </AdminNotice>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <AdminButton
            label="Verificar conexão SMTP"
            icon={Mail}
            disabled={!data?.enabled}
            loading={busy}
            onPress={() => void perform(() => recoveryApi.verify(token!))}
          />
          <AdminButton
            label="Atualizar situação"
            icon={RefreshCw}
            disabled={busy}
            onPress={() => void refresh()}
          />
        </View>
      </AdminSection>
      <AdminSection
        title="Acompanhar envios"
        description="As mensagens são processadas pela API, com tentativas automáticas em caso de falha."
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
          {[
            { key: "QUEUED", label: "Na fila" },
            { key: "SENDING", label: "Enviando" },
            { key: "SENT", label: "Enviados" },
            { key: "FAILED", label: "Falharam" },
            { key: "SKIPPED", label: "Invalidados" },
          ].map((s) => (
            <View key={s.key} style={{ minWidth: 100, gap: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {s.label}
              </Text>
              <Text heading style={{ color: colors.text, fontSize: 24 }}>
                {data?.deliveries[s.key] || 0}
              </Text>
            </View>
          ))}
        </View>
        <AdminNotice>
          Uma mensagem enviada indica aceitação pelo servidor SMTP. A entrega na
          caixa de entrada depende do provedor. Em caso de falha definitiva,
          confira as credenciais e solicite um novo link.
        </AdminNotice>
      </AdminSection>
      <AdminSection
        title="Ajudar uma conta a recuperar o acesso"
        description="O link vai exclusivamente para o email cadastrado. Nenhum token aparece no painel."
      >
        <AdminSelect
          label="Conta"
          value={userId}
          onChange={setUserId}
          options={users
            .filter((u) => u.active)
            .map((u) => ({ value: u.id, label: u.name, description: u.email }))}
          disabled={busy}
          hint="Para uma conta específica, use também a ação na lista de torcedores ou funcionários."
        />
        <AdminButton
          primary
          label="Enviar recuperação de senha"
          disabled={!userId || !data?.enabled}
          loading={busy}
          onPress={() =>
            void perform(() => recoveryApi.forUser(token!, userId))
          }
        />
      </AdminSection>
      {!!notice && <AdminNotice tone="success">{notice}</AdminNotice>}
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    </View>
  );
}
