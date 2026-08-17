export function formatDocumentNo(prefix: string, id: number, width = 5) {
  return `${prefix}-${String(id).padStart(width, '0')}`;
}
