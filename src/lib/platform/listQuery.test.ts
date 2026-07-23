import { describe, expect, it } from "vitest";
import {
  buildQueryString,
  parseListQuery,
  sortAndPaginate,
  splitIntoGroups,
  toClientConfig,
  type ListViewConfig,
} from "./listQuery";

interface Row {
  id: string;
  status: string;
  owner: string | null;
  n: number;
}

const config: ListViewConfig<Row> = {
  fields: [],
  sort: [{ name: "n", label: "N", getValue: (r) => r.n }],
  groups: [
    {
      name: "status",
      label: "Status",
      getValue: (r) => r.status,
      options: [{ value: "open" }, { value: "closed", label: "Closed!" }],
    },
    { name: "owner", label: "Owner", getValue: (r) => r.owner, emptyLabel: "Unassigned" },
  ],
};

const rows: Row[] = [
  { id: "a", status: "closed", owner: "z", n: 2 },
  { id: "b", status: "open", owner: "a", n: 5 },
  { id: "c", status: "open", owner: "b", n: 1 },
  { id: "d", status: "archived", owner: null, n: 3 },
  { id: "e", status: "", owner: "a", n: 4 },
];

const parse = (sp: Record<string, string>) => parseListQuery(sp, config);

describe("group param parsing/serialisation", () => {
  it("accepts a valid group and rejects an unknown one", () => {
    expect(parse({ group: "status" }).group).toBe("status");
    expect(parse({ group: "nope" }).group).toBeNull();
    expect(parse({}).group).toBeNull();
  });

  it("round-trips through buildQueryString", () => {
    const q = parse({ group: "status", sort: "n:asc" });
    expect(buildQueryString(q)).toContain("group=status");
    expect(parseListQuery({ group: "status", sort: "n:asc" }, config)).toEqual(q);
  });
});

describe("sortAndPaginate ordering with a group", () => {
  it("orders by group (declared → alpha → empty last), sort as within-group tiebreaker", () => {
    const q = parse({ group: "status", sort: "n:asc" });
    const { items } = sortAndPaginate(rows, q, config);
    // open(idx0): c(1),b(5) → closed(idx1): a → archived(alpha) → "" (empty last)
    expect(items.map((r) => r.id)).toEqual(["c", "b", "a", "d", "e"]);
  });

  it("preserves source order within a group when no sort is active", () => {
    const q = parse({ group: "status" });
    const { items } = sortAndPaginate(rows, q, config);
    // open group keeps input order (b before c); groups still ordered
    expect(items.map((r) => r.id)).toEqual(["b", "c", "a", "d", "e"]);
  });
});

describe("splitIntoGroups", () => {
  it("segments a sorted slice into labelled sections with counts", () => {
    const q = parse({ group: "status", sort: "n:asc" });
    const { items } = sortAndPaginate(rows, q, config);
    const sections = splitIntoGroups(items, q, config);
    expect(sections.map((s) => [s.key, s.label, s.count])).toEqual([
      ["open", "open", 2], // no option label → raw key
      ["closed", "Closed!", 1], // declared label used
      ["archived", "archived", 1], // unlisted key → raw fallback
      ["", "— none —", 1], // default empty label
    ]);
  });

  it("uses the group's emptyLabel for the null/blank bucket", () => {
    const q = parse({ group: "owner" });
    const { items } = sortAndPaginate(rows, q, config);
    const empty = splitIntoGroups(items, q, config).find((s) => s.key === "");
    expect(empty?.label).toBe("Unassigned");
  });

  it("repeats a group's section on each page it spans", () => {
    const paged: ListViewConfig<Row> = { ...config, pageSize: 1 };
    const q = parseListQuery({ group: "status", sort: "n:asc", page: "2" }, paged);
    const { items } = sortAndPaginate(rows, q, paged);
    const sections = splitIntoGroups(items, q, paged);
    // page 2 of size 1 = second "open" row (b); its section reappears here
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("open");
    expect(sections[0].rows.map((r) => r.id)).toEqual(["b"]);
  });

  it("returns one unlabelled section when no group is active", () => {
    const q = parse({});
    const sections = splitIntoGroups(rows, q, config);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe("");
    expect(sections[0].rows).toHaveLength(rows.length);
  });
});

describe("toClientConfig", () => {
  it("projects group name + label", () => {
    expect(toClientConfig(config).groups).toEqual([
      { name: "status", label: "Status" },
      { name: "owner", label: "Owner" },
    ]);
  });
});
