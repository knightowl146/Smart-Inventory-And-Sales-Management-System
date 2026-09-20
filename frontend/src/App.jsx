import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthProvider";
import { useAuth } from "./context/authContext";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import AppLayout from "./layout/AppLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MyDay from "./pages/MyDay";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Sales from "./pages/Sales";
import Purchases from "./pages/Purchases";
import Inventory from "./pages/Inventory";
import Movements from "./pages/Movements";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Staff from "./pages/Staff";
import ActivityLog from "./pages/ActivityLog";
import Ask from "./pages/Ask";
import Forecast from "./pages/Forecast";
import ReorderPlan from "./pages/ReorderPlan";
import Anomalies from "./pages/Anomalies";
import Briefings from "./pages/Briefings";
import ScanInvoice from "./pages/ScanInvoice";

/**
 * The home screen differs by role rather than by route, so a bookmark to "/"
 * works for everyone: owners get the business dashboard, employees get their
 * own day. The two are backed by different endpoints - see MyDay.jsx.
 */
const Home = () => {
  const { isOwner } = useAuth();
  return isOwner ? <Dashboard /> : <MyDay />;
};

const owner = (element) => <RequireRole role="owner">{element}</RequireRole>;

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />

              {/* Shared: an employee reads the catalogue (without cost prices)
                  and records sales against customers. */}
              <Route path="products" element={<Products />} />
              <Route path="customers" element={<Customers />} />
              <Route path="sales" element={<Sales />} />
              <Route path="movements" element={<Movements />} />

              {/* Both roles may ask - the tool layer narrows what each can
                  actually reach, so an employee's question about margin is
                  refused by the permission table rather than by this router. */}
              <Route path="ask" element={<Ask />} />

              {/* Owner-only. The API returns 403 on all of these regardless of
                  what the router does here - this is so people are told why
                  rather than shown an empty page. */}
              <Route path="suppliers" element={owner(<Suppliers />)} />
              <Route path="purchases" element={owner(<Purchases />)} />
              <Route path="inventory" element={owner(<Inventory />)} />
              <Route path="analytics" element={owner(<Analytics />)} />
              <Route path="reports" element={owner(<Reports />)} />
              <Route path="staff" element={owner(<Staff />)} />
              <Route path="activity" element={owner(<ActivityLog />)} />
              <Route path="forecast" element={owner(<Forecast />)} />
              <Route path="reorder-plan" element={owner(<ReorderPlan />)} />
              <Route path="anomalies" element={owner(<Anomalies />)} />
              <Route path="briefings" element={owner(<Briefings />)} />
              <Route path="scan-invoice" element={owner(<ScanInvoice />)} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
