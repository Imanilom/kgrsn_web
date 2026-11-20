import { getSundaySaturdayRange, shiftDateByWeeks } from "@/lib/weekRange";

function formatDate(value, weekday) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    ...(weekday ? { weekday } : {}),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function WeekRangePicker({ value, onChange }) {
  const range = getSundaySaturdayRange(value);

  return (
    <div style={{ minWidth: 250 }}>
      <label className="form-label" htmlFor="week-anchor">Pilih tanggal dalam minggu</label>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="Periode minggu sebelumnya"
          disabled={!value}
          onClick={() => onChange(shiftDateByWeeks(value, -1))}
        >
          ‹
        </button>
        <input
          id="week-anchor"
          type="date"
          className="form-control"
          value={value}
          onChange={event => onChange(event.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="Periode minggu berikutnya"
          disabled={!value}
          onClick={() => onChange(shiftDateByWeeks(value, 1))}
        >
          ›
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 5 }}>
        {range
          ? `Periode ${formatDate(range.start, "long")} – ${formatDate(range.end, "long")}`
          : "Pilih tanggal untuk menampilkan periode Minggu–Sabtu."}
      </div>
    </div>
  );
}
