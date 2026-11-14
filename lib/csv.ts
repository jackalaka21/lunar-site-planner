import type { Metrics } from "./engine/metrics";
import type { TimeSeries } from "./engine/sample";

export const CSV_HEADER =
  "utc,sun_az,sun_el,sun_visible_pct,eclipse_pct,earth_az,earth_el,earth_in_view,solar_interference,power_proxy,lit,both";

export interface CsvScenarioMeta {
  name: string;
  lat: number;
  lon: number;
  t0Ms: number;
}

/**
 * Serialises a scenario time series and headline metrics to CSV.
 * Produces `series.n + 2` lines: header + `series.n` sample rows + `# summary,...` footer.
 */
export function scenarioToCsv(scenario: CsvScenarioMeta, series: TimeSeries, m: Metrics): string {
  const rows: string[] = [CSV_HEADER];
  for (let i = 0; i < series.n; i++) {
    const utc = new Date(series.t0Ms + i * series.stepMs).toISOString();
    rows.push(
      [
        utc,
        series.sunAz[i].toFixed(2),
        series.sunEl[i].toFixed(2),
        (series.sunFrac[i] * 100).toFixed(1),
        (series.eclipseFrac[i] * 100).toFixed(1),
        series.earthAz[i].toFixed(2),
        series.earthEl[i].toFixed(2),
        series.earthIn[i],
        series.interference[i],
        series.power[i].toFixed(4),
        series.lit[i],
        series.both[i],
      ].join(","),
    );
  }
  const safeName = scenario.name.replace(/[\r\n,]+/g, " ").trim();
  rows.push(
    [
      "# summary",
      `verdict=${m.verdict}`,
      `both_h=${m.bothH.toFixed(2)}`,
      `sunlit_h=${m.sunlitH.toFixed(2)}`,
      `earth_h=${m.earthH.toFixed(2)}`,
      `longest_dark_h=${m.longestDarkH.toFixed(2)}`,
      `longest_comms_gap_h=${m.longestCommsGapH.toFixed(2)}`,
      `mean_power=${m.meanPower.toFixed(4)}`,
      `site=${safeName}`,
      `lat=${scenario.lat.toFixed(4)}`,
      `lon=${scenario.lon.toFixed(4)}`,
    ].join(","),
  );
  return rows.join("\n");
}

/** Triggers a browser download of the scenario CSV and returns the CSV string. */
export function downloadScenarioCsv(
  scenario: CsvScenarioMeta,
  series: TimeSeries,
  m: Metrics,
  filename?: string,
): string {
  const csv = scenarioToCsv(scenario, series, m);
  if (typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const slug =
      scenario.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "scenario";
    const dateStr = new Date(scenario.t0Ms).toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? `ridgeline-${slug}-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return csv;
}
