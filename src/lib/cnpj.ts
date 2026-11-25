// CNPJ numérico (14 dígitos) com dígitos verificadores módulo 11.

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Dígitos verificadores para os 12 primeiros dígitos. */
export function cnpjCheckDigits(base12: string): string {
  if (!/^\d{12}$/.test(base12)) throw new RangeError("Base do CNPJ precisa de 12 dígitos");
  const d1 = checkDigit(base12, W1);
  const d2 = checkDigit(base12 + d1, W2);
  return `${d1}${d2}`;
}

/** Aceita com ou sem máscara. Recusa sequências repetidas (00000000000000 etc.). */
export function isValidCnpj(value: string): boolean {
  if (!/^[\d./-]+$/.test(value)) return false;
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  return cnpjCheckDigits(digits.slice(0, 12)) === digits.slice(12);
}

/** Raiz (8 dígitos), usada no path das consultas assíncronas da Receita. */
export function cnpjRoot(value: string): string {
  if (!isValidCnpj(value)) throw new RangeError("CNPJ inválido");
  return onlyDigits(value).slice(0, 8);
}

/** Monta um CNPJ válido a partir da raiz (8) e da filial (4). */
export function buildCnpj(root8: string, branch4 = "0001"): string {
  if (!/^\d{8}$/.test(root8) || !/^\d{4}$/.test(branch4)) {
    throw new RangeError("Raiz precisa de 8 dígitos e filial de 4");
  }
  const base = root8 + branch4;
  return base + cnpjCheckDigits(base);
}

/** "00123456000190" → "00.123.456/0001-90". */
export function formatCnpj(value: string): string {
  const d = onlyDigits(value);
  if (d.length !== 14) throw new RangeError("CNPJ precisa de 14 dígitos");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
