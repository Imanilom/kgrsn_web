function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDateString(date = new Date()) {
  return toLocalDateString(date);
}

export function getSundaySaturdayRange(value) {
  if (!value) return null;
  const selected = new Date(`${value}T00:00:00`);
  if (Number.isNaN(selected.getTime())) return null;

  const start = new Date(selected);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  };
}

export function shiftDateByWeeks(value, weeks) {
  if (!value) return value;
  const selected = new Date(`${value}T00:00:00`);
  if (Number.isNaN(selected.getTime())) return value;
  selected.setDate(selected.getDate() + weeks * 7);
  return toLocalDateString(selected);
}
