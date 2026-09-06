export default function StatusCard({ icon: Icon, label, value, tone = "neutral" }) {
  const toneColor = {
    neutral: "text-text",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <div className="flex items-center gap-3 bg-background/40 border border-border rounded-md px-3 py-2.5">
      <Icon size={16} className="text-text-secondary shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-text-secondary leading-none mb-1">{label}</p>
        <p className={`text-sm font-semibold leading-none ${toneColor}`}>{value}</p>
      </div>
    </div>
  );
}