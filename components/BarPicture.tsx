import { barCells, type Cell, type Picture } from "@/lib/content";
import styles from "./flow.module.css";

// Bars drawn as a grid of squares. Under them: each bar's height, plus an
// optional row of blue numbers (e.g. "tallest so far").
export default function BarPicture({ heights, highlight, water, labels, caption }: Picture) {
  const rows = barCells(heights);

  function cellClass(cell: Cell, x: number): string {
    const column = x === highlight ? ` ${styles.highlightColumn}` : "";
    if (cell === "bar") return (x === highlight ? styles.barHighlight : styles.bar) + column;
    if (cell === "water" && water) return styles.water + column;
    return styles.air + column;
  }

  return (
    <figure className={styles.picture}>
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${heights.length}, 30px)` }}
        role="img"
        aria-label={`Bars of heights ${heights.join(", ")}`}
      >
        {rows.flatMap((row, y) =>
          row.map((cell, x) => <span key={`${y}-${x}`} className={cellClass(cell, x)} />),
        )}
        {heights.map((h, x) => (
          <span key={`h${x}`} className={x === highlight ? styles.heightHighlight : styles.heightLabel}>
            {h}
          </span>
        ))}
        {labels?.map((label, x) => (
          <span key={`l${x}`} className={styles.valueLabel}>
            {label}
          </span>
        ))}
      </div>
      {caption && <figcaption className={styles.dim}>{caption}</figcaption>}
    </figure>
  );
}
