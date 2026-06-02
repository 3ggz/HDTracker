export type FaqEntry = {
  id: string;
  title: string;
  body: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type FaqPhoto = {
  id: string;
  faq_entry_id: string;
  storage_path: string;
  caption: string | null;
  position: number;
  uploaded_by: string | null;
  created_at: string;
};
