import { useState } from "react";
import Tabs from "../components/Tabs";
import SalesAnalyticsTab from "./analytics/SalesAnalyticsTab";
import PurchaseAnalyticsTab from "./analytics/PurchaseAnalyticsTab";
import InventoryAnalyticsTab from "./analytics/InventoryAnalyticsTab";
import CustomerAnalyticsTab from "./analytics/CustomerAnalyticsTab";
import SupplierAnalyticsTab from "./analytics/SupplierAnalyticsTab";
import ProfitabilityTab from "./analytics/ProfitabilityTab";
import AbcAnalysisTab from "./analytics/AbcAnalysisTab";

const tabs = [
  { key: "sales", label: "Sales", Component: SalesAnalyticsTab },
  { key: "purchases", label: "Purchases", Component: PurchaseAnalyticsTab },
  { key: "inventory", label: "Inventory", Component: InventoryAnalyticsTab },
  { key: "customers", label: "Customers", Component: CustomerAnalyticsTab },
  { key: "suppliers", label: "Suppliers", Component: SupplierAnalyticsTab },
  { key: "profitability", label: "Profitability", Component: ProfitabilityTab },
  { key: "abc", label: "ABC Analysis", Component: AbcAnalysisTab },
];

const Analytics = () => {
  const [active, setActive] = useState("sales");
  const ActiveComponent = tabs.find((tab) => tab.key === active)?.Component;

  return (
    <div>
      <Tabs tabs={tabs} active={active} onChange={setActive} label="Analytics sections" />
      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={0}
        style={{ marginTop: 20 }}
      >
        <ActiveComponent />
      </div>
    </div>
  );
};

export default Analytics;