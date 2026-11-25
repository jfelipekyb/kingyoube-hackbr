// Chave de acesso de documento fiscal eletrônico (44 dígitos, DV módulo 11).
// Layout: cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1) código(8) DV(1).

export function accessKeyCheckDigit(base43: string): number {
  if (!/^\d{43}$/.test(base43)) throw new RangeError("Base da chave precisa de 43 dígitos");
  let weight = 2;
  let sum = 0;
  for (let i = base43.length - 1; i >= 0; i--) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidAccessKey(key: string): boolean {
  if (!/^\d{44}$/.test(key)) return false;
  return accessKeyCheckDigit(key.slice(0, 43)) === Number(key[43]);
}

export interface AccessKeyParts {
  uf: string; // 2 dígitos (35 = SP)
  yearMonth: string; // AAMM
  issuerCnpj: string; // 14 dígitos
  model: string; // 2 dígitos (55 = NF-e)
  series: string; // 3 dígitos
  number: string; // 9 dígitos
  emissionType: string; // 1 dígito
  code: string; // 8 dígitos
}

const PART_LENGTHS: [keyof AccessKeyParts, number][] = [
  ["uf", 2],
  ["yearMonth", 4],
  ["issuerCnpj", 14],
  ["model", 2],
  ["series", 3],
  ["number", 9],
  ["emissionType", 1],
  ["code", 8],
];

export function buildAccessKey(parts: AccessKeyParts): string {
  const base = PART_LENGTHS.map(([name, length]) => {
    const value = parts[name];
    if (!new RegExp(`^\\d{${length}}$`).test(value)) {
      throw new RangeError(`Campo ${name} da chave precisa de ${length} dígitos`);
    }
    return value;
  }).join("");
  return base + accessKeyCheckDigit(base);
}

export function parseAccessKey(key: string): AccessKeyParts {
  if (!isValidAccessKey(key)) throw new RangeError("Chave de acesso inválida");
  let offset = 0;
  const parts = {} as AccessKeyParts;
  for (const [name, length] of PART_LENGTHS) {
    parts[name] = key.slice(offset, offset + length);
    offset += length;
  }
  return parts;
}

/** Máscara para e-mail e telas públicas: "3526…7890". */
export function maskAccessKey(key: string): string {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
