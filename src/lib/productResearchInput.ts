export function deriveProductBrand(productName: string, storedBrand: string | null | undefined): string {
  const explicitBrand = storedBrand?.trim()
  if (explicitBrand) return explicitBrand

  const separatorBrand = productName.split(/\s+-\s+/, 1)[0]?.trim()
  if (separatorBrand && separatorBrand !== productName.trim()) return separatorBrand
  return productName.trim().split(/\s+/, 1)[0] ?? ''
}

export function extractPresentationHint(productName: string): string {
  const matches = productName.match(
    /\b\d+(?:[.,]\d+)?\s*(?:kg|grs?|g|lbs?|oz|ml|l|serv(?:ings?)?|porciones|cápsulas?|caps|tabletas?|pzas?)\b/gi,
  ) ?? []
  return [...new Set(matches.map(value => value.replace(/\s+/g, ' ').trim()))].slice(0, 3).join(' / ')
}

export function referenceFlavor(flavor: string | null | undefined): string {
  return flavor?.trim() || 'Sin sabor'
}

export function uniqueKnownFlavors(flavors: Array<string | null | undefined>): string[] {
  return [...new Set(flavors.map(referenceFlavor))]
}

interface ProductSearchInput {
  product_name: string
  brand: string
  presentation_hint: string
  reference_flavor: string
  reference_barcode: string
}

function quoted(value: string): string {
  return `"${value.replace(/["“”]+/g, '').replace(/\s+/g, ' ').trim()}"`
}

function canonicalProductName(productName: string, brand: string): string {
  let result = productName.trim()
  const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (escapedBrand) result = result.replace(new RegExp(`^${escapedBrand}\\s*(?:-|–|—|:)\\s*`, 'i'), '')
  result = result
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|grs?|g|lbs?|oz|ml|l|serv(?:ings?)?|porciones|cápsulas?|caps|tabletas?|pzas?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return result || productName.trim()
}

export function buildProductSearchQueries(
  input: ProductSearchInput,
  options: { deep?: boolean } = {},
): string[] {
  const brand = input.brand.trim()
  const canonicalName = canonicalProductName(input.product_name, brand)
  const presentation = input.presentation_hint.trim()
  const flavor = input.reference_flavor.trim()
  const barcode = input.reference_barcode.replace(/\s+/g, '')
  const queries: string[] = []

  if (/^\d{8,14}$/.test(barcode)) {
    queries.push(`${quoted(barcode)} ${quoted(brand || canonicalName)}`)
  }

  if (options.deep) {
    queries.push(`${quoted(input.product_name)} suplemento`)
  }

  queries.push([
    brand && quoted(brand),
    quoted(canonicalName),
    flavor && quoted(flavor),
    presentation && quoted(presentation),
    'supplement facts ingredients',
  ].filter(Boolean).join(' '))

  queries.push([
    brand && quoted(brand),
    quoted(canonicalName),
    'official nutrition label',
  ].filter(Boolean).join(' '))

  return [...new Set(queries)].slice(0, options.deep ? 4 : 3)
}
