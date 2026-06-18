// Door creation templates. HUGS lives in code as the always-present
// default — required + optional split fuels the DoorCard quick-add
// suggestions, which need both. User-defined templates only carry a
// single ordered list of item names that get pre-filled when a new
// door is created with that template selected.

export type JobTemplate = {
  id: string;
  label: string;
  description?: string;
  requiredItems: readonly string[];
  optionalItems: readonly string[];
};

export const HUGS_TEMPLATE: JobTemplate = {
  id: "hugs",
  label: "HUGS",
  description: "Standard HUGS door — pre-fills the always-needed equipment.",
  requiredItems: ["5500 Exciter", "Strobe", "HUGS 8 board"],
  optionalItems: ["5200 Exciter", "4210 Antenna", "3220 Exciter"],
};

export const JOB_TEMPLATES: readonly JobTemplate[] = [HUGS_TEMPLATE];

export function getTemplate(id: string): JobTemplate | undefined {
  return JOB_TEMPLATES.find((t) => t.id === id);
}

// Unified shape that both HUGS and user-defined templates expose to
// the door-creation paths. `items` is what gets inserted into
// job_door_items when a door is created with this template selected.
export type DoorTemplate = {
  id: string;
  name: string;
  items: string[];
  editable: boolean;
};

export const HUGS_TEMPLATE_ID = "hugs";

export const HUGS_DOOR_TEMPLATE: DoorTemplate = {
  id: HUGS_TEMPLATE_ID,
  name: HUGS_TEMPLATE.label,
  items: [...HUGS_TEMPLATE.requiredItems],
  editable: false,
};
