import { useEffect, useState } from "react";
import {
  FACET_DEFAULT_LIMIT,
  type FacetFieldId,
} from "@/server/admin/internetOffers/facetFields";
import { useDebouncedValue } from "./useDebouncedValue";

export type LazyFacetOption = { value: string; label: string };

type FacetApiResponse = {
  values?: string[];
  truncated?: boolean;
};

export function useLazyFacetOptions(
  facetField: FacetFieldId | undefined,
  open: boolean,
  search: string,
  formatLabel?: (value: string) => string,
  limit = FACET_DEFAULT_LIMIT,
) {
  const [options, setOptions] = useState<LazyFacetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    if (!open || !facetField) {
      if (!open) {
        setOptions([]);
        setTruncated(false);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      field: facetField,
      limit: String(limit),
    });
    const q = debouncedSearch.trim();
    if (q) params.set("q", q);

    fetch(`/api/admin/internet-offers/facets?${params}`)
      .then((r) => r.json())
      .then((data: FacetApiResponse) => {
        if (cancelled) return;
        const values = data.values ?? [];
        setOptions(
          values.map((value) => ({
            value,
            label: formatLabel ? formatLabel(value) : value,
          })),
        );
        setTruncated(Boolean(data.truncated));
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([]);
          setTruncated(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [facetField, open, debouncedSearch, limit]);

  return { options, loading, truncated };
}
