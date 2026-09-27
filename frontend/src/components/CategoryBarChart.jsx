import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney, formatMoneyShort } from "../utils/format";

/**
 * Horizontal bars by category. Every category gets a label (interval 0) and a
 * row tall enough to hold it - by default Recharts drops every other label
 * when space is tight, which leaves half the bars unnamed.
 */
const ROW_HEIGHT = 30;

const CategoryBarChart = ({
  data,
  dataKey,
  categoryKey = "category",
  height,
  color = "#2f6f4e",
  axisFormatter = formatMoneyShort,
  valueFormatter = formatMoney,
}) => {
  const chartHeight = height ?? Math.max(240, (data?.length ?? 0) * ROW_HEIGHT + 40);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid stroke="#e1e3df" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={axisFormatter} />
        <YAxis
          type="category"
          dataKey={categoryKey}
          tick={{ fontSize: 12 }}
          stroke="#6b7280"
          width={150}
          interval={0}
        />
        <Tooltip formatter={(value) => valueFormatter(value)} />
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default CategoryBarChart;
