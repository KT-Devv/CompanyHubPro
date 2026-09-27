-- ============================================================
-- PENTEST FOLLOW-UP: atomic transactions + close two integrity/spoofing holes
--
-- Run in the Supabase SQL Editor AFTER fix_all_database_issues.sql and
-- BEFORE update_rls_for_all_roles.sql (which this migration's policy changes
-- have already been folded into — re-running that file after this one is
-- still required, since it drops and recreates every policy).
--
-- What this fixes, and why:
--
-- 1. Race condition: two concurrent "add stock" calls for a brand-new item
--    name could both see "no existing row" and insert two rows for the same
--    (store, item) pair, silently splitting one item's count across two rows.
--    Fix: a UNIQUE constraint, and an atomic upsert RPC.
--
-- 2. Torn state: sending goods, receiving goods, and transferring a worker
--    were each 2-3 separate REST calls from the browser (decrement stock,
--    then log; or move a worker, then log the transfer), with a manual
--    best-effort compensating rollback if the second call failed. A dropped
--    connection or closed tab between the calls left real, silent gaps: stock
--    debited with no shipment ever logged, or a worker moved with no transfer
--    on record. An insider could also trigger this deliberately (open dev
--    tools, let the first call succeed, abort before the second) to make
--    stock disappear without a trace.
--    Fix: each operation is now one Postgres function call. A function body
--    is part of the caller's own transaction, so if anything inside it
--    raises, everything it did is rolled back — there is no partial outcome.
--
-- 3. Forgeable shipment log: a store manager could INSERT a goods_log row
--    with type='sent' naming ANY store as store_from (not just their own),
--    as long as store_to was their own store — because the old policy
--    accepted store_from = mine OR store_to = mine for every insert,
--    regardless of type. That let a store fabricate a "shipment" that looks
--    like it was sent by a store that never sent anything, then immediately
--    receive it and credit their own stock — with a paper trail that
--    implicates an innocent store instead of an obviously-suspicious direct
--    edit. Fix: a 'sent' row may only be inserted by the store named as
--    store_from; a 'received' row only by the store named as store_to. The
--    matching update (claiming a pending shipment) is likewise restricted to
--    the store it is addressed to — the sender can no longer self-confirm
--    its own outgoing log.
--
-- 4. Unauditable audit log: worker_transfers had no real UPDATE/DELETE use in
--    the app, but the RLS policy still granted ceo/hr/system_manager FOR ALL
--    (including UPDATE/DELETE), so any of those accounts — or a stolen
--    session for one — could quietly rewrite or erase transfer history.
--    Fix: the table is now insert + select only. Nobody, including admins,
--    can alter or remove a transfer record through the API.
--
-- 5. Spoofed attribution: worker_transfers.created_by was whatever value the
--    browser sent, unrelated to who was actually signed in — a user with
--    transfer rights could call the API directly (bypassing the UI) and
--    attribute a transfer to a different, real user id, and the app would
--    display "by <that other person>". Fix: the new RPC sets created_by from
--    auth.uid() itself, and the INSERT policy now requires it to match, so
--    even a direct table write (bypassing the RPC) cannot forge it.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Unique constraint on inventory(store_id, item_name)
-- Merge any duplicates that already exist before adding it, the same way an
-- earlier migration merged orphaned sectors.
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_store_item_unique') THEN
    FOR r IN (
      SELECT store_id, item_name, array_agg(id ORDER BY last_updated) AS ids, sum(quantity) AS total
      FROM inventory
      GROUP BY store_id, item_name
      HAVING count(*) > 1
    ) LOOP
      UPDATE inventory SET quantity = r.total, last_updated = now() WHERE id = r.ids[1];
      DELETE FROM inventory WHERE id = ANY(r.ids[2:array_length(r.ids, 1)]);
    END LOOP;

    ALTER TABLE inventory ADD CONSTRAINT inventory_store_item_unique UNIQUE (store_id, item_name);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Atomic RPC functions
--
-- SECURITY INVOKER (the default — spelled out so nobody "upgrades" it to
-- DEFINER later). Every statement inside still runs as the calling user, so
-- every RLS policy still applies exactly as if the client had run the
-- statement itself. That is what makes it safe to grant EXECUTE broadly: the
-- function can only do what the caller's own policies already allow: it just
-- does it all in one round trip instead of several.
--
-- Table names are schema-qualified throughout so nothing here depends on the
-- caller's search_path.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_add_stock(
  p_store_id uuid,
  p_item_name text,
  p_quantity integer,
  p_remarks text DEFAULT NULL
) RETURNS TABLE (id uuid, quantity integer, created boolean)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_name text := btrim(p_item_name);
BEGIN
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Item name is required' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity must be zero or more' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.inventory AS i (store_id, item_name, quantity, remarks, last_updated)
  VALUES (p_store_id, v_name, p_quantity, NULLIF(btrim(p_remarks), ''), now())
  ON CONFLICT (store_id, item_name) DO UPDATE
    SET quantity = i.quantity + EXCLUDED.quantity,
        last_updated = now()
  RETURNING i.id, i.quantity, (xmax = 0) AS created;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_add_stock(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_stock(uuid, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_send_goods(
  p_item_id uuid,
  p_from_store_id uuid,
  p_to_store_id uuid,
  p_quantity integer,
  p_remarks text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_item public.inventory%ROWTYPE;
BEGIN
  IF p_from_store_id IS NULL THEN
    RAISE EXCEPTION 'Source store is required' USING ERRCODE = '22023';
  END IF;
  IF p_to_store_id IS NULL THEN
    RAISE EXCEPTION 'Destination store is required' USING ERRCODE = '22023';
  END IF;
  IF p_from_store_id = p_to_store_id THEN
    RAISE EXCEPTION 'Source and destination store must be different' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive whole number' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.inventory WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_item.store_id <> p_from_store_id THEN
    RAISE EXCEPTION 'Selected item does not belong to the chosen source store' USING ERRCODE = '22023';
  END IF;

  -- Atomic compare-and-decrement: the WHERE quantity >= p_quantity is
  -- evaluated against the current committed row when the update takes its
  -- lock, so two concurrent sends can never both succeed against the same
  -- stock. If RLS hides this row from the caller as an update target (they
  -- are not the owning store and not a global logistics role), this also
  -- reports 0 rows — deliberately indistinguishable from "not enough stock",
  -- so the message below never reveals another store's real stock level.
  UPDATE public.inventory
     SET quantity = quantity - p_quantity, last_updated = now()
   WHERE id = p_item_id AND quantity >= p_quantity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient quantity, or you do not have permission to send from that store' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.goods_log (item_id, store_from, store_to, quantity, type, status, remarks)
  VALUES (p_item_id, p_from_store_id, p_to_store_id, p_quantity, 'sent', 'pending', NULLIF(btrim(p_remarks), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_send_goods(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_send_goods(uuid, uuid, uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_receive_against_log(
  p_log_id uuid,
  p_receiving_store_id uuid,
  p_item_name text,
  p_quantity integer,
  p_remarks text DEFAULT NULL
-- Output column deliberately not named "status": goods_log itself has a
-- status column, and a RETURNS TABLE column with the same name as a table
-- column referenced in the function body makes every bare `status` in that
-- body ambiguous (which one it means), not just this declaration.
) RETURNS TABLE (receive_status public.goods_log_status)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_pending public.goods_log%ROWTYPE;
  v_status public.goods_log_status;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive whole number' USING ERRCODE = '22023';
  END IF;

  -- quantity is set once at insert and never changed afterwards, so it's
  -- safe to read it before the claim below (nothing about it can race).
  v_status := CASE WHEN EXISTS (
    SELECT 1 FROM public.goods_log WHERE id = p_log_id AND quantity = p_quantity
  ) THEN 'matched' ELSE 'error' END;

  -- Claim it: only one caller can move a row out of 'pending', so a
  -- double-click, or two people receiving the same shipment, can't add the
  -- stock twice. RLS additionally restricts this to the store the shipment
  -- is actually addressed to, so the sender cannot self-confirm its own
  -- outgoing log.
  UPDATE public.goods_log
     SET status = v_status
   WHERE id = p_log_id AND status = 'pending'
  RETURNING * INTO v_pending;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This transfer was already received or changed, or is not addressed to your store' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.rpc_add_stock(p_receiving_store_id, p_item_name, p_quantity, NULL);

  INSERT INTO public.goods_log (item_id, store_from, store_to, quantity, type, status, reference_id, remarks)
  VALUES (v_pending.item_id, v_pending.store_from, p_receiving_store_id, p_quantity, 'received', v_status, v_pending.id, NULLIF(btrim(p_remarks), ''));

  RETURN QUERY SELECT v_status AS receive_status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_receive_against_log(uuid, uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_against_log(uuid, uuid, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_receive_unlisted(
  p_item_id uuid,
  p_item_name text,
  p_receiving_store_id uuid,
  p_quantity integer,
  p_remarks text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive whole number' USING ERRCODE = '22023';
  END IF;

  PERFORM public.rpc_add_stock(p_receiving_store_id, p_item_name, p_quantity, NULL);

  INSERT INTO public.goods_log (item_id, store_to, quantity, type, status, remarks)
  VALUES (p_item_id, p_receiving_store_id, p_quantity, 'received', 'error', NULLIF(btrim(p_remarks), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_receive_unlisted(uuid, text, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_unlisted(uuid, text, uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_transfer_worker(
  p_worker_id uuid,
  p_to_site_id uuid,
  p_effective_date date,
  p_notes text DEFAULT NULL,
  p_new_account_number text DEFAULT NULL,
  p_new_account_location uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_worker public.workers%ROWTYPE;
  v_is_casual boolean;
  v_account_number text;
BEGIN
  IF p_to_site_id IS NULL THEN
    RAISE EXCEPTION 'Choose a destination site' USING ERRCODE = '22023';
  END IF;

  -- Locking the row here means two simultaneous transfers of the SAME worker
  -- can no longer both read the "old" site and each write a transfer record
  -- against it; the second one waits, then sees the first's result.
  SELECT * INTO v_worker FROM public.workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_worker.site_id = p_to_site_id THEN
    RAISE EXCEPTION 'The worker is already assigned to that site' USING ERRCODE = '22023';
  END IF;

  -- worker_type is read from the row itself, never trusted from the caller.
  v_is_casual := v_worker.worker_type = 'casual';
  v_account_number := NULLIF(btrim(p_new_account_number), '');
  IF v_is_casual AND (v_account_number IS NULL OR p_new_account_location IS NULL) THEN
    RAISE EXCEPTION 'Casual workers require a new account location and number upon transfer' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workers
     SET site_id = p_to_site_id,
         account_number = CASE WHEN v_is_casual THEN v_account_number ELSE account_number END,
         account_location = CASE WHEN v_is_casual THEN p_new_account_location ELSE account_location END
   WHERE id = p_worker_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The transfer was not saved: you may not have permission' USING ERRCODE = '42501';
  END IF;

  -- created_by is always the caller's own id — never accepted from the
  -- client — so the transfer log can't be attributed to someone else.
  INSERT INTO public.worker_transfers (
    worker_id, from_site_id, to_site_id, effective_date, cleared_account,
    old_account_number, new_account_number, notes, created_by
  ) VALUES (
    p_worker_id, v_worker.site_id, p_to_site_id, p_effective_date, v_is_casual,
    v_worker.account_number, CASE WHEN v_is_casual THEN v_account_number ELSE NULL END,
    NULLIF(btrim(p_notes), ''), auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_transfer_worker(uuid, uuid, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_transfer_worker(uuid, uuid, date, text, text, uuid) TO authenticated;

-- ------------------------------------------------------------
-- Items 3 and 4 from the header above (the goods_log direction-aware INSERT
-- policies, and making worker_transfers append-only) are policy changes, so
-- per this project's own rule they live ONLY in update_rls_for_all_roles.sql
-- — not here too. That file also defines auth_role()/auth_store_id(), which
-- don't exist yet at this point in the run order, so a policy referencing
-- them can't be created from this file anyway. Run update_rls_for_all_roles.sql
-- right after this one; it is not optional for this migration to take effect.
-- ------------------------------------------------------------

COMMIT;
