import React, { useState } from 'react';
import { digits, validTaxId } from '@nacional/shared/forms';
import { useSession } from '../providers/SessionProvider';
import { clubApi } from '../services/club';
import { AdminField } from './admin/AdminControls';

export function usePurchaseCpf() {
  const { token, member, demoMode, updateMember } = useSession();
  const [value, setValue] = useState('');
  const needed = !!member && !demoMode && !member.hasPurchaseCpf;

  async function save() {
    if (!needed) return;
    const cpf = digits(value);
    if (cpf.length !== 11 || !validTaxId(cpf)) throw new Error('Confira os 11 dígitos do seu CPF para continuar.');
    if (!token) throw new Error('Entre novamente para continuar.');
    await clubApi.savePurchaseCpf(token, cpf);
    updateMember(current => current && current.id === member.id ? { ...current, hasPurchaseCpf: true } : current);
    setValue('');
  }

  const field = needed ? <AdminField label="Seu CPF" value={value} onChange={setValue} mask="document"
    keyboardType="number-pad" placeholder="000.000.000-00" maxLength={14}
    hint="Só na primeira compra. O CPF fica salvo na sua conta." /> : null;
  return { needed, field, save };
}
