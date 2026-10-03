"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { setTaskDone } from "@/app/actions/flows"

type TaskRow = { id: number; title: string; description: string | null; status: string; createdAt: string }
type RunRow = { id: number; flowName: string; status: string; log: string; createdAt: string }

const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })

function parseLog(log: string): { action?: string; ok?: boolean; message?: string }[] {
  try {
    return JSON.parse(log)
  } catch {
    return []
  }
}

export function ActivityPanel({ tasks, runs, canUpdate }: { tasks: TaskRow[]; runs: RunRow[]; canUpdate: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarefas geradas</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa criada pelos fluxos.</p>
          ) : (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 py-2.5">
                  <Checkbox
                    className="mt-1"
                    checked={t.status === "done"}
                    disabled={!canUpdate}
                    aria-label={`Concluir tarefa ${t.title}`}
                    onCheckedChange={async (v) => {
                      try {
                        await setTaskDone(t.id, v === true)
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro ao atualizar tarefa.")
                      }
                    }}
                  />
                  <div className="min-w-0">
                    <p className={t.status === "done" ? "text-sm line-through text-muted-foreground" : "text-sm font-medium"}>{t.title}</p>
                    {t.description && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{t.description}</p>}
                    <p className="text-xs text-muted-foreground">{fmtDate(t.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de execuções</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum fluxo foi executado ainda.</p>
          ) : (
            <ul className="divide-y">
              {runs.map((r) => (
                <li key={r.id} className="space-y-1 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.flowName}</p>
                    <Badge variant={r.status === "success" ? "default" : r.status === "error" ? "destructive" : "secondary"}>
                      {r.status === "success" ? "Sucesso" : r.status === "error" ? "Erro" : "Condições não atendidas"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</p>
                  {parseLog(r.log).map((l, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {l.ok ? "OK" : "Falha"} - {l.action}: {l.message}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
