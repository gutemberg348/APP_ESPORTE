import { config } from 'dotenv';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { newTestTxid, runSicrediTest, safeTestFailure, SicrediTestError, testSettings } from './sicredi-test-core.mjs';

const commands = ['certificado', 'conexao', 'auth', 'webhook', 'referencia', 'criar', 'consultar', 'acompanhar', 'cancelar'];
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { help: { type: 'boolean' }, txid: { type: 'string' }, valor: { type: 'string' }, expiracao: { type: 'string' }, tentativas: { type: 'string' }, intervalo: { type: 'string' }, scope: { type: 'string' } } });
  if (values.help) {
    console.log(`Testes Sicredi isolados: npm run test:sicredi -- [comando] [opções]
Padrão: conexao (certificado, OAuth de leitura e consulta do webhook).
certificado                Confere arquivos mTLS sem chamar o banco.
conexao                    Autentica cob.read/pix.read/webhook.read e consulta webhook.
auth --scope cob.write     Testa apenas autenticação no escopo informado.
webhook                    Consulta cadastro, sem criar/substituir webhook.
referencia                 Gera TXID TST, sem conexão/credenciais.
criar --txid TST... --valor 1,00 [--expiracao 300]
consultar --txid TST... [--valor 1,00]
acompanhar --txid TST... [--valor 1,00 --tentativas 12 --intervalo 5]
cancelar --txid TST...      Remove somente cobrança de teste ainda sem recebimento.
Em production, criar gera uma cobrança bancária real. Guarde o TXID antes de criar.
Não emite ingresso/pedido, não altera saldo/DB, não envia Pix e não faz devolução.`);
  } else {
    const command = positionals[0] || 'conexao';
    if (positionals.length > 1 || !commands.includes(command)) throw new SicrediTestError('TEST_COMMAND', 'Use um comando válido. Consulte --help.');
    if (command === 'referencia') console.log(newTestTxid());
    else {
      // Docker supplies the root Compose environment; direct local Node uses API .env.
      // Do not import application env/database, start workers, or change PAYMENT_MODE.
      config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
      const settings = testSettings(process.env, { certificateOnly: command === 'certificado' });
      const report = (result) => console.log(JSON.stringify(result));
      report({ step: 'start', command, environment: settings.SICREDI_PIX_ENV, changesBank: ['criar', 'cancelar'].includes(command), databaseUsed: false });
      const result = await runSicrediTest(command, values, settings, { report });
      report(result);
      if (command === 'acompanhar' && !result.paymentConfirmed) process.exitCode = 2;
    }
  }
} catch (error) { console.error(JSON.stringify(safeTestFailure(error))); process.exitCode = 1; }
