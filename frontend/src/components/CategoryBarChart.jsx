import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const CategoryBarChart = ({ data, dataKey, categoryKey = "category", height = 240, color = "#2f6f4e" }) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid stroke="#e1e3df" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6b7280" />
        <YAxis type="category" dataKey={categoryKey} tick={{ fontSize: 12 }} stroke="#6b7280" width={110} />
        <Tooltip />
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default CategoryBarChart;