"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Have I seen this?" tracking for FAQ articles and Q&A questions.
// Per-device via localStorage — no schema change needed for what is
// essentially a UI hint. Two timestamps: the last time the user
// opened the Articles list, and the last time they opened the Q&A
// list. Counts are "rows with created_at > seen" for each category.
//
// In-tab events let the section tabs / sub-tabs in the same tab
// react instantly when the user opens a list page (which calls
// markFaqSeen) without waiting for the storage event (which only
// fires across tabs).

const ARTICLES_KEY = "hd:faq:articles:seen";
const QA_KEY = "hd:faq:qa:seen";
const CHANGE_EVENT = "hd-faq-seen-change";

export type FaqCategory = "articles" | "qa";

function keyFor(category: FaqCategory): string {
  return category === "articles" ? ARTICLES_KEY : QA_KEY;
}

export function readFaqSeen(category: FaqCategory): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(keyFor(category));
  } catch {
    return null;
  }
}

export function markFaqSeen(category: FaqCategory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(keyFor(category), new Date().toISOString());
  } catch {
    // localStorage unavailable (private mode etc) — silently skip.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export type FaqUnreadCounts = {
  articles: number;
  qa: number;
  total: number;
};

// Hook used by the section tabs and the FAQ sub-tabs to badge new
// articles / Q&A. Counts re-fetch on:
//   - mount,
//   - storage event (other tab marked something seen),
//   - in-tab CHANGE_EVENT (current tab marked something seen),
//   - postgres_changes INSERT on either table.
//
// Falls back to 0 quietly on any error — a missing badge is fine; a
// crashing section tab is not.
export function useFaqUnreadCounts(): FaqUnreadCounts {
  const [counts, setCounts] = useState<FaqUnreadCounts>({
    articles: 0,
    qa: 0,
    total: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function refresh() {
      const articlesSeen = readFaqSeen("articles") ?? "1970-01-01T00:00:00Z";
      const qaSeen = readFaqSeen("qa") ?? "1970-01-01T00:00:00Z";
      const [articlesRes, qaRes] = await Promise.all([
        supabase
          .from("faq_entries")
          .select("*", { count: "exact", head: true })
          .gt("created_at", articlesSeen),
        supabase
          .from("faq_questions")
          .select("*", { count: "exact", head: true })
          .gt("created_at", qaSeen),
      ]);
      if (cancelled) return;
      const articles = articlesRes.count ?? 0;
      const qa = qaRes.count ?? 0;
      setCounts({ articles, qa, total: articles + qa });
    }

    void refresh();

    const onChange = () => void refresh();
    window.addEventListener("storage", onChange);
    window.addEventListener(CHANGE_EVENT, onChange);

    const channel = supabase
      .channel("faq-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "faq_entries" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "faq_questions" },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onChange);
      window.removeEventListener(CHANGE_EVENT, onChange);
      void supabase.removeChannel(channel);
    };
  }, []);

  return counts;
}
