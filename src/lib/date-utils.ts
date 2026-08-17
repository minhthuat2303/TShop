// Date range calculation helpers for T_SHOP

export type DateFilterPeriod = 
  | 'today' 
  | 'yesterday' 
  | '7days' 
  | '30days' 
  | 'this_month' 
  | 'last_month' 
  | 'this_quarter' 
  | 'this_year' 
  | 'custom';

export function resolveDateRange(
  period: string | null,
  customStart?: string | null,
  customEnd?: string | null
): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  
  const formatDate = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = formatDate(now);

  if (period === 'today') {
    return { startDate: todayStr, endDate: todayStr, label: 'Hôm nay' };
  }

  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dStr = formatDate(yesterday);
    return { startDate: dStr, endDate: dStr, label: 'Hôm qua' };
  }

  if (period === '7days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { startDate: formatDate(start), endDate: todayStr, label: '7 ngày qua' };
  }

  if (period === '30days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { startDate: formatDate(start), endDate: todayStr, label: '30 ngày qua' };
  }

  if (period === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: formatDate(start), endDate: formatDate(end), label: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}` };
  }

  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: formatDate(start), endDate: formatDate(end), label: `Tháng ${start.getMonth() + 1}/${start.getFullYear()}` };
  }

  if (period === 'this_quarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), currentQuarter * 3, 1);
    const end = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
    return { startDate: formatDate(start), endDate: formatDate(end), label: `Quý ${currentQuarter + 1}/${now.getFullYear()}` };
  }

  if (period === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return { startDate: formatDate(start), endDate: formatDate(end), label: `Năm ${now.getFullYear()}` };
  }

  if (period === 'custom' && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd, label: `${customStart} - ${customEnd}` };
  }

  // Default to this_month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: formatDate(start), endDate: formatDate(end), label: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}` };
}
