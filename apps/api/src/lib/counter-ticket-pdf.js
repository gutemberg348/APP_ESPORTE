import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

// Vector modules keep both codes sharp on thermal paper and in a forwarded PDF.
function drawCodes(pdf, ticket) {
  const matrix = QRCode.create(ticket.chaveQr, { errorCorrectionLevel: 'M' }).modules;
  const side = 122, module = side / (matrix.size + 8), left = (pdf.page.width - side) / 2, top = pdf.y + 5;
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.get(y, x)) pdf.rect(left + (x + 4) * module, top + (y + 4) * module, module, module);
    }
  }
  pdf.fill();
  const target = {};
  JsBarcode(target, ticket.codigoPortaria.replace(/-/g, ''), { format: 'CODE128', displayValue: false });
  const bits = target.encodings.map(e => e.data).join('');
  const barWidth = (pdf.page.width - 32) / (bits.length + 20);
  for (let x = 0; x < bits.length; x++) {
    if (bits[x] === '1') pdf.rect(16 + (x + 10) * barWidth, top + side + 6, barWidth, 35);
  }
  pdf.fill();
  pdf.y = top + side + 47;
  pdf.font('Helvetica-Bold').fontSize(12).text(ticket.codigoPortaria, { align: 'center' });
}

export async function counterTicketPdf(order) {
  const pdf = new PDFDocument({ autoFirstPage: false, info: { Title: 'Ingressos de bilheteria' } });
  const bytes = [];
  const result = new Promise((resolve, reject) => {
    pdf.on('data', part => bytes.push(part));
    pdf.on('end', () => resolve(Buffer.concat(bytes)));
    pdf.on('error', reject);
  });
  const match = order.partida;
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' }).format(new Date(match.dataPartida));
  const unitPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.valorTotalCentavos / order.ingressos.length / 100);
  for (const ticket of order.ingressos) {
    pdf.addPage({ size: [227, 510], margin: 12 });
    pdf.font('Helvetica-Bold').fontSize(14).text(match.timeMandante + ' × ' + match.timeVisitante);
    pdf.font('Helvetica').fontSize(10).text(date + ' · ' + match.estadio.nome);
    pdf.moveDown().font('Helvetica-Bold').text(ticket.alocacao.setor.nome + ' · ' + (ticket.lote?.nome || 'Ingresso') + ' · ' + unitPrice);
    pdf.font('Helvetica').text(ticket.nomeTitular);
    if (ticket.blocoEscolhido !== null) pdf.text('Bloco ' + ticket.blocoEscolhido + ' · Fileira ' + ticket.fileiraEscolhida + ' · Assento ' + ticket.assentoEscolhido);
    pdf.moveDown();
    if (ticket.status === 'VENDIDO' && order.statusPagamento === 'PAGO') drawCodes(pdf, ticket);
    else pdf.text('Sem acesso · ' + ticket.status);
    pdf.moveDown().font('Helvetica').fontSize(8).text('Ingresso individual · ' + ticket.id, { align: 'center' });
  }
  pdf.end();
  return result;
}
