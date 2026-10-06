import { describe, expect, it } from "vitest";
import grades from "../test/fixtures/grades.json";
import type { GradeOut } from "../api/types";
import { CUSTOM, defaultMaterialForm, equivalentGrades, selectGrade, withFu, withFy } from "./material";

const table = grades as GradeOut[];
const start = defaultMaterialForm; // 1.4307, 210 / 500

describe("selecting a grade", () => {
  it("fills f_y, f_u and family from Table 5.1", () => {
    const form = selectGrade(table, "1.4003", start);
    expect(form).toMatchObject({ designation: "1.4003", family: "ferritic", fy: 250, fu: 450 });
  });
  it("custom keeps the current numbers", () => {
    expect(selectGrade(table, CUSTOM, start)).toMatchObject({ designation: CUSTOM, fy: 210, fu: 500 });
  });
});

describe("typing f_y changes the grade and f_u", () => {
  it("450 gives the common duplex grade and f_u 650", () => {
    expect(withFy(table, 450, start)).toMatchObject({
      designation: "1.4462",
      family: "duplex",
      fy: 450,
      fu: 650,
    });
  });
  it("250 gives 1.4003 with f_u 450", () => {
    expect(withFy(table, 250, start)).toMatchObject({ designation: "1.4003", fu: 450 });
  });
  it("400 gives 1.4362 with f_u 650", () => {
    expect(withFy(table, 400, start)).toMatchObject({ designation: "1.4362", fu: 650 });
  });
  it("a value in no grade makes the material Custom and keeps f_u", () => {
    expect(withFy(table, 333, start)).toMatchObject({ designation: CUSTOM, fy: 333, fu: 500 });
  });
  it("keeps the current grade when it still matches", () => {
    const form = selectGrade(table, "1.4404", start);
    expect(withFy(table, 210, form).designation).toBe("1.4404");
  });
});

describe("typing f_u changes the grade and f_y", () => {
  it("650 gives a duplex grade", () => {
    expect(withFu(table, 650, start)).toMatchObject({ family: "duplex", fy: 450, fu: 650 });
  });
  it("450 gives 1.4003 with f_y 250", () => {
    expect(withFu(table, 450, start)).toMatchObject({ designation: "1.4003", fy: 250 });
  });
  it("500 returns to austenitic 210", () => {
    const custom = withFu(table, 123, start);
    expect(custom.designation).toBe(CUSTOM);
    expect(withFu(table, 500, custom)).toMatchObject({ designation: "1.4307", fy: 210 });
  });
  it("prefers the grade that also matches the current f_y", () => {
    const form = { ...start, designation: CUSTOM, fy: 400, fu: 123 };
    expect(withFu(table, 650, form)).toMatchObject({ designation: "1.4362", fy: 400 });
  });
});

describe("equivalent grades", () => {
  it("lists the other grades with identical values and family", () => {
    const others = equivalentGrades(table, start);
    expect(others).toContain("1.4301");
    expect(others).not.toContain("1.4307");
    expect(others).not.toContain("1.4462");
  });
  it("is empty for custom", () => {
    expect(equivalentGrades(table, { ...start, designation: CUSTOM })).toEqual([]);
  });
});
