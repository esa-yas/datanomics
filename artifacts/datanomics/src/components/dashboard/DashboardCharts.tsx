import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, Users } from "lucide-react";

interface NamedCount {
  name: string;
  count: number;
}

interface DashboardChartsProps {
  statusPipeline: NamedCount[];
  appsPerDay: { date: string; apps: number }[];
  sourceBreakdown: NamedCount[];
  topCandidates: NamedCount[];
}

const PRIMARY = "#00C896";
const SECONDARY = "#0099E6";
const AXIS = "hsl(215 20% 65%)";
const GRID = "rgba(255,255,255,0.06)";

const PIE_COLORS = [
  "#00C896",
  "#0099E6",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#14B8A6",
  "#6366F1",
  "#84CC16",
  "#F97316",
  "#22D3EE",
];

const TOOLTIP_STYLE = {
  backgroundColor: "#1B2D4F",
  borderColor: "rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 12,
} as const;

function ChartCard({
  title,
  icon: Icon,
  children,
  hasData,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  hasData: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h2 className="text-lg font-display font-semibold mb-6 flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        {title}
      </h2>
      <div className="h-[300px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
            <Icon className="w-10 h-10 opacity-20 mb-3" />
            <p className="text-sm">No data yet</p>
            <p className="text-xs opacity-70">Charts populate as data is logged.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardCharts({
  statusPipeline,
  appsPerDay,
  sourceBreakdown,
  topCandidates,
}: DashboardChartsProps) {
  const hasPipeline = statusPipeline.some((s) => s.count > 0);
  const hasApps = appsPerDay.some((d) => d.apps > 0);
  const hasSource = sourceBreakdown.some((s) => s.count > 0);
  const hasTop = topCandidates.some((s) => s.count > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title="Candidate Pipeline" icon={BarChart3} hasData={hasPipeline}>
        <BarChart data={statusPipeline} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis
            dataKey="name"
            stroke={AXIS}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={54}
          />
          <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <RechartsTooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" fill={SECONDARY} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Applications (Last 14 Days)" icon={LineChartIcon} hasData={hasApps}>
        <AreaChart data={appsPerDay} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="appsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.35} />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="date" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
          <Area
            type="monotone"
            dataKey="apps"
            stroke={PRIMARY}
            strokeWidth={2}
            fill="url(#appsGradient)"
            dot={{ r: 3, fill: PRIMARY }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ChartCard>

      <ChartCard title="Applications by Source" icon={PieChartIcon} hasData={hasSource}>
        <PieChart>
          <Pie
            data={sourceBreakdown}
            dataKey="count"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            stroke="none"
          >
            {sourceBreakdown.map((entry, i) => (
              <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
          <Legend
            verticalAlign="middle"
            align="right"
            layout="vertical"
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: AXIS }}
          />
        </PieChart>
      </ChartCard>

      <ChartCard title="Top Candidates by Applications" icon={Users} hasData={hasTop}>
        <BarChart
          data={topCandidates}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            stroke={AXIS}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <RechartsTooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={26}>
            {topCandidates.map((entry, i) => (
              <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ChartCard>
    </div>
  );
}
