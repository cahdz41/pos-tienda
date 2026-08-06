-- Borrador inicial controlado para el producto piloto.
-- Es idempotente y nunca reemplaza una ficha que ya exista.

do $$
declare
  target_product_id uuid;
  vanilla_variant_id uuid;
begin
  select id into target_product_id
  from public.products
  where name = 'Mutant - Mutant Whey 5lbs';

  if target_product_id is null then
    raise exception 'No se encontro el producto piloto exacto.';
  end if;

  select id into vanilla_variant_id
  from public.product_variants
  where product_id = target_product_id
    and barcode = '811662020080'
    and flavor = 'Vainilla';

  if vanilla_variant_id is null then
    raise exception 'No se encontro la variante Vainilla exacta del piloto.';
  end if;

  insert into public.store_product_content (
    product_id,
    status,
    reference_variant_id,
    reference_flavor,
    short_description,
    key_features,
    serving_size,
    servings_per_container,
    presentation,
    nutrition_facts,
    ingredients,
    directions,
    nutrition_label_url,
    research_sources,
    research_warnings,
    research_model,
    research_prompt_version,
    researched_at
  ) values (
    target_product_id,
    'draft',
    vanilla_variant_id,
    'Vainilla',
    'Mezcla de proteína de suero con 22 g de proteína por porción, formulada con distintas fuentes de whey y enzimas digestivas para complementar tu consumo diario de proteína.',
    '["22 g de proteina por porcion", "Mezcla de proteina de suero de tres fuentes", "10.4 g de aminoacidos esenciales, incluidos 5 g de BCAA", "Con enzimas digestivas lactasa y proteasa", "Presentacion de 5 lb con aproximadamente 61 porciones"]'::jsonb,
    '1 scoop (37 g)',
    'Aproximadamente 61',
    '5 lb (2.27 kg)',
    '[
      {"name":"Calorias","amount":"150","unit":"kcal","daily_value":null,"indent":0},
      {"name":"Grasa total","amount":"2.5","unit":"g","daily_value":"3%","indent":0},
      {"name":"Grasa saturada","amount":"1.5","unit":"g","daily_value":"8%","indent":1},
      {"name":"Grasa trans","amount":"0","unit":"g","daily_value":null,"indent":1},
      {"name":"Colesterol","amount":"75","unit":"mg","daily_value":"25%","indent":0},
      {"name":"Sodio","amount":"140","unit":"mg","daily_value":"6%","indent":0},
      {"name":"Carbohidratos totales","amount":"9","unit":"g","daily_value":"3%","indent":0},
      {"name":"Fibra dietetica","amount":"<1","unit":"g","daily_value":"3%","indent":1},
      {"name":"Azucares totales","amount":"4","unit":"g","daily_value":null,"indent":1},
      {"name":"Incluye azucares anadidos","amount":"0","unit":"g","daily_value":"0%","indent":2},
      {"name":"Proteina","amount":"22","unit":"g","daily_value":"44%","indent":0},
      {"name":"Vitamina D","amount":"0","unit":"mcg","daily_value":"0%","indent":0},
      {"name":"Calcio","amount":"130","unit":"mg","daily_value":"10%","indent":0},
      {"name":"Hierro","amount":"0.4","unit":"mg","daily_value":"2%","indent":0},
      {"name":"Potasio","amount":"280","unit":"mg","daily_value":"6%","indent":0}
    ]'::jsonb,
    'Mezcla de proteina de suero (concentrado de proteina de suero, proteina de suero hidrolizada y aislado de proteina de suero); espesantes (maltodextrina y aceite MCT de coco fraccionado); contiene 2% o menos de sabores naturales y artificiales, sal, goma guar, dioxido de silicio, citrato de potasio, lecitina de girasol y/o soya, sucralosa, rebaudiósido A de extracto de stevia, canela y enzimas (lactasa y proteasa). Contiene leche, soya y coco.',
    'Mezclar 1 porcion con 180-240 ml (6-8 fl oz) de agua fria o leche. Consumir en cualquier momento del dia.',
    'https://mutantnation.com/cdn/shop/files/Whey_5lb_Vanilla_back.png?v=1722543957&width=2550',
    '[
      {"title":"MUTANT Whey 5 lb - informacion oficial del producto","url":"https://mutant-my.com/products/mutant-whey-protein"},
      {"title":"MUTANT Whey Vainilla - etiqueta nutrimental","url":"https://www.gnc.com/on/demandware.static/-/Sites-GNC2-Library/default/v1732874468680/pdf/433538_lbl.pdf"},
      {"title":"MUTANT Whey Vainilla - transcripcion de etiqueta","url":"https://directionsforme.org/product/226798"}
    ]'::jsonb,
    '["La tabla nutrimental y los ingredientes corresponden a la variante Vainilla, UPC 811662020080. La ficha es compartida temporalmente por todos los sabores.", "Borrador inicial preparado con fuentes verificadas porque GEMINI_API_KEY no esta configurada en el entorno local; requiere revision antes de publicar."]'::jsonb,
    'manual-assisted',
    'mutant-whey-pilot-v1',
    now()
  )
  on conflict (product_id) do nothing;
end;
$$;
