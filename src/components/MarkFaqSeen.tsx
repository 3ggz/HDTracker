"use client";

import { useEffect } from "react";
import { markFaqSeen, type FaqCategory } from "@/lib/faq-unread";

// Tiny client effect — marks one FAQ category as "seen now" so the
// unread badge in the section tabs and FAQ sub-tabs zeroes out for
// that category. Mounted on /faq and /faq/q. Renders nothing.
export function MarkFaqSeen({ category }: { category: FaqCategory }) {
  useEffect(() => {
    markFaqSeen(category);
  }, [category]);
  return null;
}
