export function fmtCurrency(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}Rs ${Math.abs(n).toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;
}

export function fmtNum(n: number) {
  return n.toLocaleString("en-LK");
}

export function fmtDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
