"use client";
/** Odometer digits: each digit is a 0-9 column that rolls to its value. */
export default function Digits({ value }: { value: string }) {
  return (
    <span className="digits" aria-label={value}>
      {value.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span className="digit" key={i} aria-hidden="true">
            <span style={{ transform: `translateY(-${Number(ch) * 1.45}em)` }}>
              {"0123456789".split("").map((d) => <span key={d} style={{ display: "block", height: "1.45em" }}>{d}</span>)}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden="true">{ch}</span>
        ),
      )}
    </span>
  );
}
