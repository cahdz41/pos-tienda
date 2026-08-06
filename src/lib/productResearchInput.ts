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
