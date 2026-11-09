import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { AdminAccount, Employee } from "@nacional/shared/types";
import { Sheet } from "../Sheet";
import {
  AdminButton,
  AdminField,
  AdminFormGrid,
  AdminNotice,
  AdminSection,
  AdminSelect,
  AdminToggle,
} from "./AdminControls";
import { adminApi } from "../../services/admin";
import { employeeApi } from "../../services/gate";
import { useSession } from "../../providers/SessionProvider";
import { messageOf } from "../../utils/format";
const roles = [
  { value: "ADMIN", label: "Administrador" },
  { value: "GATE", label: "Portaria" },
  { value: "CASHIER", label: "Caixa de parceiro" },
];

export function AdminAccountForm({
  userId,
  onClose,
  onSaved,
}: {
  userId: string;
  onClose: () => void;
  onSaved: (signedOut?: boolean) => Promise<void>;
}) {
  const { token, member, clearSession, updateMember } = useSession(),
    lock = useRef(false),
    revision = useRef(0);
  const [account, setAccount] = useState<AdminAccount | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [contact, setContact] = useState(""),
    [city, setCity] = useState(""),
    [active, setActive] = useState(true),
    [role, setRole] = useState<Employee["role"]>("GATE");
  const [changePassword, setChangePassword] = useState(false),
    [password, setPassword] = useState("");
  async function load() {
    if (!token) return;
    const current = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const data = await adminApi.userDetail(token, userId);
      if (current !== revision.current) return;
      setAccount(data);
      setName(data.name);
      setEmail(data.email);
      setContact(data.contact || "");
      setCity(data.city || "");
      setActive(data.active);
      if (data.role !== "USER") setRole(data.role);
      setChangePassword(false);
      setPassword("");
    } catch (err) {
      if (current === revision.current) setError(messageOf(err));
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [token, userId]);
  const staff = account?.role !== "USER",
    ownAccount = account?.id === member?.id;
  async function save() {
    if (!token || !account || lock.current) return;
    if (changePassword && (password.length < 12 || password.length > 128)) {
      setError("Use de 12 a 128 caracteres na nova senha.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = {
        userId,
        updatedAt: account.updatedAt,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        city: city.trim(),
        contact: contact.replace(/\D/g, ""),
        active,
        ...(changePassword ? { password } : {}),
      };
      await (staff
        ? employeeApi.edit(token, { ...body, role })
        : adminApi.updateUser(token, body));
      setPassword("");
      const signedOut =
        ownAccount && (changePassword || body.email !== account.email);
      if (signedOut) await clearSession();
      else if (ownAccount && member)
        updateMember({
          ...member,
          name: body.name,
          email: body.email,
          city: body.city,
          contact: body.contact,
        });
      await onSaved(signedOut);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet
      visible
      title={
        account
          ? account.role === "USER"
            ? "Editar torcedor"
            : "Editar funcionário"
          : "Editar conta"
      }
      onClose={busy ? () => {} : onClose}
    >
      {loading ? (
        <AdminButton
          label="Carregando dados"
          loading
          disabled
          onPress={() => {}}
        />
      ) : !account ? (
        <>
          <AdminNotice tone="error">{error}</AdminNotice>
          <AdminButton label="Tentar novamente" onPress={() => void load()} />
        </>
      ) : (
        <>
          <AdminSection
            title="Dados da conta"
            description="Atualize os dados de acesso e contato."
          >
            <AdminFormGrid>
              <AdminField
                label="Nome completo"
                value={name}
                onChange={setName}
                required
                maxLength={100}
                editable={!busy}
                autoComplete="off"
              />
              <AdminField
                label="Email de acesso"
                value={email}
                onChange={setEmail}
                required
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                maxLength={254}
                editable={!busy}
              />
              <AdminField
                label="Telefone com DDD"
                value={contact}
                onChange={setContact}
                mask="phone"
                keyboardType="phone-pad"
                editable={!busy}
              />
              <AdminField
                label="Cidade"
                value={city}
                onChange={setCity}
                maxLength={60}
                editable={!busy}
              />
            </AdminFormGrid>
          </AdminSection>
          <AdminSection title="Acesso e segurança">
            {staff && (
              <AdminSelect
                label="Perfil do funcionário"
                value={role}
                onChange={(v) => setRole(v as Employee["role"])}
                options={roles}
                disabled={busy || ownAccount}
                hint="Alterar o perfil encerra sessões e remove escalas e caixas anteriormente autorizados."
              />
            )}
            <AdminToggle
              label="Conta ativa"
              value={active}
              onChange={setActive}
              disabled={busy || ownAccount}
              hint={
                ownAccount
                  ? "Seu próprio acesso deve ser alterado por outro administrador."
                  : "Desativar bloqueia o login e encerra as sessões."
              }
            />
            <AdminToggle
              label="Definir nova senha"
              value={changePassword}
              disabled={busy}
              onChange={(v) => {
                setChangePassword(v);
                setPassword("");
              }}
              hint="Deixe desativado para manter a senha atual."
            />
            {changePassword && (
              <AdminField
                label="Nova senha"
                value={password}
                onChange={setPassword}
                required
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={128}
                editable={!busy}
                hint="De 12 a 128 caracteres. Use o olhinho para conferir a senha."
              />
            )}
            <AdminNotice>
              Alterar email ou senha encerra todas as sessões dessa conta e
              invalida os links de recuperação anteriores.
              {ownAccount
                ? " Se alterar seu próprio email ou senha, entre novamente após salvar."
                : ""}
            </AdminNotice>
          </AdminSection>
          {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            <AdminButton label="Cancelar" disabled={busy} onPress={onClose} />
            <AdminButton
              primary
              label="Salvar alterações"
              loading={busy}
              onPress={() => void save()}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}
