"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { formatMoney, currencySymbol, type DisplayCurrency } from "@/lib/format"

export function SalesTrendChart({
  data,
  currency = "BRL",
}: {
  data: { date: string; revenue: number; profit: number }[]
  currency?: DisplayCurrency
}) {
  const sym = currencySymbol(currency)
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receita e lucro (30 dias)</CardTitle>
        <CardDescription>Valores em {currency} por dia</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            revenue: { label: "Receita", color: "var(--chart-1)" },
            profit: { label: "Lucro", color: "var(--chart-2)" },
          }}
          className="h-[280px] w-full"
        >
          <AreaChart data={formatted} margin={{ left: 8, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              fontSize={12}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              fontSize={11}
              tickFormatter={(v) => `${sym}${(v / 1000).toFixed(0)}k`}
            />
            <ChartTooltip
              content={<ChartTooltipContent formatter={(v, n) => [formatMoney(Number(v), currency), n === "revenue" ? " Receita" : " Lucro"]} />}
            />
            <Area
              dataKey="revenue"
              type="monotone"
              fill="url(#fillRevenue)"
              stroke="var(--color-revenue)"
              strokeWidth={2}
            />
            <Area
              dataKey="profit"
              type="monotone"
              fill="url(#fillProfit)"
              stroke="var(--color-profit)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function TopProductsChart({
  data,
  currency = "BRL",
}: {
  data: { name: string; units: number; revenue: number }[]
  currency?: DisplayCurrency
}) {
  const sym = currencySymbol(currency)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Produtos mais vendidos (30 dias)</CardTitle>
        <CardDescription>Por receita em {currency}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma venda nos últimos 30 dias.
          </p>
        ) : (
          <ChartContainer
            config={{ revenue: { label: "Receita", color: "var(--chart-1)" } }}
            className="h-[280px] w-full"
          >
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tickFormatter={(v) => `${sym}${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={120}
                fontSize={11}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(v) => formatMoney(Number(v), currency)} />}
              />
              <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
