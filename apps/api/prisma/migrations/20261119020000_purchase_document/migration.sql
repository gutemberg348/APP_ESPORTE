CREATE TABLE "PurchaseDocument" (
    "userId" UUID PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "cpf" CHAR(11) NOT NULL CHECK ("cpf" ~ '^[0-9]{11}$')
);

ALTER TABLE "Ticket"
    ADD COLUMN "purchaseDocumentId" UUID REFERENCES "PurchaseDocument"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Ticket_document_owner_check" CHECK ("purchaseDocumentId" = "userId");
