import { TIMER_STATE } from "@/domain/labels";
import { formatDuration } from "@/domain/timer";
import { timerView } from "@/services/timer";
import { Badge, fmtDate, Progress } from "../ui";

export async function TimerSummary({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const v = await timerView(projectId);
  if (!v) return null;
  const st = TIMER_STATE[v.state];
  const unit = v.mode === "WORKING" ? "раб. дн." : "дн.";
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={v.warning ? "warning" : st.tone}>{v.warning && v.state === "running" ? "Срок близко" : st.label}</Badge>
        {v.state !== "not_started" && v.state !== "completed" && (
          <span className={v.remainingDays < 0 ? "font-medium text-danger-700" : "text-muted"}>
            {v.remainingDays < 0 ? `просрочка ${Math.abs(v.remainingDays).toFixed(1)} ${unit}` : `осталось ${v.remainingDays.toFixed(1)} ${unit}`}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={v.warning ? "warning" : st.tone}>{v.warning && v.state === "running" ? "Приближается срок" : st.label}</Badge>
        <span className="text-xs text-muted">{v.mode === "WORKING" ? "Рабочие дни" : "Календарные дни"}</span>
      </div>
      <p className="text-3xl font-semibold tracking-tight">
        {v.state === "not_started" ? `${v.durationDays} ${unit}` : v.remainingDays < 0 ? <span className="text-danger-700">−{Math.abs(v.remainingDays).toFixed(1)} {unit}</span> : `${v.remainingDays.toFixed(1)} ${unit}`}
        <span className="ml-2 text-sm font-normal text-muted">{v.state === "not_started" ? "договорный срок" : v.remainingDays < 0 ? "просрочка" : "осталось"}</span>
      </p>
      <Progress value={v.percentUsed} label="Использовано срока" />
      {v.activePause && (
        <p className="rounded-lg border border-[#f3d9ac] bg-warning-50 px-3 py-2 text-sm text-warning-700">
          ◷ Отсчёт остановлен: {"reason" in v.activePause ? (v.activePause as { reason: string }).reason : "ожидаются данные от заказчика"}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Старт</dt>
          <dd>{fmtDate(v.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Договорная дата</dt>
          <dd>{fmtDate(v.contractualEnd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Прогноз с учётом пауз</dt>
          <dd className="font-medium">{v.state === "overdue" ? "срок истёк" : fmtDate(v.forecastEnd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Паузы</dt>
          <dd>
            {v.pauseCount} · {formatDuration(v.pausedMs)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
