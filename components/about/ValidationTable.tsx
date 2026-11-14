"use client";

import { Check, Info, X } from "lucide-react";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/** One entry of a validation.json section (written by pipeline/lsp/validate.py). */
export interface ValidationEntry {
  name: string;
  value: number | string | Record<string, unknown> | null;
  reference: number | string | null;
  tolerance: number | string | null;
  pass: boolean | null;
  source_url: string | null;
  unit?: string | null;
  note: string;
  detail?: string;
}

export interface ValidationReport {
  generatedUtc: string;
  [section: string]: ValidationEntry[] | string;
}

function trimNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n === 0) return "0";
  const digits = Math.min(8, Math.max(0, 3 - Math.floor(Math.log10(Math.abs(n)))));
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

function withUnit(text: string, unit: string | null | undefined): string {
  if (!unit) return text;
  return unit === "deg" ? `${text}°` : `${text} ${unit}`;
}

/** A readable value, with its unit. Objects (informational rows) become `key value` pairs. */
export function formatValue(
  v: number | string | Record<string, unknown> | null | undefined,
  unit: string | null | undefined,
): string {
  if (v === null || v === undefined) return "n/a";
  if (typeof v === "number") return withUnit(trimNumber(v), unit);
  if (typeof v === "string") return v;
  return Object.entries(v)
    .filter(([, x]) => x !== null && x !== undefined)
    .map(([k, x]) => `${k} ${typeof x === "number" ? trimNumber(x) : String(x)}`)
    .join(", ");
}

const STATUS = {
  pass: { text: "Pass", glyph: Check },
  fail: { text: "Fail", glyph: X },
  info: { text: "Info", glyph: Info },
} as const;

/** Result as glyph + word, so colour is never the only signal. */
function Status({ pass }: { pass: boolean | null }) {
  const look = STATUS[pass === true ? "pass" : pass === false ? "fail" : "info"];
  return (
    <HStack gap={1.5} vAlign="center">
      <Icon icon={look.glyph} color={pass === false ? "error" : "secondary"} />
      <Text type="label" weight={pass === false ? "semibold" : "medium"}>
        {look.text}
      </Text>
    </HStack>
  );
}

interface Row extends Record<string, unknown> {
  id: string;
  entry: ValidationEntry;
}

export function ValidationTable({ entries, caption }: { entries: ValidationEntry[]; caption: string }) {
  const data: Row[] = entries.map((entry, i) => ({ id: `${i}-${entry.name}`, entry }));
  return (
    <Table<Row>
      aria-label={caption}
      data={data}
      idKey="id"
      density="compact"
      verticalAlign="top"
      columns={[
        {
          key: "entry",
          header: "Check",
          width: proportional(3, { minWidth: 280 }),
          renderCell: (row) => (
            <VStack gap={1}>
              <Text type="label" weight="medium">
                {row.entry.name}
              </Text>
              <Text type="supporting" size="xsm">
                {row.entry.note}
              </Text>
              {row.entry.source_url ? (
                <Link href={row.entry.source_url} target="_blank" rel="noopener noreferrer" isExternalLink>
                  Reference source
                </Link>
              ) : null}
            </VStack>
          ),
        },
        {
          key: "result",
          header: "Result",
          width: proportional(1, { minWidth: 96 }),
          renderCell: (row) => <Status pass={row.entry.pass} />,
        },
        {
          key: "value",
          header: "Ridgeline value",
          width: proportional(1.5, { minWidth: 140 }),
          renderCell: (row) => <Text type="code" hasTabularNumbers>{formatValue(row.entry.value, row.entry.unit)}</Text>,
        },
        {
          key: "reference",
          header: "Reference",
          width: proportional(1.5, { minWidth: 140 }),
          renderCell: (row) => <Text type="code" hasTabularNumbers>{formatValue(row.entry.reference, row.entry.unit)}</Text>,
        },
        {
          key: "tolerance",
          header: "Tolerance",
          width: proportional(1.5, { minWidth: 140 }),
          renderCell: (row) => (
            <Text type="code" hasTabularNumbers>
              {typeof row.entry.tolerance === "number"
                ? `± ${formatValue(row.entry.tolerance, row.entry.unit)}`
                : formatValue(row.entry.tolerance, null)}
            </Text>
          ),
        },
      ]}
    />
  );
}
