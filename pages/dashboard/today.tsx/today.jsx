// pages/dashboard/today.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { supabase } from "../../lib/supabaseClient";

type Task = {
  id: string;
  title: string | null;
  related_id: string;
  due_at: string;
  status: string;
};

function isoStartOfDayUTC(d: Date) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  return start.toISOString();
}
function isoEndOfDayUTC(d: Date) {
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return end.toISOString();
}

export default function TodayTasksPage() {
  const qc = useQueryClient();
  const today = new Date();

  const { data, isLoading, isError, error } = useQuery<Task[], Error>(
    ["tasks", "due-today"],
    async () => {
      const { data, error } = await supabase
        .from<Task>("tasks")
        .select("id, title, related_id, due_at, status")
        .gte("due_at", isoStartOfDayUTC(today))
        .lte("due_at", isoEndOfDayUTC(today))
        .order("due_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    {
      staleTime: 1000 * 30,
    }
  );

  const updateMutation = useMutation(
    async ({ id }: { id: string }) => {
      const { data, error } = await supabase.from("tasks").update({ status: "completed" }).eq("id", id).select("id");
      if (error) throw error;
      return data;
    },
    {
      onSuccess: () => {
        // refetch tasks due today
        qc.invalidateQueries(["tasks", "due-today"]);
      },
    }
  );

  if (isLoading) return <div>Loading tasks for today...</div>;
  if (isError) return <div>Error loading tasks: {String(error)}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Tasks Due Today</h1>
      {data && data.length === 0 ? (
        <div>No tasks due today.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8 }}>Title</th>
              <th style={{ textAlign: "left", padding: 8 }}>Application ID</th>
              <th style={{ textAlign: "left", padding: 8 }}>Due Date</th>
              <th style={{ textAlign: "left", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <tr key={t.id}>
                <td style={{ padding: 8 }}>{t.title ?? "(no title)"}</td>
                <td style={{ padding: 8 }}>{t.related_id}</td>
                <td style={{ padding: 8 }}>{new Date(t.due_at).toLocaleString()}</td>
                <td style={{ padding: 8 }}>{t.status}</td>
                <td style={{ padding: 8 }}>
                  <button
                    onClick={() => updateMutation.mutate({ id: t.id })}
                    disabled={t.status === "completed" || updateMutation.isLoading}
                  >
                    {updateMutation.isLoading ? "Updating..." : "Mark Complete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {updateMutation.isError && <div style={{ color: "red" }}>Error updating task</div>}
    </div>
  );
}
