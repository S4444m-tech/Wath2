import "@fontsource/ibm-plex-sans-arabic/300.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";
import { Loading } from "@/components/Layout";
import Login from "@/pages/Login";
import Transactions from "@/pages/Transactions";
import NewTransaction from "@/pages/NewTransaction";
import TransactionDetail from "@/pages/TransactionDetail";
import PrintDoc from "@/pages/PrintDoc";
import Reviews from "@/pages/Reviews";
import ReviewDetail from "@/pages/ReviewDetail";
import Movements from "@/pages/Movements";
import ManagerUsers from "@/pages/ManagerUsers";
import ManagerSettings from "@/pages/ManagerSettings";
import AuditLog from "@/pages/AuditLog";
import AdminTenants from "@/pages/AdminTenants";
import AdminPlans from "@/pages/AdminPlans";
import AdminHealth from "@/pages/AdminHealth";
import PublicPortal from "@/pages/PublicPortal";
import "@/App.css";

export const homeFor = (u) => (u.role === "superadmin" ? "/admin/tenants" : u.role === "supervisor" ? "/app/reviews" : "/app/transactions");

function Guard({ allow, children }) {
  const { user } = useAuth();
  if (user === null) return <div className="p-8"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (user === null) return null;
  return <Navigate to={user ? homeFor(user) : "/login"} replace />;
}

const STAFF = ["employee", "supervisor", "manager"];
const REV = ["supervisor", "manager"];

export default function App() {
  return (
    <div dir="rtl" lang="ar" className="font-arabic text-[#172B36]">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/p/:token" element={<PublicPortal />} />
            <Route path="/print/:id" element={<Guard allow={STAFF}><PrintDoc /></Guard>} />
            <Route path="/app" element={<Guard allow={STAFF}><AppShell /></Guard>}>
              <Route path="transactions" element={<Transactions />} />
              <Route path="transactions/new" element={<Guard allow={["employee", "manager"]}><NewTransaction /></Guard>} />
              <Route path="transactions/:id" element={<TransactionDetail />} />
              <Route path="reviews" element={<Guard allow={REV}><Reviews /></Guard>} />
              <Route path="reviews/:id" element={<Guard allow={REV}><ReviewDetail /></Guard>} />
              <Route path="movements" element={<Guard allow={REV}><Movements /></Guard>} />
              <Route path="users" element={<Guard allow={["manager"]}><ManagerUsers /></Guard>} />
              <Route path="settings" element={<Guard allow={["manager"]}><ManagerSettings /></Guard>} />
              <Route path="audit" element={<Guard allow={["manager"]}><AuditLog /></Guard>} />
            </Route>
            <Route path="/admin" element={<Guard allow={["superadmin"]}><AppShell /></Guard>}>
              <Route path="tenants" element={<AdminTenants />} />
              <Route path="plans" element={<AdminPlans />} />
              <Route path="health" element={<AdminHealth />} />
            </Route>
            <Route path="*" element={<Home />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="top-center" richColors dir="rtl" />
    </div>
  );
}
