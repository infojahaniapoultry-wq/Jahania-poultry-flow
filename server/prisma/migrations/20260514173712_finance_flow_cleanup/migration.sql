-- AlterTable
ALTER TABLE "ChequeLog" ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CHEQUE',
ADD COLUMN     "sourceId" INTEGER,
ADD COLUMN     "sourceType" TEXT;
