const fmt = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
export const fmtCurrency = (n: number) => fmt.format(n);
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : "—";
