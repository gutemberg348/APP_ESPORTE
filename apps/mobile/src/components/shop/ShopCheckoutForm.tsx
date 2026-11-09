import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import type { Product, ProductVariant, ShopSettings, ShopQuote, ShopAddress, ShopCheckoutInput, ShopOrder } from '@nacional/shared/shop';
import { digits } from '@nacional/shared/forms';
import { useSession } from '../../providers/SessionProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { shopApi } from '../../services/shop';
import { ApiError } from '../../services/api';
import { money, messageOf } from '../../utils/format';
import { requestKey } from '../../utils/payments';
import { Text } from '../Typography';
import { Button } from '../ui';
import { Sheet } from '../Sheet';
import { AdminField, AdminSelect, AdminFormGrid, AdminNotice } from '../admin/AdminControls';
export type CartLine = { product: Product; variant: ProductVariant; quantity: number };
const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export function ShopCheckoutForm({ lines, settings, onClose, onSaved }: { lines: CartLine[]; settings: ShopSettings; onClose: () => void; onSaved: (order: ShopOrder) => void }) {
  const { token, member } = useSession(), { colors } = useTheme();
  const [recipient, setRecipient] = useState(member?.name || ''), [phone, setPhone] = useState(/^[\d\s()+-]+$/.test(member?.contact || '') ? member!.contact : '');
  const [method, setMethod] = useState<'PICKUP' | 'DELIVERY'>(settings.pickupEnabled ? 'PICKUP' : 'DELIVERY');
  const [address, setAddress] = useState<ShopAddress>({ postalCode: '', street: '', number: '', complement: '', district: '', city: '', state: 'PB' });
  const [quote, setQuote] = useState<ShopQuote | null>(null), [optionId, setOptionId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [addressNotice, setAddressNotice] = useState(''), [uncertain, setUncertain] = useState(false);
  const lock = useRef(false), attempt = useRef<ShopCheckoutInput | null>(null), sequence = useRef(0);
  const choice = quote?.options.find((option) => option.id === optionId), editable = !busy && !uncertain;
  const cart = () => ({ items: lines.map((line) => ({ variantId: line.variant.id, quantity: line.quantity })), deliveryMethod: method, postalCode: method === 'DELIVERY' ? digits(address.postalCode, 8) : '' });
  function changeAddress(patch: Partial<ShopAddress>) { setAddress((value) => ({ ...value, ...patch })); if (patch.postalCode !== undefined) { sequence.current++; setQuote(null); setOptionId(''); setAddressNotice(''); } }
  async function run(work: () => Promise<unknown>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work(); } catch (err) { setError(messageOf(err)); } finally { lock.current = false; setBusy(false); } }
  async function lookup() {
    const cep = digits(address.postalCode, 8), current = sequence.current;
    if (cep.length !== 8) throw new Error('Informe o CEP completo.');
    try { const fresh = await shopApi.postalCode(token!, cep); if (sequence.current === current) { setAddress((value) => ({ ...value, ...fresh, postalCode: cep })); setAddressNotice('Endereço encontrado. Confira o número e complemento.'); } }
    catch (err) { setAddressNotice(messageOf(err)); }
  }
  async function calculate() { const fresh = await shopApi.quote(token!, cart()); setQuote(fresh); setOptionId(fresh.options[0]?.id || ''); }
  async function submit() {
    let body = attempt.current;
    if (!body) {
      if (!quote || !choice) throw new Error('Calcule e selecione a entrega primeiro.');
      if (recipient.trim().length < 2 || !/^[1-9]{2}[2-9]\d{7,8}$/.test(digits(phone, 11))) throw new Error('Informe o nome e um telefone com DDD.');
      if (method === 'DELIVERY' && (!address.street.trim() || !address.number.trim() || !address.district.trim() || !address.city.trim())) throw new Error('Complete o endereço para entrega.');
      body = { ...cart(), quoteId: quote.id, shippingOptionId: choice.id, recipient: recipient.trim(), phone: digits(phone, 11), ...(method === 'DELIVERY' ? { address: { ...address, postalCode: digits(address.postalCode, 8) } } : {}), expectedTotalCents: choice.totalCents, requestKey: requestKey() };
      attempt.current = body;
    }
    try { const order = await shopApi.checkout(token!, body); onSaved(order); }
    catch (err) { if (err instanceof ApiError && err.status > 0 && err.status < 500) { attempt.current = null; setUncertain(false); if (['SHOP_PRICE_CHANGED', 'SHOP_QUOTE_EXPIRED'].includes(err.code)) setQuote(null); } else setUncertain(true); throw err; }
  }
  return <Sheet visible title="Finalizar pedido" onClose={busy ? () => {} : onClose}><View style={{ gap: 8 }}>{lines.map((line) => <Text key={line.variant.id} style={{ color: colors.text, fontSize: 13 }}>{line.quantity} × {line.product.name} · {line.variant.label} · {money(line.quantity * line.product.priceCents)}</Text>)}</View><AdminField label="Nome de quem vai receber" value={recipient} onChange={setRecipient} required autoComplete="name" editable={editable} maxLength={100} /><AdminField label="Telefone com DDD" value={phone} onChange={setPhone} mask="phone" keyboardType="phone-pad" autoComplete="tel" placeholder="(83) 99999-9999" required editable={editable} />
    <AdminSelect label="Como deseja receber?" value={method} onChange={(value) => { setMethod(value as typeof method); setQuote(null); setOptionId(''); }} disabled={!editable} options={[...(settings.pickupEnabled ? [{ value: 'PICKUP', label: 'Retirar na loja · sem frete' }] : []), { value: 'DELIVERY', label: 'Receber no endereço' }]} />
    {method === 'PICKUP' ? <AdminNotice>{settings.pickupAddress}</AdminNotice> : <><AdminField label="CEP" value={address.postalCode} onChange={(postalCode) => changeAddress({ postalCode })} mask="postalCode" keyboardType="number-pad" autoComplete="postal-code" placeholder="00000-000" required editable={editable} /><Button secondary label="Buscar endereço pelo CEP" loading={busy} disabled={!editable || digits(address.postalCode).length !== 8} onPress={() => void run(lookup)} />{!!addressNotice && <Text accessibilityRole="alert" style={{ color: colors.muted, fontSize: 12 }}>{addressNotice}</Text>}<AdminField label="Rua / avenida" value={address.street} onChange={(street) => changeAddress({ street })} required editable={editable} autoComplete="street-address" maxLength={150} /><AdminFormGrid><AdminField label="Número" value={address.number} onChange={(number) => changeAddress({ number })} required grow editable={editable} maxLength={20} /><AdminField label="Complemento (opcional)" value={address.complement} onChange={(complement) => changeAddress({ complement })} grow editable={editable} maxLength={100} /></AdminFormGrid><AdminField label="Bairro" value={address.district} onChange={(district) => changeAddress({ district })} required editable={editable} maxLength={100} /><AdminFormGrid><AdminField label="Cidade" value={address.city} onChange={(city) => changeAddress({ city })} required grow editable={editable} maxLength={100} /><AdminSelect label="UF" value={address.state} onChange={(state) => changeAddress({ state })} options={states.map((value) => ({ value, label: value }))} grow disabled={!editable} /></AdminFormGrid></>}
    <Button secondary label={method === 'PICKUP' ? 'Conferir total para retirada' : quote ? 'Recalcular frete' : 'Calcular frete'} loading={busy} disabled={!editable} onPress={() => void run(calculate)} />
    {quote && <><AdminSelect label="Opção de entrega" value={optionId} onChange={setOptionId} disabled={!editable} options={quote.options.map((option) => ({ value: option.id, label: `${option.name} · ${option.amountCents ? money(option.amountCents) : 'Grátis'}`, description: method === 'PICKUP' ? 'Aguarde a confirmação para retirar.' : `${option.minDays}–${option.maxDays} dias úteis após postagem${option.testMode ? ' · cotação de teste' : ''}` }))} /><View style={{ gap: 8 }}><Text style={{ color: colors.muted, fontSize: 13 }}>Produtos: {money(quote.subtotalCents)}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>Frete: {money(choice?.amountCents || 0)}</Text><Text style={{ color: colors.text, fontSize: 23, fontWeight: '700' }}>Total {money(choice?.totalCents || 0)}</Text></View><Text style={{ color: colors.subtle, fontSize: 11 }}>Os produtos ficam reservados por 30 minutos após confirmar. A disponibilidade será conferida novamente.</Text></>}
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}{uncertain && <AdminNotice tone="warning">A resposta da compra não chegou. Tente consultar a mesma operação pelo botão abaixo ou feche e confira Meus pedidos antes de criar outra compra. Os dados foram mantidos para evitar duplicidade.</AdminNotice>}<Button label={uncertain ? 'Consultar a mesma compra' : 'Confirmar pedido'} loading={busy} disabled={!uncertain && (!quote || !choice || !recipient.trim() || !phone.trim())} onPress={() => void run(submit)} />
  </Sheet>;
}
