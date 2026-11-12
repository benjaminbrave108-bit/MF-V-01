import { money, orderedMoney } from "../lib/finance";

// Para birimlerini alt alta gösterir: önce $ (büyük), sonra Euro ve diğer birimler; her satır bir öncekinden biraz küçüktür.
const SIZES = ["1em", "0.84em", "0.72em", "0.64em", "0.58em"];
export function MoneyStack({ by, className }: { by: Record<string, number>; className?: string }) {
  const entries = orderedMoney(by);
  if (!entries.length) return <span className={className}>{money(0)}</span>;
  return (
    <span className={`moneyStack${className ? ` ${className}` : ""}`}>
      {entries.map(([currency, v], i) => (
        <span key={currency} className="msLine" style={{ fontSize: SIZES[Math.min(i, SIZES.length - 1)] }}>{money(v, currency)}</span>
      ))}
    </span>
  );
}
