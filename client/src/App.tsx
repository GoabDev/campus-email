import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Inbox from "@/pages/Inbox";
import Sent from "@/pages/Sent";
import Compose from "@/pages/Compose";
import ViewEmail from "@/pages/ViewEmail";
import Starred from "@/pages/Starred";
import Trash from "@/pages/Trash";
import Search from "@/pages/Search";
import Layout from "@/components/Layout";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuth((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/inbox" />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="sent" element={<Sent />} />
          <Route path="compose" element={<Compose />} />
          <Route path="email/:id" element={<ViewEmail />} />
          <Route path="starred" element={<Starred />} />
          <Route path="trash" element={<Trash />} />
          <Route path="search" element={<Search />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
