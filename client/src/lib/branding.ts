export const VOICEPLS_URL = 'https://www.voicepls.com/';
export const VOICEPLS_FOOTER = 'Powered by Voicepls • AI & Software Development Company • voicepls.com';
export const VOICEPLS_NAME = 'Voicepls';
export const VOICEPLS_TAGLINE = 'AI & Software Development Company';

export function drawVoiceplsPdfFooter(doc: any, pageWidth: number, pageHeight: number) {
  const centerX = pageWidth / 2;
  const brandY = pageHeight - 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(239, 123, 16);
  doc.text(`Powered by ${VOICEPLS_NAME}`, centerX, brandY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139);
  doc.text(VOICEPLS_TAGLINE, centerX, brandY + 5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(5, 150, 105);
  doc.text('voicepls.com', centerX, brandY + 10, { align: 'center' });
  doc.link(centerX - 31, brandY - 6, 62, 16, { url: VOICEPLS_URL });
}
