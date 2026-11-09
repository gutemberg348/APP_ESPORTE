import React, { useRef, useState } from "react";
import type { PartnerBenefit } from "@nacional/shared/types";
import { Sheet } from "../Sheet";
import {
  AdminButton,
  AdminDateTimeField,
  AdminField,
  AdminFormGrid,
  AdminNotice,
  AdminToggle,
} from "./AdminControls";
import { useSession } from "../../providers/SessionProvider";
import { partnersApi } from "../../services/partners";
import { formDate, parseClubDate } from "../../utils/admin";
import { messageOf } from "../../utils/format";
export function PartnerBenefitForm({
  partnerId,
  benefit,
  onClose,
  onSaved,
}: {
  partnerId: string;
  benefit: PartnerBenefit | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { token } = useSession(),
    lock = useRef(false);
  const [title, setTitle] = useState(benefit?.title || ""),
    [description, setDescription] = useState(benefit?.description || ""),
    [conditions, setConditions] = useState(benefit?.conditions || ""),
    [startsAt, setStartsAt] = useState(
      benefit?.startsAt ? formDate(benefit.startsAt) : "",
    ),
    [endsAt, setEndsAt] = useState(
      benefit?.endsAt ? formDate(benefit.endsAt) : "",
    ),
    [active, setActive] = useState(benefit?.active ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (lock.current || !token) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await partnersApi.benefit(
        token,
        {
          partnerId,
          title: title.trim(),
          description: description.trim(),
          conditions: conditions.trim(),
          startsAt: startsAt ? parseClubDate(startsAt) : null,
          endsAt: endsAt ? parseClubDate(endsAt) : null,
          active,
        },
        benefit,
      );
      await onSaved();
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
      title={benefit ? "Editar oferta" : "Nova oferta"}
      onClose={busy ? () => {} : onClose}
    >
      <AdminField
        label="Título da oferta"
        value={title}
        onChange={setTitle}
        required
        maxLength={100}
        editable={!busy}
      />
      <AdminField
        label="Descrição"
        value={description}
        onChange={setDescription}
        multiline
        maxLength={2000}
        editable={!busy}
      />
      <AdminField
        label="Condições"
        value={conditions}
        onChange={setConditions}
        multiline
        maxLength={2000}
        editable={!busy}
      />
      <AdminFormGrid>
        <AdminDateTimeField
          label="Início da divulgação"
          value={startsAt}
          onChange={setStartsAt}
          optional
          disabled={busy}
        />
        <AdminDateTimeField
          label="Fim da divulgação"
          value={endsAt}
          onChange={setEndsAt}
          optional
          disabled={busy}
        />
      </AdminFormGrid>
      <AdminToggle
        label="Oferta ativa"
        value={active}
        onChange={setActive}
        disabled={busy}
        hint="O app exibe somente ofertas ativas dentro do período definido."
      />
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminButton
        primary
        label="Salvar oferta"
        loading={busy}
        onPress={() => void save()}
      />
    </Sheet>
  );
}
