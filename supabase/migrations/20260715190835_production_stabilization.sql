-- ResinOps production stabilization: clear residual function warnings and
-- ensure tenant filters and foreign-key joins have a covering leading index.

begin;

alter function public.handle_updated_at()
  set search_path = '';

alter function public.set_updated_at()
  set search_path = '';

create index if not exists facilities_created_by_idx
  on public.facilities (created_by);

do $facility_indexes$
declare
  table_name text;
  facility_column smallint;
begin
  foreach table_name in array array[
    'boms', 'clone_schedules', 'cultivation_inputs', 'employees',
    'equipment', 'facility_map_spaces', 'gmp_deviations', 'gmp_shifts',
    'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches',
    'import_history', 'inventory_items', 'labor_types', 'loto_log',
    'mother_plants', 'production_batches', 'purchase_orders', 'qc_tests',
    'sales_orders', 'skus', 'spray_log', 'strains', 'tc_vessels',
    'vendors', 'work_orders'
  ]
  loop
    select attribute.attnum
    into facility_column
    from pg_attribute as attribute
    where attribute.attrelid = format('public.%I', table_name)::regclass
      and attribute.attname = 'facility_id'
      and not attribute.attisdropped;

    if facility_column is null then
      raise exception 'Expected public.%.facility_id to exist', table_name;
    end if;

    if not exists (
      select 1
      from pg_index as index_definition
      where index_definition.indrelid = format('public.%I', table_name)::regclass
        and index_definition.indisvalid
        and index_definition.indisready
        and index_definition.indkey[0] = facility_column
    ) then
      execute format(
        'create index %I on public.%I (facility_id)',
        table_name || '_facility_id_idx',
        table_name
      );
    end if;
  end loop;
end
$facility_indexes$;

commit;
