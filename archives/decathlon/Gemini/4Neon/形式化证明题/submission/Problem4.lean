import Mathlib.Data.Finset.Powerset
import Mathlib.Analysis.MeanInequalities

open Finset

namespace Problem4Aux

lemma card_pow_mul_prod_le_sum_pow {ι : Type*} (s : Finset ι) (hs : s.Nonempty) (f : ι → ℕ) :
    s.card ^ s.card * ∏ i ∈ s, f i ≤ (∑ i ∈ s, f i) ^ s.card := by
  have hm : (0 : ℝ) < s.card := by exact_mod_cast hs.card_pos
  have hprod_nn : (0 : ℝ) ≤ ∏ i ∈ s, (f i : ℝ) :=
    Finset.prod_nonneg fun i _ => Nat.cast_nonneg _
  have hamgm := Real.geom_mean_le_arith_mean s (fun _ => (1 : ℝ)) (fun i => (f i : ℝ))
    (fun _ _ => zero_le_one) (by simp [hm]) (fun i _ => Nat.cast_nonneg _)
  simp only [Finset.sum_const, nsmul_eq_mul, mul_one, one_mul, Real.rpow_one] at hamgm
  have hpow := pow_le_pow_left₀ (Real.rpow_nonneg hprod_nn _) hamgm s.card
  rw [div_pow, ← Real.rpow_natCast, ← Real.rpow_mul hprod_nn,
    inv_mul_cancel₀ hm.ne', Real.rpow_one, le_div_iff₀ (pow_pos hm _), mul_comm] at hpow
  exact_mod_cast hpow

lemma biUnion_id_mem_of_union_closed {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A)
    (T : Finset (Finset α)) (hT_ne : T.Nonempty) (hTA : T ⊆ A) :
    T.biUnion id ∈ A := by
  induction T using Finset.induction_on with
  | empty => exact absurd hT_ne not_nonempty_empty
  | @insert x s hxs ih =>
    rw [biUnion_insert, id_eq]
    have hxA : x ∈ A := hTA (mem_insert_self x s)
    by_cases hs : s.Nonempty
    · have hsA : s.biUnion id ∈ A := ih hs (fun y hy => hTA (mem_insert_of_mem hy))
      exact hunion x hxA (s.biUnion id) hsA
    · rw [not_nonempty_iff_eq_empty.mp hs, biUnion_empty, union_empty]
      exact hxA

lemma problem4_of_empty_mem {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (h0 : (∅ : Finset α) ∈ A)
    (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) :
    A.card ^ A.card ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := by
  classical
  have hA : A.Nonempty := ⟨∅, h0⟩
  set U : Finset α := A.biUnion id
  have hsubU : ∀ a ∈ A, a ⊆ U := fun a ha => subset_biUnion_of_mem id ha
  -- Closure map f(s) = ⋃ {a ∈ A | a ⊆ s}
  let f : Finset α → Finset α := fun s => (A.filter (· ⊆ s)).biUnion id
  have hf_mem : ∀ s, f s ∈ A := by
    intro s
    apply biUnion_id_mem_of_union_closed A hunion _ _ (filter_subset _ _)
    exact ⟨∅, mem_filter.mpr ⟨h0, empty_subset s⟩⟩
  have hf_sub : ∀ s, f s ⊆ s := by
    intro s x hx
    rcases mem_biUnion.mp hx with ⟨a, ha, hxa⟩
    exact (mem_filter.mp ha).2 hxa
  have hle_hf : ∀ a ∈ A, ∀ s, a ⊆ s → a ⊆ f s := by
    intro a ha s has
    exact subset_biUnion_of_mem id (mem_filter.mpr ⟨ha, has⟩)
  have hf_id : ∀ a ∈ A, f a = a := fun a ha =>
    Subset.antisymm (hf_sub a) (hle_hf a ha a Subset.rfl)
  have hf_between : ∀ a ∈ A, ∀ s t, a ⊆ s → s ⊆ t → f t = a → f s = a := by
    intro a ha s t has hst hft
    apply Subset.antisymm
    · rw [← hft]
      exact hle_hf (f s) (hf_mem s) t ((hf_sub s).trans hst)
    · exact hle_hf a ha s has
  -- For each a ∈ A, choose B a ∈ F_a = {s ⊆ U | f s = a} of maximum cardinality
  have hB_exists : ∀ a ∈ A, ∃ B : Finset α,
      B ⊆ U ∧ f B = a ∧ a ⊆ B ∧ ∀ x ∈ U, x ∉ B → f (insert x B) ≠ a := by
    intro a ha
    set Fa : Finset (Finset α) := U.powerset.filter (fun s => f s = a)
    have hFa_ne : Fa.Nonempty :=
      ⟨a, mem_filter.mpr ⟨mem_powerset.mpr (hsubU a ha), hf_id a ha⟩⟩
    obtain ⟨B, hB_mem, hB_max⟩ := Finset.exists_max_image Fa Finset.card hFa_ne
    have hBU : B ⊆ U := mem_powerset.mp (mem_filter.mp hB_mem).1
    have hfB : f B = a := (mem_filter.mp hB_mem).2
    have haB : a ⊆ B := hfB ▸ hf_sub B
    refine ⟨B, hBU, hfB, haB, fun x hxU hxB hfins => ?_⟩
    have hins_mem : insert x B ∈ Fa :=
      mem_filter.mpr ⟨mem_powerset.mpr (insert_subset hxU hBU), hfins⟩
    have hle := hB_max (insert x B) hins_mem
    rw [card_insert_of_notMem hxB] at hle
    omega
  choose B hB_spec using hB_exists
  -- Use default ∅ outside A so B is a plain function Finset α → Finset α
  let B' : Finset α → Finset α := fun a => if ha : a ∈ A then B a ha else ∅
  have hB'_subU : ∀ a ∈ A, B' a ⊆ U := fun a ha => by simp only [B', dite_eq_left ha]; exact (hB_spec a ha).1
  have hB'_f : ∀ a ∈ A, f (B' a) = a := fun a ha => by simp only [B', dite_eq_left ha]; exact (hB_spec a ha).2.1
  have hB'_sup : ∀ a ∈ A, a ⊆ B' a := fun a ha => by simp only [B', dite_eq_left ha]; exact (hB_spec a ha).2.2.1
  have hB'_max : ∀ a ∈ A, ∀ x ∈ U, x ∉ B' a → f (insert x (B' a)) ≠ a := fun a ha => by
    simp only [B', dite_eq_left ha]; exact (hB_spec a ha).2.2.2
  -- Disjoint intervals I a = [a, B' a] inside U.powerset
  let I : Finset α → Finset (Finset α) :=
    fun a => U.powerset.filter (fun s => a ⊆ s ∧ s ⊆ B' a)
  have hI_card : ∀ a ∈ A, (I a).card = 2 ^ ((B' a).card - a.card) := by
    intro a ha
    have hbij : I a = (B' a \ a).powerset.image (fun t => a ∪ t) := by
      ext s
      simp only [I, mem_filter, mem_powerset, mem_image]
      constructor
      · rintro ⟨_, has, hsB⟩
        refine ⟨s \ a, sdiff_subset_sdiff hsB Subset.rfl, union_sdiff_of_subset has⟩
      · rintro ⟨t, ht, rfl⟩
        have htB : t ⊆ B' a := ht.trans sdiff_subset
        refine ⟨(union_subset (hB'_sup a ha) htB).trans (hB'_subU a ha), subset_union_left,
          union_subset (hB'_sup a ha) htB⟩
    rw [hbij, card_image_of_injOn]
    · rw [card_powerset, card_sdiff_of_subset (hB'_sup a ha)]
    · intro t1 ht1 t2 ht2 heq
      have hd1 : Disjoint a t1 := disjoint_sdiff_self_right.mono_right (mem_powerset.mp ht1)
      have hd2 : Disjoint a t2 := disjoint_sdiff_self_right.mono_right (mem_powerset.mp ht2)
      have h1 : (a ∪ t1) \ a = t1 := union_sdiff_cancel_left hd1
      have h2 : (a ∪ t2) \ a = t2 := union_sdiff_cancel_left hd2
      dsimp only at heq
      rw [← h1, heq, h2]
  have hI_disj : Set.PairwiseDisjoint (↑A : Set (Finset α)) I := by
    intro a1 ha1 a2 ha2 hne
    dsimp only [Function.onFun]
    rw [Finset.disjoint_left]
    intro s hs1 hs2
    have h1 := (mem_filter.mp hs1).2
    have h2 := (mem_filter.mp hs2).2
    have hf1 : f s = a1 := hf_between a1 ha1 s (B' a1) h1.1 h1.2 (hB'_f a1 ha1)
    have hf2 : f s = a2 := hf_between a2 ha2 s (B' a2) h2.1 h2.2 (hB'_f a2 ha2)
    exact hne (hf1.symm.trans hf2)
  have hsum_pow_le : ∑ a ∈ A, 2 ^ ((B' a).card - a.card) ≤ 2 ^ U.card := by
    have hsub : A.biUnion I ⊆ U.powerset := by
      intro s hs
      rcases mem_biUnion.mp hs with ⟨a, _, hsa⟩
      exact (mem_filter.mp hsa).1
    calc ∑ a ∈ A, 2 ^ ((B' a).card - a.card)
        = ∑ a ∈ A, (I a).card := Finset.sum_congr rfl (fun a ha => (hI_card a ha).symm)
      _ = (A.biUnion I).card := (card_biUnion hI_disj).symm
      _ ≤ U.powerset.card := Finset.card_le_card hsub
      _ = 2 ^ U.card := card_powerset U
  -- AM-GM: A.card ^ A.card * 2^(∑ (|B' a| - |a|)) ≤ 2^(A.card * |U|)
  have hamgm_step : A.card ^ A.card * 2 ^ (∑ a ∈ A, ((B' a).card - a.card)) ≤
      2 ^ (A.card * U.card) := by
    have hprod_eq : ∏ a ∈ A, (2 ^ ((B' a).card - a.card) : ℕ) =
        2 ^ (∑ a ∈ A, ((B' a).card - a.card)) := by
      rw [Finset.prod_pow_eq_pow_sum]
    calc A.card ^ A.card * 2 ^ (∑ a ∈ A, ((B' a).card - a.card))
        = A.card ^ A.card * ∏ a ∈ A, 2 ^ ((B' a).card - a.card) := by rw [hprod_eq]
      _ ≤ (∑ a ∈ A, 2 ^ ((B' a).card - a.card)) ^ A.card :=
          card_pow_mul_prod_le_sum_pow A hA (fun a => 2 ^ ((B' a).card - a.card))
      _ ≤ (2 ^ U.card) ^ A.card := Nat.pow_le_pow_left hsum_pow_le A.card
      _ = 2 ^ (A.card * U.card) := by rw [← pow_mul, mul_comm]
  -- Element-by-element injection for each x ∈ U
  have hinj_x : ∀ x ∈ U, (A.filter (fun a => x ∉ B' a)).card ≤ (A.filter (fun a => x ∈ a)).card := by
    intro x hxU
    apply Finset.card_le_card_of_injOn (fun a => f (insert x (B' a)))
    · intro a ha
      have haA : a ∈ A := (mem_filter.mp ha).1
      have hxB : x ∉ B' a := (mem_filter.mp ha).2
      rw [mem_coe, mem_filter]
      refine ⟨hf_mem _, ?_⟩
      by_contra hxf
      have hsub_B : f (insert x (B' a)) ⊆ B' a := by
        intro y hy
        have hyins := hf_sub (insert x (B' a)) hy
        rcases mem_insert.mp hyins with rfl | hyB
        · exact absurd hy hxf
        · exact hyB
      have h1 : f (insert x (B' a)) ⊆ a :=
        (hle_hf _ (hf_mem _) (B' a) hsub_B).trans_eq (hB'_f a haA)
      have h2 : a ⊆ f (insert x (B' a)) :=
        hle_hf a haA _ ((hB'_sup a haA).trans (subset_insert x (B' a)))
      exact hB'_max a haA x hxU hxB (Subset.antisymm h1 h2)
    · intro a1 ha1 a2 ha2 heq
      dsimp only at heq
      have ha1A : a1 ∈ A := (mem_filter.mp ha1).1
      have hxB1 : x ∉ B' a1 := (mem_filter.mp ha1).2
      have ha2A : a2 ∈ A := (mem_filter.mp ha2).1
      have hxB2 : x ∉ B' a2 := (mem_filter.mp ha2).2
      have ha1_sub_B2 : a1 ⊆ B' a2 := by
        intro y hy
        have hya1_ne_x : y ≠ x := fun h => hxB1 (h ▸ hB'_sup a1 ha1A hy)
        have hyf1 : y ∈ f (insert x (B' a1)) :=
          hle_hf a1 ha1A _ ((hB'_sup a1 ha1A).trans (subset_insert x (B' a1))) hy
        rw [heq] at hyf1
        have hyins := hf_sub (insert x (B' a2)) hyf1
        exact (mem_insert.mp hyins).resolve_left hya1_ne_x
      have ha2_sub_B1 : a2 ⊆ B' a1 := by
        intro y hy
        have hya2_ne_x : y ≠ x := fun h => hxB2 (h ▸ hB'_sup a2 ha2A hy)
        have hyf2 : y ∈ f (insert x (B' a2)) :=
          hle_hf a2 ha2A _ ((hB'_sup a2 ha2A).trans (subset_insert x (B' a2))) hy
        rw [← heq] at hyf2
        have hyins := hf_sub (insert x (B' a1)) hyf2
        exact (mem_insert.mp hyins).resolve_left hya2_ne_x
      have h12 : a1 ⊆ a2 := by
        rw [← hB'_f a2 ha2A]
        exact hle_hf a1 ha1A (B' a2) ha1_sub_B2
      have h21 : a2 ⊆ a1 := by
        rw [← hB'_f a1 ha1A]
        exact hle_hf a2 ha2A (B' a1) ha2_sub_B1
      exact Subset.antisymm h12 h21
  -- Sum over x ∈ U to get A.card * U.card ≤ ∑ |B' a| + ∑ |a|
  have hsum_lhs : ∑ x ∈ U, (A.filter (fun a => x ∉ B' a)).card =
      ∑ a ∈ A, (U.card - (B' a).card) := by
    simp_rw [Finset.card_filter]
    rw [Finset.sum_comm]
    refine Finset.sum_congr rfl fun a ha => ?_
    have : ∑ x ∈ U, (if x ∉ B' a then 1 else 0) = (U.filter (fun x => x ∉ B' a)).card := by
      rw [Finset.card_filter]
    rw [this]
    have hfilt : U.filter (fun x => x ∉ B' a) = U \ B' a := by
      ext x; simp [mem_sdiff]
    rw [hfilt, card_sdiff_of_subset (hB'_subU a ha)]
  have hsum_rhs : ∑ x ∈ U, (A.filter (fun a => x ∈ a)).card = ∑ a ∈ A, a.card := by
    simp_rw [Finset.card_filter]
    rw [Finset.sum_comm]
    refine Finset.sum_congr rfl fun a ha => ?_
    have : ∑ x ∈ U, (if x ∈ a then 1 else 0) = (U.filter (fun x => x ∈ a)).card := by
      rw [Finset.card_filter]
    rw [this]
    have hfilt : U.filter (fun x => x ∈ a) = a := by
      ext x
      simp only [mem_filter, and_iff_right_iff_imp]
      exact fun hx => hsubU a ha hx
    rw [hfilt]
  have hsum_ineq : ∑ a ∈ A, (U.card - (B' a).card) ≤ ∑ a ∈ A, a.card := by
    rw [← hsum_lhs, ← hsum_rhs]
    exact Finset.sum_le_sum hinj_x
  have hAU_le : A.card * U.card ≤ (∑ a ∈ A, ((B' a).card - a.card)) + 2 * ∑ a ∈ A, a.card := by
    have h1 : (∑ a ∈ A, (U.card - (B' a).card)) + (∑ a ∈ A, (B' a).card) = A.card * U.card := by
      rw [← Finset.sum_add_distrib]
      calc ∑ a ∈ A, (U.card - (B' a).card + (B' a).card)
          = ∑ _ ∈ A, U.card := Finset.sum_congr rfl fun a ha =>
            Nat.sub_add_cancel (Finset.card_le_card (hB'_subU a ha))
        _ = A.card * U.card := by simp
    have h2 : (∑ a ∈ A, ((B' a).card - a.card)) + ∑ a ∈ A, a.card = ∑ a ∈ A, (B' a).card := by
      rw [← Finset.sum_add_distrib]
      exact Finset.sum_congr rfl fun a ha =>
        Nat.sub_add_cancel (Finset.card_le_card (hB'_sup a ha))
    omega
  -- Combine AM-GM and exponent bound
  have hfinal : A.card ^ A.card * 2 ^ (∑ a ∈ A, ((B' a).card - a.card)) ≤
      2 ^ (2 * ∑ a ∈ A, a.card) * 2 ^ (∑ a ∈ A, ((B' a).card - a.card)) := by
    calc A.card ^ A.card * 2 ^ (∑ a ∈ A, ((B' a).card - a.card))
        ≤ 2 ^ (A.card * U.card) := hamgm_step
      _ ≤ 2 ^ ((∑ a ∈ A, ((B' a).card - a.card)) + 2 * ∑ a ∈ A, a.card) :=
          Nat.pow_le_pow_right (by norm_num) hAU_le
      _ = 2 ^ (2 * ∑ a ∈ A, a.card) * 2 ^ (∑ a ∈ A, ((B' a).card - a.card)) := by
          rw [add_comm, pow_add]
  exact Nat.le_of_mul_le_mul_right hfinal (Nat.pow_pos (by norm_num))

end Problem4Aux

open Problem4Aux

theorem problem4 {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hA : A.Nonempty)
    (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) :
    A.card ^ A.card ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := by
  by_cases h0 : (∅ : Finset α) ∈ A
  · exact problem4_of_empty_mem A h0 hunion
  · set A' : Finset (Finset α) := insert ∅ A
    have h0' : (∅ : Finset α) ∈ A' := Finset.mem_insert_self ∅ A
    have hunion' : ∀ a ∈ A', ∀ b ∈ A', a ∪ b ∈ A' := by
      intro a ha b hb
      rcases Finset.mem_insert.mp ha with rfl | haA <;>
      rcases Finset.mem_insert.mp hb with rfl | hbA
      · simp [h0']
      · rw [empty_union]; exact Finset.mem_insert_of_mem hbA
      · rw [union_empty]; exact Finset.mem_insert_of_mem haA
      · exact Finset.mem_insert_of_mem (hunion a haA b hbA)
    have hsum_eq : ∑ a ∈ A', a.card = ∑ a ∈ A, a.card := by
      simp [A', Finset.sum_insert h0]
    have hcard_le : A.card ≤ A'.card := Finset.card_le_card (Finset.subset_insert ∅ A)
    have hpow_le : A.card ^ A.card ≤ A'.card ^ A'.card := by
      calc A.card ^ A.card ≤ A'.card ^ A.card := Nat.pow_le_pow_left hcard_le A.card
        _ ≤ A'.card ^ A'.card := Nat.pow_le_pow_right (Nat.lt_of_lt_of_le hA.card_pos hcard_le) hcard_le
    calc A.card ^ A.card ≤ A'.card ^ A'.card := hpow_le
      _ ≤ 2 ^ (2 * ∑ a ∈ A', a.card) := problem4_of_empty_mem A' h0' hunion'
      _ = 2 ^ (2 * ∑ a ∈ A, a.card) := by rw [hsum_eq]
