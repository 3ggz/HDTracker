import { describe, expect, it } from "vitest";
import {
  compareCanonicalItems,
  compareDoorNames,
  isStandaloneDoor,
  splitStandaloneDoors,
  STANDALONE_DOOR_NAME,
  buildNetworkRows,
  shouldShowDeviceColumn,
  type NetworkRow,
  type JobDoorItem,
} from "./jobs";

describe("splitStandaloneDoors", () => {
  const doors = [
    { id: "a", name: "101 Main Entry", floor: "1" },
    { id: "b", name: STANDALONE_DOOR_NAME, floor: "1" },
    { id: "c", name: "201 Server Room", floor: "2" },
    { id: "d", name: STANDALONE_DOOR_NAME, floor: "2" },
    { id: "e", name: STANDALONE_DOOR_NAME, floor: null },
  ];

  it("keeps real doors out of the standalone buckets", () => {
    const { realDoors } = splitStandaloneDoors(doors);
    expect(realDoors.map((d) => d.id)).toEqual(["a", "c"]);
  });

  // There is one bucket per floor now. Anything using find() here
  // would silently drop every gateway outside the first bucket, which
  // is exactly how they'd vanish from the share and quickview pages.
  it("returns every standalone bucket, not just the first", () => {
    const { standaloneDoors } = splitStandaloneDoors(doors);
    expect(standaloneDoors.map((d) => d.id)).toEqual(["b", "d", "e"]);
  });

  it("handles a job with no standalone gear at all", () => {
    const { realDoors, standaloneDoors } = splitStandaloneDoors([doors[0]]);
    expect(realDoors).toHaveLength(1);
    expect(standaloneDoors).toEqual([]);
  });
});

describe("isStandaloneDoor", () => {
  it("matches only the exact synthetic name", () => {
    expect(isStandaloneDoor({ name: STANDALONE_DOOR_NAME })).toBe(true);
    expect(isStandaloneDoor({ name: "Standalone" })).toBe(false);
    expect(isStandaloneDoor({ name: "standalone equipment" })).toBe(false);
    expect(isStandaloneDoor({ name: "101 Main Entry" })).toBe(false);
  });
});

describe("compareDoorNames", () => {
  it("sorts pure numeric order within a letter prefix", () => {
    const sorted = ["D10", "D1", "D9", "D2"].sort(compareDoorNames);
    expect(sorted).toEqual(["D1", "D2", "D9", "D10"]);
  });

  it("groups by letter prefix", () => {
    const sorted = ["E101", "D9", "E105", "D11"].sort(compareDoorNames);
    expect(sorted).toEqual(["D9", "D11", "E101", "E105"]);
  });

  it("is case-insensitive for the letter prefix", () => {
    const sorted = ["d10", "D1", "D9"].sort(compareDoorNames);
    expect(sorted).toEqual(["D1", "D9", "d10"]);
  });

  it("handles three-letter prefixes", () => {
    const sorted = ["SX", "SW", "ST", "SB"].sort(compareDoorNames);
    expect(sorted).toEqual(["SB", "ST", "SW", "SX"]);
  });

  it("mixes letter-only and letter+number labels", () => {
    const sorted = ["SX", "D9", "ST", "D1"].sort(compareDoorNames);
    expect(sorted).toEqual(["D1", "D9", "ST", "SX"]);
  });

  it("breaks long mixed lists into natural order", () => {
    const input = [
      "E113",
      "D11",
      "E105",
      "D9",
      "E101",
      "D15",
      "E108",
      "D1",
      "D16",
      "SX",
      "SW",
    ];
    const sorted = [...input].sort(compareDoorNames);
    expect(sorted).toEqual([
      "D1",
      "D9",
      "D11",
      "D15",
      "D16",
      "E101",
      "E105",
      "E108",
      "E113",
      "SW",
      "SX",
    ]);
  });
});

describe("compareCanonicalItems", () => {
  it("ranks items in HUGS canonical order regardless of insertion position", () => {
    const input = [
      { name: "5500 Exciter", position: 0 },
      { name: "Strobe", position: 1 },
      { name: "HUGS 8 board", position: 2 },
      { name: "4210 Antenna", position: 3 },
      { name: "5200 Exciter", position: 4 },
      { name: "3220 Exciter", position: 5 },
    ];
    const sorted = [...input].sort(compareCanonicalItems);
    expect(sorted.map((it) => it.name)).toEqual([
      "HUGS 8 board",
      "5500 Exciter",
      "5200 Exciter",
      "3220 Exciter",
      "4210 Antenna",
      "Strobe",
    ]);
  });

  it("puts custom items after the canonical list, in insertion order", () => {
    const input = [
      { name: "Custom B", position: 1 },
      { name: "5500 Exciter", position: 2 },
      { name: "Custom A", position: 0 },
    ];
    const sorted = [...input].sort(compareCanonicalItems);
    expect(sorted.map((it) => it.name)).toEqual([
      "5500 Exciter",
      "Custom A",
      "Custom B",
    ]);
  });
});

describe("buildNetworkRows", () => {
  const doors = [
    { id: "d1", name: "D1" },
    { id: "d2", name: "Ramp Door" },
    { id: "d3", name: "E316" },
    { id: "gw1", name: STANDALONE_DOOR_NAME },
    { id: "gw2", name: STANDALONE_DOOR_NAME },
  ];

  const item = (over: Partial<JobDoorItem> & { id: string; door_id: string }) =>
    ({
      name: "5500 Exciter",
      note: null,
      ip_address: null,
      mac_address: null,
      photo_storage_path: null,
      photo_uploaded_at: null,
      completed_at: null,
      position: 0,
      created_at: "",
      ...over,
    }) as JobDoorItem;

  it("keeps standalone gear below every door, whatever it is named", () => {
    const rows = buildNetworkRows(doors, [
      item({ id: "1", door_id: "d2", mac_address: "000CCC617A40" }),
      item({
        id: "2",
        door_id: "gw1",
        name: "GW-3000 Gateway",
        mac_address: "000CCC88A24E",
      }),
      item({ id: "3", door_id: "d3", mac_address: "000CCC61793A" }),
      item({
        id: "4",
        door_id: "gw2",
        name: "GW-3000 Gateway",
        mac_address: "000CCC88A254",
      }),
      item({ id: "5", door_id: "d1", mac_address: "000CCC6179F5" }),
    ]);

    expect(rows.map((r) => r.label)).toEqual([
      "D1",
      "E316",
      "Ramp Door",
      "GW-3000 Gateway",
      "GW-3000 Gateway",
    ]);
    expect(rows.map((r) => r.isStandalone)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("labels standalone gear by its note, and skips unaddressed items", () => {
    const rows = buildNetworkRows(doors, [
      item({
        id: "1",
        door_id: "gw1",
        name: "GW-3000 Gateway",
        note: "Roof",
        ip_address: "10.1.10.4",
      }),
      item({ id: "2", door_id: "d1" }),
      item({ id: "3", door_id: "d1", ip_address: "10.1.10.9" }),
    ]);

    expect(rows.map((r) => r.label)).toEqual([
      "D1",
      "GW-3000 Gateway — Roof",
    ]);
  });

  it("falls back to a placeholder when the door is missing", () => {
    const rows = buildNetworkRows(doors, [
      item({ id: "1", door_id: "gone", mac_address: "000CCC6179F5" }),
    ]);
    expect(rows[0].label).toBe("Unnamed door");
    expect(rows[0].isStandalone).toBe(false);
  });
});

describe("shouldShowDeviceColumn", () => {
  const row = (over: Partial<NetworkRow>): NetworkRow => ({
    id: "x",
    label: "D1",
    item: "5500 Exciter",
    ip: null,
    mac: null,
    isStandalone: false,
    ...over,
  });

  it("stays off when every door has one networked device", () => {
    expect(
      shouldShowDeviceColumn([row({ label: "D1" }), row({ label: "D2" })]),
    ).toBe(false);
  });

  it("turns on when a door hosts several networked devices", () => {
    expect(
      shouldShowDeviceColumn([row({ label: "D1" }), row({ label: "D1" })]),
    ).toBe(true);
  });

  it("ignores repeated standalone gear, which names itself", () => {
    expect(
      shouldShowDeviceColumn([
        row({ label: "D1" }),
        row({ label: "GW-3000 Gateway", isStandalone: true }),
        row({ label: "GW-3000 Gateway", isStandalone: true }),
      ]),
    ).toBe(false);
  });
});
