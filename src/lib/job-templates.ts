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
