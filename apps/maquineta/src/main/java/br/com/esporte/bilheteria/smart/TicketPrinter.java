package br.com.esporte.bilheteria.smart;

import android.graphics.*;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import java.io.*;
import br.com.uol.pagseguro.plugpagservice.wrapper.*;

final class TicketPrinter {
    static void print(File cache, PlugPag terminal, String base64) throws Exception {
        if (terminal.isServiceBusy()) throw new IOException("Aguarde a maquineta ficar disponível.");
        File pdf = File.createTempFile("ingressos-", ".pdf", cache);
        try {
            try (OutputStream out = new FileOutputStream(pdf)) { out.write(Base64.decode(base64, Base64.DEFAULT)); }
            try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY);
                 PdfRenderer reader = new PdfRenderer(fd)) {
                for (int i = 0; i < reader.getPageCount(); i++) {
                    try (PdfRenderer.Page page = reader.openPage(i)) {
                        File image = File.createTempFile("bilhete-", ".png", cache);
                        int width = 384;
                        Bitmap bitmap = Bitmap.createBitmap(width, Math.round(width * page.getHeight() / (float)page.getWidth()), Bitmap.Config.ARGB_8888);
                        try {
                            bitmap.eraseColor(Color.WHITE); page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT);
                            try (OutputStream out = new FileOutputStream(image)) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, out); }
                            PlugPagPrintResult result = terminal.printFromFile(new PlugPagPrinterData(image.getAbsolutePath(), 1, 1));
                            if (result.getResult() != PlugPag.RET_OK) throw new IOException("Confira a impressora. Falha no ingresso " + (i+1) + ".");
                        } finally { bitmap.recycle(); image.delete(); }
                    }
                }
            }
        } finally { pdf.delete(); }
    }
}
