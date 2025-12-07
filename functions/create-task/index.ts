// functions/create-task/index.ts
import { serve } from "std/server";
import { createClient } from "@supabase/supabase-js";
import {Deno} from "deno";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

type Body = {
  application_id?: string;
  task_type?: string;
  due_at?: string;
  title?: string;
};

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Invalid content type" }), { status: 400 });
    }

    const body: Body = await req.json();

    // Basic validation
    const { application_id, task_type, due_at, title } = body;
    if (!application_id) {
      return new Response(JSON.stringify({ error: "application_id is required" }), { status: 400 });
    }
    if (!task_type || !["call", "email", "review"].includes(task_type)) {
      return new Response(JSON.stringify({ error: "task_type must be one of: call, email, review" }), { status: 400 });
    }
    if (!due_at) {
      return new Response(JSON.stringify({ error: "due_at is required" }), { status: 400 });
    }

    const dueDate = new Date(due_at);
    if (isNaN(dueDate.getTime())) {
      return new Response(JSON.stringify({ error: "due_at must be an ISO timestamp" }), { status: 400 });
    }
    const now = new Date();
    if (dueDate <= now) {
      return new Response(JSON.stringify({ error: "due_at must be in the future" }), { status: 400 });
    }

    // Confirm application exists
    const { data: appData, error: appError } = await supabase
      .from("applications")
      .select("id, tenant_id")
      .eq("id", application_id)
      .limit(1)
      .maybeSingle();

    if (appError) {
      console.error("error fetching application", appError);
      return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
    }
    if (!appData) {
      return new Response(JSON.stringify({ error: "application not found" }), { status: 400 });
    }

    // Insert into tasks (use service role)
    const insertPayload = {
      tenant_id: appData.tenant_id,
      related_id: application_id,
      related_type: "application",
      type: task_type,
      title: title ?? null,
      due_at: dueDate.toISOString(),
      status: "pending",
    };

    const { data: inserted, error: insertError } = await supabase
      .from("tasks")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError) {
      console.error("insertError", insertError);
      return new Response(JSON.stringify({ error: "Failed to create task" }), { status: 500 });
    }

    const taskId = inserted.id;

    // Emit a realtime/broadcast event "task.created"
    try {
      // Create or use a channel for broadcasting
      // NOTE: channels are ephemeral in Edge runtime; this uses supabase-js channel API
      const channel = supabase.channel("public:tasks");
      // broadcast payload; method .send() is used here illustratively — runtime libs vary by version
      // If your version provides "send" or "track" adapt accordingly. Another option is to insert into a realtime-enabled table (done)
      // and rely on DB replication to notify subscribers. We'll attempt to broadcast:
      await channel.send({
        type: "broadcast",
        event: "task.created",
        payload: { task_id: taskId, application_id },
      });
      // optionally unsubscribe
      await channel.unsubscribe();
    } catch (broadcastErr) {
      // Not fatal — tasks inserted successfully
      console.warn("broadcast failed", broadcastErr);
    }

    return new Response(JSON.stringify({ success: true, task_id: taskId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unhandled error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
});
