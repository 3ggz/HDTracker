export type Job = {
  id: string;
  name: string;
  number: string | null;
  address: string | null;
  notes: string | null;
  site_map_path: string | null;
  site_map_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobDoor = {
  id: string;
  job_id: string;
  name: string;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type JobDoorItem = {
  id: string;
  door_id: string;
  name: string;
  note: string | null;
  photo_storage_path: string | null;
  photo_uploaded_at: string | null;
  position: number;
  created_at: string;
};
