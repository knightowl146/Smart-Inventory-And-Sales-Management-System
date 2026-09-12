import { useState } from "react";
import Tabs from "../components/Tabs";
import SalesReportTab from "./reports/SalesReportTab";
import PurchaseReportTab from "./reports/PurchaseReportTab";
import InventoryReportTab from "./reports/InventoryReportTab";
import ProfitLossReportTab from "./reports/ProfitLossReportTab";
import SupplierReportTab from "./reports/SupplierReportTab";
import CustomerReportTab from "./reports/CustomerReportTab";

const tabs = [
  { key: "sales", label: "Sales", Component: SalesReportTab },
  { key: "purchases", label: "Purchases", Component: PurchaseReportTab },
  { key: "inventory", label: "Inventory", Component: InventoryReportTab },
  { key: "profit-loss", label: "Profit & Loss", Component: ProfitLossReportTab },
  { key: "suppliers", label: "Suppliers", Component: SupplierReportTab },
  { key: "customers", label: "Customers", Component: CustomerReportTab },
];

const Reports = () => {
  const [active, setActive] = useState("sales");
  const ActiveComponent = tabs.find((tab) => tab.key === active)?.Component;

  return (
    <div>
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      <div style={{ marginTop: 20 }}>
        <ActiveComponent />
      </div>
    </div>
  );
};

export default Reports;