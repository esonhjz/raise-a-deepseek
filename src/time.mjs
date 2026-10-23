const SLOTS = [[23, '深夜'], [19, '晚上'], [17, '傍晚'], [13, '下午'], [11, '中午'], [9, '上午'], [7, '早上'], [5, '清晨'], [0, '凌晨']];
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function timeContextOf(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return '';
  const hour = now.getHours();
  const slot = (SLOTS.find(([start]) => hour >= start) ?? [0, '凌晨'])[1];
  const day = now.getDay();
  const kind = day === 0 || day === 6 ? '周末' : '工作日';
  const hh = String(hour).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `现在是 ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${WEEK[day]} ${hh}:${mm}，${slot}，${kind}。`;
}
