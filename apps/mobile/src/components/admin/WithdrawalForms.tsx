import React, { useState } from "react";
import type {
  FinancialSettings,
  WithdrawalRequest,
  WithdrawalSummary,
} from "@nacional/shared/finance";
import { centsInput } from "@nacional/shared/forms";
import { Sheet } from "../Sheet";
import {
  AdminButton,
  AdminDateTimeField,
  AdminField,
  AdminNotice,
  AdminToggle,
} from "./AdminControls";
import { PayoutAttachments } from "./PayoutAttachments";
import { useShopAction } from "./shop/useShopAction";
import { useSession } from "../../providers/SessionProvider";
import { withdrawalsApi } from "../../services/withdrawals";
import { requestKey, parseAmount } from "../../utils/payments";
import { formDate, parseClubDate } from "../../utils/admin";
import { money } from "../../utils/format";
export function WithdrawalCreateForm({
  summary,
  settings,
  onClose,
  onSaved,
}: {
  summary: WithdrawalSummary;
  settings: FinancialSettings;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { token } = useSession(),
    { busy, error, run } = useShopAction();
  const [expectedAvailable] = useState(summary.availableToRequestCents),
    [amount, setAmount] = useState(centsInput(summary.availableToRequestCents)),
    [recipient, setRecipient] = useState(settings.clubRecipient),
    [pixKey, setPixKey] = useState(settings.clubPixKey),
    [notes, setNotes] = useState(""),
    [key] = useState(requestKey);
  return (
    <Sheet
      visible
      title="Novo pedido de saque"
      onClose={busy ? () => {} : onClose}
    >
      <AdminNotice>
        Saldo livre para novos pedidos: {money(expectedAvailable)}. O pedido
        fica pendente até registrar a transferência realizada.
      </AdminNotice>
      <AdminField
        label="Valor solicitado"
        prefix="R$"
        value={amount}
        onChange={setAmount}
        numeric
        required
        editable={!busy}
      />
      <AdminField
        label="Favorecido"
        value={recipient}
        onChange={setRecipient}
        maxLength={200}
        required
        editable={!busy}
      />
      <AdminField
        label="Chave Pix / dados para conferência"
        value={pixKey}
        onChange={setPixKey}
        autoCapitalize="none"
        maxLength={200}
        editable={!busy}
      />
      <AdminField
        label="Observações"
        value={notes}
        onChange={setNotes}
        multiline
        maxLength={1000}
        editable={!busy}
      />
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminButton
        primary
        label="Criar pedido pendente"
        loading={busy}
        disabled={recipient.trim().length < 2 || !amount}
        onPress={() =>
          void run(async () => {
            await withdrawalsApi.create(token!, {
              amountCents: parseAmount(amount),
              expectedAvailableCents: expectedAvailable,
              recipient: recipient.trim(),
              pixKey: pixKey.trim(),
              notes: notes.trim(),
              requestKey: key,
            });
            await onSaved();
          })
        }
      />
    </Sheet>
  );
}
export function WithdrawalSendForm({
  withdrawal,
  summary,
  onClose,
  onSaved,
}: {
  withdrawal: WithdrawalRequest;
  summary: WithdrawalSummary;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { token } = useSession(),
    { busy, error, run } = useShopAction();
  const [expectedBalance] = useState(summary.availableCents),
    [reference, setReference] = useState(""),
    [date, setDate] = useState(formDate(new Date().toISOString())),
    [notes, setNotes] = useState(""),
    [verified, setVerified] = useState(false),
    [key] = useState(requestKey);
  return (
    <Sheet
      visible
      title="Registrar envio realizado"
      onClose={busy ? () => {} : onClose}
    >
      <AdminNotice tone="warning">
        Confirme somente depois de transferir {money(withdrawal.amountCents)}{" "}
        para {withdrawal.recipient}. O registro reduz o saldo do time e não
        envia Pix automaticamente.
      </AdminNotice>
      {!!withdrawal.pixKey && (
        <AdminNotice>
          Destino informado no pedido: {withdrawal.pixKey}
        </AdminNotice>
      )}
      <AdminField
        label="Identificador único da transferência"
        value={reference}
        onChange={setReference}
        maxLength={100}
        editable={!busy}
        required
      />
      <AdminDateTimeField
        label="Data e hora do envio"
        value={date}
        onChange={setDate}
        disabled={busy}
      />
      <AdminField
        label="Observações do envio"
        value={notes}
        onChange={setNotes}
        maxLength={1000}
        multiline
        editable={!busy}
      />
      <PayoutAttachments parent={{ withdrawalId: withdrawal.id }} />
      <AdminToggle
        checkbox
        label="Já transferi e conferi o valor e o favorecido"
        value={verified}
        onChange={setVerified}
        disabled={busy}
      />
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminButton
        primary
        label="Confirmar envio e baixar saldo"
        loading={busy}
        disabled={!verified || reference.trim().length < 5}
        onPress={() =>
          void run(async () => {
            await withdrawalsApi.send(token!, {
              id: withdrawal.id,
              version: withdrawal.version,
              expectedBalanceCents: expectedBalance,
              reference: reference.trim(),
              transferredAt: parseClubDate(date),
              notes: notes.trim(),
              transferVerified: true,
              requestKey: key,
            });
            await onSaved();
          })
        }
      />
    </Sheet>
  );
}
