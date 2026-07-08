/** Formata telefone BR (10 ou 11 dígitos); devolve original se não reconhecer. */
export function formatPhoneBr(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

export function phoneTelHref(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits ? `tel:+55${digits}` : '';
}
