"use client"

import { useMemo, useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, Globe, Monitor, MapPin, Activity, LogIn, Users } from "lucide-react"
import { getAuditLogs, type AuditLogRow, type AuditStats } from "@/app/actions/audit"
import { RESOURCES } from "@/lib/constants"
import { DataPagination, usePagination } from "@/components/ui/data-pagination"

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  login: { label: "Login", variant: "secondary" },
  login_failed: { label: "Login falhou", variant: "destructive" },
  logout: { label: "Logout", variant: "outline" },
  create: { label: "Criação", variant: "default" },
  update: { label: "Edição", variant: "secondary" },
  delete: { label: "Exclusão", variant: "destructive" },
}

const RESOURCE_LABELS: Record<string, string> = {
  auth: "Autenticação",
  ...Object.fromEntries(RESOURCES.map((r) => [r.key, r.label])),
}

function formatDate(d: Date) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AuditMonitor({
  initialLogs,
  stats,
}: {
  initialLogs: AuditLogRow[]
  stats: AuditStats
}) {
  const [logs, setLogs] = useState(initialLogs)
  const [search, setSearch] = useState("")
  const [action, setAction] = useState("all")
  const [resource, setResource] = useState("all")
  const [selected, setSelected] = useState<AuditLogRow | null>(null)
  const [isPending, startTransition] = useTransition()

  function applyFilters(next: { action?: string; resource?: string; search?: string }) {
    startTransition(async () => {
      const rows = await getAuditLogs({
        action: next.action ?? action,
        resource: next.resource ?? resource,
        search: next.search ?? search,
      })
      setLogs(rows)
    })
  }

  const statCards = useMemo(
    () => [
      { label: "Eventos registrados", value: stats.total, icon: Activity },
      { label: "Nas últimas 24h", value: stats.last24h, icon: Globe },
      { label: "Logins (7 dias)", value: stats.logins7d, icon: LogIn },
      { label: "Usuários ativos (7d)", value: stats.activeUsers7d, icon: Users },
    ],
    [stats],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <s.icon className="size-5" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-semibold tabular-nums">{s.value}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar por usuário, ação, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters({})}
            className="pl-9"
          />
        </div>
        <Select
          value={action}
          onValueChange={(v) => {
            const val = v ?? "all"
            setAction(val)
            applyFilters({ action: val })
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(ACTION_LABELS).map(([key, v]) => (
              <SelectItem key={key} value={key}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={resource}
          onValueChange={(v) => {
            const val = v ?? "all"
            setResource(val)
            applyFilters({ resource: val })
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Recurso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os recursos</SelectItem>
            {Object.entries(RESOURCE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => applyFilters({})} disabled={isPending}>
          Buscar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => {
                    const a = ACTION_LABELS[log.action] ?? { label: log.action, variant: "outline" as const }
                    const location = [log.city, log.country].filter(Boolean).join(", ")
                    return (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(log)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={a.variant}>{a.label}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {RESOURCE_LABELS[log.resource] ?? log.resource}
                            </span>
                          </div>
                          {log.summary && (
                            <div className="mt-1 text-sm text-foreground/80">{log.summary}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{log.userName ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{log.userEmail ?? ""}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Globe className="size-3" aria-hidden="true" />
                            {log.ipAddress ?? "—"}
                          </div>
                          {location && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" aria-hidden="true" />
                              {location}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {formatDate(log.createdAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do evento</DialogTitle>
            <DialogDescription>{selected?.summary ?? "Sem resumo"}</DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <Detail label="Ação" value={ACTION_LABELS[selected.action]?.label ?? selected.action} />
              <Detail label="Recurso" value={RESOURCE_LABELS[selected.resource] ?? selected.resource} />
              <Detail label="ID do registro" value={selected.resourceId ?? "—"} />
              <Detail label="Usuário" value={selected.userName ?? "—"} />
              <Detail label="E-mail" value={selected.userEmail ?? "—"} full />
              <Detail label="Endereço IP" value={selected.ipAddress ?? "—"} icon={Globe} />
              <Detail
                label="Localização"
                value={[selected.city, selected.country].filter(Boolean).join(", ") || "—"}
                icon={MapPin}
              />
              <Detail
                label="Dispositivo"
                value={[selected.browser, selected.os].filter(Boolean).join(" · ") || "—"}
                icon={Monitor}
              />
              <Detail label="Data e hora" value={formatDate(selected.createdAt)} full />
              {selected.metadata && (
                <div className="col-span-3">
                  <dt className="text-xs text-muted-foreground">Detalhes técnicos</dt>
                  <dd>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(JSON.parse(selected.metadata), null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Detail({
  label,
  value,
  icon: Icon,
  full,
}: {
  label: string
  value: string
  icon?: React.ElementType
  full?: boolean
}) {
  return (
    <div className={full ? "col-span-3" : "col-span-1"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 font-medium">
        {Icon && <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />}
        <span className="break-all">{value}</span>
      </dd>
    </div>
  )
}
