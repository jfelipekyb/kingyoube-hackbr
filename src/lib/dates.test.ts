import { describe, expect, it } from "vitest";
import { addDays, brasiliaDay, daysBetween, formatDateBR, parseIsoDate, parseIsoDateTime, periodOf } from "./dates";

describe("datas ISO", () => {
  it("aceita 'Z' e '-03:00' e chega no mesmo instante", () => {
    const z = parseIsoDateTime("2026-09-29T13:00:00Z");
    const br = parseIsoDateTime("2026-09-29T10:00:00-03:00");
    expect(z.getTime()).toBe(br.getTime());
  });

  it("aceita frações de segundo e minutos sem segundos", () => {
    expect(parseIsoDateTime("2026-11-13T10:15:30.123Z").toISOString()).toBe("2026-11-13T10:15:30.123Z");
    expect(parseIsoDateTime("2026-11-13T10:15-03:00").toISOString()).toBe("2026-11-13T13:15:00.000Z");
  });

  it("recusa data e hora sem fuso ou inválida", () => {
    for (const bad of ["2026-09-29T10:00:00", "2026-02-30T10:00:00Z", "2026-09-29 10:00:00Z", "29/09/2026", "2026-09-29T25:00:00Z"]) {
      expect(() => parseIsoDateTime(bad), bad).toThrow(RangeError);
    }
  });

  it("valida data sem hora", () => {
    expect(parseIsoDate("2026-11-20")).toBe("2026-11-20");
    expect(() => parseIsoDate("2026-13-01")).toThrow(RangeError);
    expect(() => parseIsoDate("2026-11-20T00:00:00Z")).toThrow(RangeError);
  });

  it("dia de Brasília vira na meia-noite de Brasília, não na de UTC", () => {
    expect(brasiliaDay(new Date("2026-11-21T02:59:59Z"))).toBe("2026-11-20");
    expect(brasiliaDay(new Date("2026-11-21T03:00:00Z"))).toBe("2026-11-21");
  });

  it("soma e conta dias civis atravessando meses", () => {
    expect(addDays("2026-11-20", -20)).toBe("2026-10-31");
    expect(addDays("2026-11-20", 10)).toBe("2026-11-30");
    expect(daysBetween("2026-10-31", "2026-11-20")).toBe(20);
    expect(daysBetween("2026-11-20", "2026-11-18")).toBe(-2);
  });

  it("período e formatação", () => {
    expect(periodOf("2026-10-05")).toBe("10/2026");
    expect(formatDateBR("2026-11-20")).toBe("20/11/2026");
  });
});
