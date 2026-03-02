const CANONICAL_KEY_SYNONYMS: Record<string, string[]> = {
  customer_id: ["customer_id", "customerid", "cust_id", "customer_key", "custkey"],
  order_id: ["order_id", "orderid", "ord_id", "order_key", "ordkey"],
  product_id: ["product_id", "productid", "sku_id", "item_id", "product_key"],
  supplier_id: ["supplier_id", "supplierid", "vendor_id", "supplier_key"],
  franchise_id: ["franchise_id", "franchiseid", "store_id", "location_id"],
  user_id: ["user_id", "userid", "account_id", "member_id"],
};

export function canonicalKeyGroups(): Record<string, string[]> {
  return CANONICAL_KEY_SYNONYMS;
}

export function tableHasSynonymPair(
  leftColumns: Set<string>,
  rightColumns: Set<string>,
): { canonical: string; leftColumn: string; rightColumn: string } | null {
  for (const [canonical, variants] of Object.entries(CANONICAL_KEY_SYNONYMS)) {
    const left = variants.find((v) => leftColumns.has(v));
    const right = variants.find((v) => rightColumns.has(v));
    if (left && right) {
      return { canonical, leftColumn: left, rightColumn: right };
    }
  }
  return null;
}
