import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDocument, formatPhone, formatPostalCode, formatMoneyInput, centsInput, moneyToCents, maskInput } from '@nacional/shared/forms';
test('CPF, CNPJ, telefone e CEP têm máscaras brasileiras progressivas e aceitam colagem', () => {
  assert.equal(formatDocument('52998224725'), '529.982.247-25');
  assert.equal(formatDocument('11.222.333/0001-81'), '11.222.333/0001-81');
  assert.equal(formatDocument('5299'), '529.9'); assert.equal(formatDocument('5299822'), '529.982.2'); assert.equal(formatDocument('5299822472'), '529.982.247-2');
  assert.equal(formatPhone('+55 83 99999-9999'), '(83) 99999-9999');
  assert.equal(formatPhone('8334221234'), '(83) 3422-1234');
  assert.equal(formatPostalCode('58.700-000'), '58700-000');
  assert.equal(maskInput('user@test.local', 'contact'), 'user@test.local');
  assert.equal(maskInput('83999999999', 'contact'), '(83) 99999-9999');
});
test('valores BRL preservam centavos e separadores sem arredondamento em ponto flutuante', () => {
  for (const cents of [0, 1, 9, 10, 99, 100, 1999, 123456, 100000000]) assert.equal(moneyToCents(centsInput(cents)), cents);
  assert.equal(formatMoneyInput('R$ 1.234,56'), '1.234,56');
  assert.equal(formatMoneyInput('1'), '0,01'); assert.equal(formatMoneyInput(''), '');
  assert.equal(moneyToCents('R$ 1.234,56'), 123456);
  for (const value of ['1,234', '-1,00', 'abc', '1.23,45', '1e3', '', '1.000.000,01']) assert.throws(() => moneyToCents(value));
});
