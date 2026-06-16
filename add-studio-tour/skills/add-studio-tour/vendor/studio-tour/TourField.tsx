import type { FieldProps } from 'sanity'

/**
 * TourField
 *
 * A global form field component that tags every field's DOM node with a stable
 * `data-tour-field` attribute (the field's dotted path, e.g. "collections" or
 * "seo.metaTitle"). Tours target these hooks instead of Sanity's internal
 * `data-testid="field-*"` attributes, which are not part of Sanity's public API
 * and can change between Studio versions.
 *
 * Registered via `form.components.field`, so it applies to every field without
 * touching the schema files. The wrapper is a plain block element that
 * shrink-wraps the field, giving driver.js a clean bounding box to highlight.
 */
export function TourField(props: FieldProps) {
  const tourId = props.path
    .map((seg) =>
      typeof seg === 'object' && seg !== null && '_key' in seg ? seg._key : String(seg)
    )
    .join('.')

  return <div data-tour-field={tourId}>{props.renderDefault(props)}</div>
}
