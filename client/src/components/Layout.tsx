import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/query";
import api, { getAvatarUrl } from "@/lib/api";
import {
  Mail,
  Inbox,
  Send,
  PenSquare,
  LogOut,
  Menu,
  X,
  Star,
  Trash2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Layout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: unreadData } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () =>
      api.get<{ count: number }>("/emails/unread-count").then((res) => res.data),
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count ?? 0;

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate("/login");
  };

  const closeSidebar = () => setSidebarOpen(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      closeSidebar();
    }
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const avatarUrl = getAvatarUrl(user?.avatar);

  const navItems = [
    { to: "/inbox", label: "Inbox", icon: Inbox },
    { to: "/sent", label: "Sent", icon: Send },
    { to: "/starred", label: "Starred", icon: Star },
    { to: "/trash", label: "Trash", icon: Trash2 },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-card px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-accent text-muted-foreground"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Mail size={16} className="text-primary-foreground" />
            </div>
            <h1 className="text-lg font-semibold text-foreground hidden sm:block">
              Campus Mail
            </h1>
          </div>
        </div>

        {/* Search bar */}
        <form
          onSubmit={handleSearch}
          className="flex-1 max-w-md hidden sm:block"
        >
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search emails..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-accent/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </form>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            {user?.name}
          </div>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={user?.name || "Avatar"}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut size={18} />
          </Button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={closeSidebar}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:static z-40 top-14 bottom-0 left-0 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200 ease-in-out",
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="p-3 space-y-2">
            <Button
              onClick={() => {
                navigate("/compose");
                closeSidebar();
              }}
              className="w-full gap-2 h-11 rounded-xl shadow-md text-sm font-medium"
            >
              <PenSquare size={16} />
              Compose
            </Button>

            {/* Mobile search */}
            <form onSubmit={handleSearch} className="sm:hidden">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full h-9 pl-9 pr-3 rounded-lg bg-accent/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </form>
          </div>

          <nav className="flex-1 px-2 space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )
                }
              >
                <item.icon size={18} />
                <span className="flex-1">{item.label}</span>
                {item.to === "/inbox" && unreadCount > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Sidebar footer - user info on mobile */}
          <div className="p-3 border-t border-border lg:hidden">
            <div className="flex items-center gap-3 px-3 py-2">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user?.name || "Avatar"}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
