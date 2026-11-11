import React, { useRef, useState } from "react";
import type { AdminPartner } from "@nacional/shared/types";
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
import { useSession } from "../../providers/SessionProvider";
import { partnersApi } from "../../services/partners";
import { parseAmount } from "../../utils/payments";
import { messageOf } from "../../utils/format";
export function PartnerForm({
  partner,
  onClose,
  onSaved,
}: {
  partner: AdminPartner | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { token } = useSession(),
    lock = useRef(false);
  const [name, setName] = useState(partner?.name || ""),
    [discount, setDiscount] = useState(partner?.discount || ""),
    [category, setCategory] = useState(partner?.category || "Alimentação"),
    [icon, setIcon] = useState(partner?.icon || "gift");
  const [description, setDescription] = useState(partner?.description || ""),
    [conditions, setConditions] = useState(partner?.conditions || ""),
    [location, setLocation] = useState(partner?.location || ""),
    [contact, setContact] = useState(partner?.contact || ""),
    [website, setWebsite] = useState(partner?.website || ""),
    [active, setActive] = useState(partner?.active ?? true);
  const offer = partner?.merchant?.offers[0];
  const [cashback, setCashback] = useState(
      ((offer?.cashbackBps || 0) / 100).toFixed(2).replace(".", ","),
    ),
    [commission, setCommission] = useState(
      ((offer?.commissionBps || 0) / 100).toFixed(2).replace(".", ","),
    ),
    [offerActive, setOfferActive] = useState(offer?.active || false),
    [customerQr, setCustomerQr] = useState(offer?.customerQrEnabled || false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (lock.current || !token) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const cashbackBps = parseAmount(cashback, true),
        commissionBps = parseAmount(commission, true);
      if (cashbackBps + commissionBps > 10000)
        throw new Error("Cashback e comissão não podem ultrapassar 100%.");
      await partnersApi.save(
        token,
        {
          name: name.trim(),
          discount: discount.trim(),
          category: category.trim(),
          icon,
          description: description.trim(),
          conditions: conditions.trim(),
          location: location.trim(),
          contact: contact.replace(/\D/g, ""),
          website: website.trim(),
          active,
          offer: {
            cashbackBps,
            commissionBps,
            active: offerActive,
            customerQrEnabled: customerQr,
          },
        },
        partner,
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
      title={partner ? "Editar parceiro" : "Novo parceiro"}
      onClose={busy ? () => {} : onClose}
    >
      <AdminSection
        title="Dados do estabelecimento"
        description="O torcedor verá as informações dos parceiros ativos."
      >
        <AdminFormGrid>
          <AdminField
            label="Nome do parceiro"
            value={name}
            onChange={setName}
            maxLength={100}
            required
            editable={!busy}
          />
          <AdminField
            label="Categoria"
            value={category}
            onChange={setCategory}
            maxLength={60}
            required
            editable={!busy}
          />
          <AdminField
            label="Benefício em destaque"
            value={discount}
            onChange={setDiscount}
            maxLength={100}
            placeholder="Ex.: 10% de desconto"
            required
            editable={!busy}
          />
          <AdminSelect
            label="Ícone"
            value={icon}
            onChange={setIcon}
            disabled={busy}
            options={[
              { value: "gift", label: "Presente" },
              { value: "coffee", label: "Café" },
              { value: "basket", label: "Mercado" },
              { value: "heart", label: "Saúde" },
              { value: "fuel", label: "Combustível" },
              { value: "pizza", label: "Alimentação" },
              { value: "activity", label: "Bem-estar" },
            ]}
          />
        </AdminFormGrid>
        <AdminField
          label="Descrição"
          value={description}
          onChange={setDescription}
          multiline
          maxLength={2000}
          editable={!busy}
        />
        <AdminField
          label="Condições do benefício"
          value={conditions}
          onChange={setConditions}
          multiline
          maxLength={2000}
          editable={!busy}
        />
        <AdminFormGrid>
          <AdminField
            label="Endereço / localização"
            value={location}
            onChange={setLocation}
            maxLength={300}
            editable={!busy}
          />
          <AdminField
            label="Telefone"
            value={contact}
            onChange={setContact}
            mask="phone"
            keyboardType="phone-pad"
            editable={!busy}
          />
          <AdminField
            label="Site (HTTPS)"
            value={website}
            onChange={setWebsite}
            autoCapitalize="none"
            keyboardType="url"
            maxLength={500}
            editable={!busy}
          />
        </AdminFormGrid>
        <AdminToggle
          label="Parceiro ativo no app"
          value={active}
          onChange={setActive}
          disabled={busy}
          hint="Desativar também bloqueia novas cobranças no caixa. O histórico financeiro permanece disponível."
        />
      </AdminSection>
      <AdminSection
        title="Cashback e caixa"
        description="A oferta financeira é independente do desconto divulgado. Os percentuais são aplicados às novas vendas."
      >
        <AdminFormGrid>
          <AdminField
            label="Cashback do cliente (%)"
            value={cashback}
            onChange={setCashback}
            mask="money"
            numeric
            editable={!busy}
          />
          <AdminField
            label="Comissão da empresa (%)"
            value={commission}
            onChange={setCommission}
            mask="money"
            numeric
            editable={!busy}
          />
        </AdminFormGrid>
        <AdminToggle
          label="Habilitar oferta de cashback"
          value={offerActive}
          onChange={setOfferActive}
          disabled={busy}
        />
        <AdminToggle
          label="Permitir QR fixo do estabelecimento"
          value={customerQr}
          onChange={setCustomerQr}
          disabled={busy || !offerActive}
        />
        <AdminNotice>
          Vendas com cashback exigem confirmação do split pelo provedor.
          A API Pix Sicredi de recebimento não executa esse split; pagamentos
          de parceiros permanecem bloqueados nesse modo.
        </AdminNotice>
      </AdminSection>
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminButton
        primary
        label="Salvar parceiro"
        loading={busy}
        onPress={() => void save()}
      />
    </Sheet>
  );
}
