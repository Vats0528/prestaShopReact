import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AdminLayout from "./pages/admin/Adminlayout";
import ImportPage from "./pages/admin/ImportPage";
import ImportCsvImg from "./pages/admin/ImportCsvImg";
import OrdersAdminPage from "./pages/admin/OrdersAdminPage";
import ResetPage from "./pages/admin/ResetPage";
import ShopLayout from "./pages/front/ShopLayout";
import HomePage from "./pages/front/HomePage";
import ProductPage from "./pages/front/ProductPage";
import CartPage from "./pages/front/CartPage";
import OrdersPage from "./pages/front/OrdersPage";
import LoginPage from "./pages/front/LoginPage";
import NotFound from "./pages/front/NotFound";
import "./App.css";

function AdminShell() {
  const [page, setPage] = useState("import-mai-26");
  const [ordersData, setOrdersData] = useState([]);

  return (
    <AdminLayout page={page} setPage={setPage}>
      {page === "import-mai-26" && (
        <ImportCsvImg ordersData={ordersData} setOrdersData={setOrdersData} />
      )}
      {page === "import" && <ImportPage />}
      {page === "orders" && (
        <OrdersAdminPage ordersData={ordersData} setOrdersData={setOrdersData} />
      )}
      {page === "reset" && <ResetPage />}
    </AdminLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminShell />} />
        <Route path="/" element={<ShopLayout />}>
          <Route index element={<HomePage />} />
          <Route path="product/:id" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="login" element={<LoginPage redirectTo="/orders" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;