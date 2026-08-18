// Standard Currency & Number Formatter: #,###.00

export function formatCurrency(num: number | string | null | undefined, suffix: string = ' đ'): string {
  const val = Number(num) || 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);

  return suffix ? `${formatted}${suffix}` : formatted;
}

export function formatNumber(num: number | string | null | undefined): string {
  const val = Number(num) || 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function formatInteger(num: number | string | null | undefined): string {
  const val = Number(num) || 0;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(val);
}
