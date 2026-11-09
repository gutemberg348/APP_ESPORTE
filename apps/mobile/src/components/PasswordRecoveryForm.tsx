import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Mail, LockKeyhole } from "lucide-react-native";
import { AdminButton, AdminField, AdminNotice } from "./admin/AdminControls";
import { recoveryApi } from "../services/recovery";
import { messageOf } from "../utils/format";
export function PasswordRecoveryForm({
  token,
  portal = "APP",
  initialEmail = "",
  onDone,
}: {
  token?: string;
  portal?: "APP" | "ADMIN";
  initialEmail?: string;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(initialEmail),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [valid, setValid] = useState(!token),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    if (!token) return;
    let live = true;
    setBusy(true);
    void recoveryApi
      .validate(token)
      .then(() => {
        if (live) setValid(true);
      })
      .catch((err) => {
        if (live) setError(messageOf(err));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [token]);
  async function submit() {
    if (lock.current) return;
    if (
      token
        ? password.length < 12
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError(
        token
          ? "Use uma senha de pelo menos 12 caracteres."
          : "Informe um email válido.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = token
        ? await recoveryApi.reset(token, password)
        : await recoveryApi.request(email.trim().toLowerCase(), portal);
      setNotice(result.message);
      setPassword("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <AdminNotice>
        {token
          ? "Crie uma senha de 12 a 128 caracteres. As sessões anteriores serão encerradas."
          : "Informe o email da sua conta. Você receberá um link válido por alguns minutos para criar uma nova senha."}
      </AdminNotice>
      {!notice &&
        (token ? (
          valid && (
            <AdminField
              label="Nova senha"
              value={password}
              onChange={setPassword}
              secureTextEntry
              icon={LockKeyhole}
              autoComplete="new-password"
              textContentType="newPassword"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={128}
              editable={!busy}
              onSubmitEditing={() => void submit()}
            />
          )
        ) : (
          <AdminField
            label="Email da conta"
            value={email}
            onChange={setEmail}
            icon={Mail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
            editable={!busy}
            onSubmitEditing={() => void submit()}
          />
        ))}
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      {!!notice && <AdminNotice tone="success">{notice}</AdminNotice>}
      {!notice && (
        <AdminButton
          primary
          label={token ? "Salvar nova senha" : "Enviar link de recuperação"}
          loading={busy}
          disabled={!valid}
          onPress={() => void submit()}
        />
      )}
      <AdminButton
        label={notice && token ? "Entrar com a nova senha" : "Voltar ao login"}
        disabled={busy}
        variant="ghost"
        onPress={onDone}
      />
    </View>
  );
}
