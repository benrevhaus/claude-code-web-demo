export type QueryFilters = {
  startDate?: string;
  endDate?: string;
  pagePath?: string;
  landingPagePath?: string;
  eventName?: string;
  eventNames?: string[];
  rawEventName?: string;
  eventClass?: string;
  variantKey?: string;
  variantValue?: string;
  deviceCategory?: string;
  sourceMedium?: string;
  conversionOnly?: string;
  search?: string;
  groupBy?: string;
};

export type SortDirection = "asc" | "desc";

type WhereOptions = {
  alias?: string;
  includeEventName?: boolean;
  includeLandingPagePath?: boolean;
  includeVariantFields?: boolean;
  includeConversionOnly?: boolean;
  includeRawEventName?: boolean;
  includeEventClass?: boolean;
  includeSearchOnEventName?: boolean;
};

export function buildWhereClause(filters: QueryFilters, options: WhereOptions = {}) {
  const {
    alias = "",
    includeEventName = true,
    includeLandingPagePath = true,
    includeVariantFields = false,
    includeConversionOnly = false,
    includeRawEventName = false,
    includeEventClass = false,
    includeSearchOnEventName = true,
  } = options;
  const prefix = alias ? `${alias}.` : "";
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.startDate) {
    params.push(filters.startDate);
    clauses.push(`${prefix}date_pst >= $${params.length}`);
  }
  if (filters.endDate) {
    params.push(filters.endDate);
    clauses.push(`${prefix}date_pst <= $${params.length}`);
  }
  if (filters.pagePath) {
    params.push(filters.pagePath);
    clauses.push(`${prefix}page_path = $${params.length}`);
  }
  if (includeLandingPagePath && filters.landingPagePath) {
    params.push(filters.landingPagePath);
    clauses.push(`${prefix}landing_page_path = $${params.length}`);
  }
  if (includeEventName && filters.eventNames) {
    if (filters.eventNames.length === 0) {
      clauses.push("1 = 0");
    } else {
      const placeholders = filters.eventNames.map((eventName) => {
        params.push(eventName);
        return `$${params.length}`;
      });
      clauses.push(`${prefix}normalized_event_name IN (${placeholders.join(", ")})`);
    }
  } else if (includeEventName && filters.eventName) {
    params.push(filters.eventName);
    clauses.push(`${prefix}normalized_event_name = $${params.length}`);
  }
  if (includeRawEventName && filters.rawEventName) {
    params.push(filters.rawEventName);
    clauses.push(`${prefix}raw_event_name = $${params.length}`);
  }
  if (includeEventClass && filters.eventClass) {
    params.push(filters.eventClass);
    clauses.push(`${prefix}event_class = $${params.length}`);
  }
  if (includeVariantFields && filters.variantKey) {
    params.push(filters.variantKey);
    clauses.push(`${prefix}variant_key = $${params.length}`);
  }
  if (includeVariantFields && filters.variantValue) {
    params.push(filters.variantValue);
    clauses.push(`${prefix}variant_value = $${params.length}`);
  }
  if (filters.deviceCategory) {
    params.push(filters.deviceCategory);
    clauses.push(`${prefix}device_category = $${params.length}`);
  }
  if (filters.sourceMedium) {
    params.push(filters.sourceMedium);
    clauses.push(`${prefix}source_medium = $${params.length}`);
  }
  if (includeConversionOnly && filters.conversionOnly === "true") {
    clauses.push(`${prefix}is_conversion_event = true`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    if (includeSearchOnEventName) {
      clauses.push(
        `(${prefix}page_path ILIKE $${params.length} OR COALESCE(${prefix}landing_page_path, '') ILIKE $${params.length} OR COALESCE(${prefix}normalized_event_name, '') ILIKE $${params.length} OR COALESCE(${prefix}raw_event_name, '') ILIKE $${params.length})`,
      );
    } else if (includeVariantFields) {
      clauses.push(
        `(${prefix}page_path ILIKE $${params.length} OR COALESCE(${prefix}landing_page_path, '') ILIKE $${params.length} OR ${prefix}variant_key ILIKE $${params.length} OR ${prefix}variant_value ILIKE $${params.length})`,
      );
    } else {
      clauses.push(`(${prefix}page_path ILIKE $${params.length} OR COALESCE(${prefix}landing_page_path, '') ILIKE $${params.length})`);
    }
  }

  return {
    text: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export function parsePagination(input: Record<string, string | undefined>) {
  const page = Math.max(1, Number.parseInt(input.page ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(input.pageSize ?? "25", 10) || 25));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}
