import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import type { SearchResponse } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function EmailSkeleton() {
  return (
    <div className="p-4 border-b border-border animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-3 w-16 bg-muted rounded" />
          </div>
          <div className="h-3.5 w-48 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

type Folder = "all" | "inbox" | "sent";

export default function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const folder = (searchParams.get("folder") || "all") as Folder;
  const [activeFolder, setActiveFolder] = useState<Folder>(folder);

  const { data, isLoading } = useQuery({
    queryKey: ["search", query, page, activeFolder],
    queryFn: () =>
      api
        .get<SearchResponse>("/emails/search", {
          params: { q: query, page, limit: 20, folder: activeFolder },
        })
        .then((res) => res.data),
    enabled: query.length > 0,
  });

  const handleFolderChange = (f: Folder) => {
    setActiveFolder(f);
    setSearchParams({ q: query, folder: f, page: "1" });
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams({ q: query, folder: activeFolder, page: String(newPage) });
  };

  const folders: { value: Folder; label: string }[] = [
    { value: "all", label: "All mail" },
    { value: "inbox", label: "Inbox" },
    { value: "sent", label: "Sent" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">
          {query ? `Results for "${query}"` : "Search"}
        </h2>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? "result" : "results"}
          </span>
        )}
      </div>

      {/* Folder tabs */}
      <div className="flex gap-1 mb-4">
        {folders.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFolderChange(f.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeFolder === f.value
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!query ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <SearchIcon size={28} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            Search your emails
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Use the search bar above to find emails by subject, content, or
            sender.
          </p>
        </div>
      ) : isLoading ? (
        <Card className="overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <EmailSkeleton key={i} />
          ))}
        </Card>
      ) : data?.emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <SearchIcon size={28} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            No results found
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Try different keywords or search in a different folder.
          </p>
        </div>
      ) : (
        <>
          <Card className="overflow-hidden divide-y divide-border">
            {data?.emails.map((email) => {
              const unread = !email.is_read;
              return (
                <button
                  key={email.id}
                  onClick={() => navigate(`/email/${email.id}`)}
                  className={cn(
                    "w-full text-left p-4 flex items-center gap-3 transition-colors hover:bg-accent/50 cursor-pointer",
                    unread && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold",
                      unread
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {email.from_name ? getInitials(email.from_name) : "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-sm truncate",
                          unread
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground"
                        )}
                      >
                        {email.from_name}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDate(email.created_at)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "text-sm truncate",
                        unread ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {email.subject}
                    </p>
                  </div>
                </button>
              );
            })}
          </Card>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                className="gap-1"
              >
                <ChevronLeft size={14} />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => handlePageChange(page + 1)}
                className="gap-1"
              >
                Next
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
