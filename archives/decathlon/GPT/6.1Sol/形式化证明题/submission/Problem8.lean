import Mathlib.FieldTheory.ChevalleyWarning
import Mathlib.Data.Finset.Powerset
import Mathlib.Data.Nat.Choose.Lucas
import Mathlib.Algebra.BigOperators.Group.Finset.Powerset
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Ring
import Mathlib.Tactic.GCongr
import Mathlib.Data.Fintype.Pigeonhole
import Mathlib.Algebra.CharP.Two

open Finset MvPolynomial

noncomputable section

open scoped Classical

private def supportIn {ι : Type*} [DecidableEq ι] {K : Type*} [Zero K]
    (s : Finset ι) (x : s → K) : Finset ι := by
  classical
  exact (s.attach.filter (fun i => x i ≠ 0)).map ⟨(↑), Subtype.val_injective⟩

private lemma supportIn_subset {ι : Type*} [DecidableEq ι] {K : Type*} [Zero K]
    (s : Finset ι) (x : s → K) : supportIn s x ⊆ s := by
  classical
  intro i hi
  obtain ⟨j, hj, rfl⟩ := mem_map.mp hi
  exact j.prop

private lemma mem_supportIn {ι : Type*} [DecidableEq ι] {K : Type*} [Zero K]
    (s : Finset ι) (x : s → K) (i : s) :
    (i : ι) ∈ supportIn s x ↔ x i ≠ 0 := by
  classical
  simp [supportIn]

private lemma supportIn_eq_iff {ι : Type*} [DecidableEq ι] {K : Type*} [Zero K]
    (s t : Finset ι) (hst : t ⊆ s) (x : s → K) :
    supportIn s x = t ↔ ∀ i : s, x i ≠ 0 ↔ (i : ι) ∈ t := by
  constructor
  · intro h i
    rw [← h, mem_supportIn]
  · intro h
    ext i
    by_cases hi : i ∈ s
    · exact (mem_supportIn s x ⟨i, hi⟩).trans (h ⟨i, hi⟩)
    · exact iff_of_false (fun hm => hi (supportIn_subset s x hm)) (fun hm => hi (hst hm))

private lemma support_fiber_card {ι : Type*} [DecidableEq ι]
    (p : ℕ) [Fact p.Prime] (s t : Finset ι) (hst : t ⊆ s) :
    Fintype.card {x : s → ZMod p // supportIn s x = t} = (p - 1) ^ t.card := by
  classical
  let e := (Equiv.subtypeEquivRight (supportIn_eq_iff s t hst)).trans
    (Equiv.subtypePiEquivPi (p := fun i : s => fun a : ZMod p => a ≠ 0 ↔ (i : ι) ∈ t))
  rw [Fintype.card_congr e, Fintype.card_pi]
  have hi : ∀ i : s, Fintype.card {a : ZMod p // a ≠ 0 ↔ (i : ι) ∈ t} =
      if (i : ι) ∈ t then p - 1 else 1 := by
    intro i
    by_cases ht : (i : ι) ∈ t
    · simp [ht, Fintype.card_subtype_compl, ZMod.card]
    · simp [ht]
  simp_rw [hi]
  rw [Finset.prod_ite]
  simp only [Finset.prod_const, one_pow, mul_one]
  congr 1
  have he : (univ.filter fun i : s => (i : ι) ∈ t).map
      ⟨((↑) : s → ι), Subtype.val_injective⟩ = t := by
    ext i
    simp only [mem_map, mem_filter, mem_univ, true_and, Function.Embedding.coeFn_mk]
    constructor
    · rintro ⟨j, hj, rfl⟩
      exact hj
    · intro hit
      exact ⟨⟨i, hst hit⟩, hit, rfl⟩
  exact (card_map _).symm.trans (congrArg card he)

private lemma support_weighted_sum {ι : Type*} [DecidableEq ι]
    (p : ℕ) [Fact p.Prime] (s : Finset ι) (H : Finset ι → ZMod p) :
    (∑ x : s → ZMod p, H (supportIn s x)) =
      ∑ t ∈ s.powerset, (-1 : ZMod p) ^ t.card * H t := by
  classical
  let g : (s → ZMod p) → s.powerset := fun x =>
    ⟨supportIn s x, mem_powerset.mpr (supportIn_subset s x)⟩
  have hsum := (Fintype.sum_fiberwise g (fun x => H (supportIn s x))).symm
  calc
    _ = ∑ t : s.powerset, ∑ x : {x // g x = t}, H (t : Finset ι) := by
      rw [hsum]
      apply Fintype.sum_congr
      intro t
      apply Fintype.sum_congr
      intro x
      exact congrArg H (congrArg Subtype.val x.prop)
    _ = ∑ t : s.powerset, (Fintype.card {x // g x = t} : ZMod p) * H t := by
      simp
    _ = ∑ t : s.powerset, (-1 : ZMod p) ^ t.val.card * H t := by
      apply Fintype.sum_congr
      intro t
      have hc : Fintype.card {x // g x = t} = (p - 1) ^ t.val.card := by
        have he : {x // g x = t} ≃ {x : s → ZMod p // supportIn s x = t.val} :=
          Equiv.subtypeEquivRight (fun x => Subtype.ext_iff)
        rw [Fintype.card_congr he]
        exact support_fiber_card p s t.val (mem_powerset.mp t.prop)
      rw [hc, Nat.cast_pow]
      congr 2
      have hp := (Fact.out : p.Prime).one_le
      rw [Nat.cast_sub hp, ZMod.natCast_self, Nat.cast_one, zero_sub]
    _ = _ := by simpa using (Finset.sum_coe_sort s.powerset
      (fun t : Finset ι => (-1 : ZMod p) ^ t.card * H t))

private lemma supportIn_sum {ι V K : Type*} [DecidableEq ι] [AddCommMonoid V] [Zero K]
    (s : Finset ι) (x : s → K) (f : ι → V) :
    (∑ i ∈ supportIn s x, f i) = ∑ i : s, if x i ≠ 0 then f i else 0 := by
  classical
  simp only [supportIn, sum_map, Function.Embedding.coeFn_mk, sum_filter]
  change (∑ i ∈ s.attach, if x i ≠ 0 then f i else 0) = _
  rw [← univ_eq_attach]

private lemma chevalley_weighted {ι : Type*} [DecidableEq ι]
    (p : ℕ) [Fact p.Prime] (s : Finset ι) (b : Fin 3 → ι → ZMod p)
    (hs : 3 * (p - 1) < s.card) :
    (∑ t ∈ s.powerset, (-1 : ZMod p) ^ t.card *
      if (∀ j, ∑ i ∈ t, b j i = 0) then 1 else 0) = 0 := by
  classical
  let f : Fin 3 → MvPolynomial s (ZMod p) :=
    fun j => ∑ i : s, C (b j i) * X i ^ (p - 1)
  let F : MvPolynomial s (ZMod p) := ∏ j : Fin 3, (1 - (f j) ^ (p - 1))
  have hfdeg : ∀ j, (f j).totalDegree ≤ p - 1 := by
    intro j
    apply totalDegree_finsetSum_le
    intro i hi
    exact (totalDegree_mul _ _).trans (by simp [totalDegree_X_pow])
  have hFdeg : F.totalDegree ≤ 3 * ((p - 1) * (p - 1)) := by
    apply (totalDegree_finsetProd _ _).trans
    calc
      _ ≤ ∑ j : Fin 3, (p - 1) * (p - 1) := by
        apply Finset.sum_le_sum
        intro j hj
        apply (totalDegree_sub _ _).trans
        simp only [totalDegree_one, zero_max]
        exact (totalDegree_pow _ _).trans (Nat.mul_le_mul_left _ (hfdeg j))
      _ = _ := by simp
  have hz : ∑ x : s → ZMod p, eval x F = 0 := by
    apply sum_eval_eq_zero
    simp only [ZMod.card, Fintype.card_coe]
    have hp : 0 < p - 1 := by have := (Fact.out : p.Prime).one_lt; omega
    exact hFdeg.trans_lt (by nlinarith [Nat.mul_lt_mul_of_pos_left hs hp])
  have heval : ∀ x : s → ZMod p, eval x F =
      if (∀ j, ∑ i ∈ supportIn s x, b j i = 0) then 1 else 0 := by
    intro x
    have hfj : ∀ j, eval x (f j) = ∑ i ∈ supportIn s x, b j i := by
      intro j
      rw [supportIn_sum]
      simp only [f, map_sum, map_mul, eval_C, map_pow, eval_X, ZMod.pow_card_sub_one]
      apply Finset.sum_congr rfl
      intro i hi
      split_ifs <;> simp
    simp only [F, map_prod, map_sub, map_one, map_pow, hfj]
    by_cases h : ∀ j, ∑ i ∈ supportIn s x, b j i = 0
    · simp [h, (Fact.out : p.Prime).one_lt, tsub_eq_zero_iff_le]
    · rw [if_neg h]
      obtain ⟨j, hj⟩ := not_forall.mp h
      apply Finset.prod_eq_zero (mem_univ j)
      rw [ZMod.pow_card_sub_one_eq_one hj, sub_self]
  simp_rw [heval] at hz
  exact (support_weighted_sum p s
    (fun t => if (∀ j, ∑ i ∈ t, b j i = 0) then 1 else 0)).symm.trans hz

private def zeroCount {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (k : ℕ) : ZMod p :=
  ∑ t ∈ s.powersetCard k, if ∑ i ∈ t, a i = 0 then 1 else 0

private lemma zeroCount_zero {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) : zeroCount p a s 0 = 1 := by
  simp only [zeroCount, powersetCard_zero, sum_singleton, sum_empty, ite_true]

private lemma zeroCount_eq_zero {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (k : ℕ)
    (h : ∀ t ⊆ s, t.card = k → ∑ i ∈ t, a i ≠ 0) : zeroCount p a s k = 0 := by
  apply Finset.sum_eq_zero
  intro t ht
  exact if_neg (h t (mem_powersetCard.mp ht).1 (mem_powersetCard.mp ht).2)

private lemma zeroCount_lift {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (k l : ℕ) (hkl : k ≤ l) :
    (∑ t ∈ s.powersetCard l, zeroCount p a t k) =
      ((s.card - k).choose (l - k) : ZMod p) * zeroCount p a s k := by
  classical
  have hrestrict : ∀ t ∈ s.powersetCard l,
      zeroCount p a t k = ∑ u ∈ s.powersetCard k,
        if u ⊆ t then (if ∑ i ∈ u, a i = 0 then 1 else 0) else 0 := by
    intro t ht
    have he : t.powersetCard k = (s.powersetCard k).filter (· ⊆ t) := by
      ext u
      simp only [mem_filter, mem_powersetCard]
      constructor
      · intro hu
        exact ⟨⟨hu.1.trans (mem_powersetCard.mp ht).1, hu.2⟩, hu.1⟩
      · intro hu
        exact ⟨hu.2, hu.1.2⟩
    rw [zeroCount, he, sum_filter]
  rw [Finset.sum_congr rfl hrestrict]
  rw [Finset.sum_comm, zeroCount, Finset.mul_sum]
  apply Finset.sum_congr rfl
  intro u hu
  rw [← Finset.sum_filter]
  rw [Finset.sum_const, nsmul_eq_mul]
  rw [card_filter_powersetCard_subset u s l (mem_powersetCard.mp hu).1
    ((mem_powersetCard.mp hu).2 ▸ hkl), (mem_powersetCard.mp hu).2]

private lemma chevalley_zero_sum {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (hs : 3 * (p - 1) < s.card) :
    (∑ t ∈ s.powerset, (-1 : ZMod p) ^ t.card *
      if (t.card : ZMod p) = 0 ∧ ∑ i ∈ t, a i = 0 then 1 else 0) = 0 := by
  let b : Fin 3 → ι → ZMod p :=
    fun j i => if j = 0 then 1 else if j = 1 then (a i).1 else (a i).2
  have h := chevalley_weighted p s b hs
  have he : ∀ t : Finset ι, (∀ j, ∑ i ∈ t, b j i = 0) ↔
      (t.card : ZMod p) = 0 ∧ ∑ i ∈ t, a i = 0 := by
    intro t
    simp [b, Fin.forall_fin_succ, Prod.ext_iff, Prod.fst_sum, Prod.snd_sum]
  simpa only [he] using h

private lemma zeroCount_as_sum {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (k : ℕ) :
    zeroCount p a s k = ∑ t ∈ s.powerset,
      if t.card = k ∧ ∑ i ∈ t, a i = 0 then 1 else 0 := by
  simp only [zeroCount, powersetCard_eq_filter, sum_filter]
  apply sum_congr rfl
  intro t ht
  split_ifs <;> simp_all

private lemma count_master {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (hp : 2 < p) (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (hlo : 3 * (p - 1) < s.card) (hhi : s.card < 4 * p) :
    1 - zeroCount p a s p + zeroCount p a s (2 * p) - zeroCount p a s (3 * p) = 0 := by
  have hpodd := (Fact.out : p.Prime).odd_of_ne_two (by omega)
  have hsign : (-1 : ZMod p) ^ p = -1 := hpodd.neg_one_pow
  have hw : ∀ t ∈ s.powerset,
      (-1 : ZMod p) ^ t.card *
        (if (t.card : ZMod p) = 0 ∧ ∑ i ∈ t, a i = 0 then 1 else 0) =
      (if t.card = 0 ∧ ∑ i ∈ t, a i = 0 then 1 else 0) -
      (if t.card = p ∧ ∑ i ∈ t, a i = 0 then 1 else 0) +
      (if t.card = 2 * p ∧ ∑ i ∈ t, a i = 0 then 1 else 0) -
      (if t.card = 3 * p ∧ ∑ i ∈ t, a i = 0 then 1 else 0) := by
    intro t ht
    have hc : t.card < 4 * p := (card_le_card (mem_powerset.mp ht)).trans_lt hhi
    have hcases : (t.card : ZMod p) = 0 ↔
        t.card = 0 ∨ t.card = p ∨ t.card = 2 * p ∨ t.card = 3 * p := by
      rw [ZMod.natCast_eq_zero_iff]
      constructor
      · rintro ⟨k, hk⟩
        have hk4 : k < 4 := by nlinarith
        have : k = 0 ∨ k = 1 ∨ k = 2 ∨ k = 3 := by omega
        rcases this with rfl | rfl | rfl | rfl <;> omega
      · rintro (h | h | h | h) <;> rw [h] <;> simp
    by_cases hz : ∑ i ∈ t, a i = 0
    · simp only [hz, and_true]
      by_cases hd : (t.card : ZMod p) = 0
      · rcases hcases.mp hd with h | h | h | h
        · simp [h, show 0 ≠ p by omega, show 0 ≠ 2 * p by omega,
            show 0 ≠ 3 * p by omega]
        · simp [h, hsign, show p ≠ 0 by omega, show p ≠ 2 * p by omega,
            show p ≠ 3 * p by omega]
        · have hs2 : (-1 : ZMod p) ^ (2 * p) = 1 := by
            rw [mul_comm 2 p, pow_mul, hsign]; ring
          simp [h, hs2, show 2 * p ≠ 0 by omega, show 2 * p ≠ p by omega,
            show 2 * p ≠ 3 * p by omega]
        · have hs3 : (-1 : ZMod p) ^ (3 * p) = -1 := by
            rw [mul_comm 3 p, pow_mul, hsign]; ring
          simp [h, hs3, show 3 * p ≠ 0 by omega, show 3 * p ≠ p by omega,
            show 3 * p ≠ 2 * p by omega]
      · have hn := not_or.mp (hcases.not.mp hd)
        have hn2 := not_or.mp hn.2
        have hn3 := not_or.mp hn2.2
        simp [hd, hn.1, hn2.1, hn3.1, hn3.2]
    · simp [hz]
  have heq : (∑ t ∈ s.powerset, (-1 : ZMod p) ^ t.card *
        if (t.card : ZMod p) = 0 ∧ ∑ i ∈ t, a i = 0 then 1 else 0) =
      zeroCount p a s 0 - zeroCount p a s p + zeroCount p a s (2 * p) -
        zeroCount p a s (3 * p) := by
    simp only [zeroCount_as_sum, ← Finset.sum_sub_distrib, ← Finset.sum_add_distrib]
    exact Finset.sum_congr rfl hw
  rw [← zeroCount_zero p a s, ← heq]
  exact chevalley_zero_sum p a s hlo

private lemma zeroCount_map {ι κ : Type*} [DecidableEq ι] [DecidableEq κ]
    (p : ℕ) [Fact p.Prime] (a : ι → ZMod p × ZMod p) (b : κ → ZMod p × ZMod p)
    (e : ι ↪ κ) (he : ∀ i, b (e i) = a i) (s : Finset ι) (k : ℕ) :
    zeroCount p b (s.map e) k = zeroCount p a s k := by
  simp only [zeroCount, powersetCard_map, Finset.sum_map]
  apply Finset.sum_congr rfl
  intro t ht
  simp [Finset.sum_map, he]

private lemma zeroCount_insert {ι : Type*} [DecidableEq ι]
    (p : ℕ) [Fact p.Prime] (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (x : ι) (hx : x ∉ s) (ha : a x = 0) (k : ℕ) :
    zeroCount p a (insert x s) (k + 1) = zeroCount p a s (k + 1) + zeroCount p a s k := by
  have hdis : Disjoint (s.powersetCard (k + 1)) ((s.powersetCard k).image (insert x)) := by
    apply Finset.disjoint_left.mpr
    intro t ht him
    obtain ⟨u, hu, rfl⟩ := mem_image.mp him
    exact hx ((mem_powersetCard.mp ht).1 (mem_insert_self _ _))
  have hinj : Set.InjOn (fun t : Finset ι => insert x t) (s.powersetCard k : Set (Finset ι)) := by
    intro u hu v hv h
    have hxu : x ∉ u := fun hxu => hx ((mem_powersetCard.mp hu).1 hxu)
    have hxv : x ∉ v := fun hxv => hx ((mem_powersetCard.mp hv).1 hxv)
    have he := congrArg (fun t : Finset ι => t.erase x) h
    simpa [hxu, hxv] using he
  rw [zeroCount, powersetCard_succ_insert hx, Finset.sum_union hdis,
    Finset.sum_image hinj]
  congr 1
  apply Finset.sum_congr rfl
  intro t ht
  have hxt : x ∉ t := fun h => hx ((mem_powersetCard.mp ht).1 h)
  simp [sum_insert hxt, ha]

private lemma zeroCount_append {ι : Type*} [DecidableEq ι]
    (p : ℕ) [Fact p.Prime] (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (k : ℕ) (hk : 0 < k) :
    zeroCount p (fun i : Option ι => i.elim 0 a)
        (insert none (s.map Function.Embedding.some)) k =
      zeroCount p a s k + zeroCount p a s (k - 1) := by
  have hk' : k = (k - 1) + 1 := by omega
  conv_lhs => rw [hk']
  rw [zeroCount_insert p _ _ none (by simp) (by rfl)]
  rw [zeroCount_map p a _ Function.Embedding.some (fun i => rfl),
    zeroCount_map p a _ Function.Embedding.some (fun i => rfl)]
  rw [← hk']

private lemma zeroCount_gt {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (k : ℕ) (hk : s.card < k) :
    zeroCount p a s k = 0 := by
  apply zeroCount_eq_zero
  intro t ht htk
  have := card_le_card ht
  omega

private lemma zeroCount_nonzero {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (k : ℕ)
    (h : zeroCount p a s k ≠ 0) :
    ∃ t ⊆ s, t.card = k ∧ ∑ i ∈ t, a i = 0 := by
  by_contra! hn
  exact h (zeroCount_eq_zero p a s k hn)

private lemma no_three_p {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (hp : 2 < p) (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (hn : ∀ t ⊆ s, t.card = p → ∑ i ∈ t, a i ≠ 0) :
    ∀ t ⊆ s, t.card = 3 * p → ∑ i ∈ t, a i ≠ 0 := by
  intro t hts ht hsum
  have htpos : 0 < t.card := by omega
  obtain ⟨x, hx⟩ := card_pos.mp htpos
  have herase : (t.erase x).card = 3 * p - 1 := by rw [card_erase_of_mem hx, ht]
  have hcw := count_master p hp a (t.erase x) (by omega) (by omega)
  have hnp : zeroCount p a (t.erase x) p = 0 :=
    zeroCount_eq_zero p a _ _ (fun u hu => hn u (hu.trans ((erase_subset x t).trans hts)))
  have hn3 : zeroCount p a (t.erase x) (3 * p) = 0 := zeroCount_gt p a _ _ (by omega)
  rw [hnp, hn3, sub_zero, sub_zero] at hcw
  have hne : zeroCount p a (t.erase x) (2 * p) ≠ 0 := by
    intro hz
    rw [hz, add_zero] at hcw
    exact one_ne_zero hcw
  obtain ⟨u, hu, hucard, husum⟩ := zeroCount_nonzero p a (t.erase x) (2 * p) hne
  have hut : u ⊆ t := hu.trans (erase_subset x t)
  have hvcard : (t \ u).card = p := by rw [card_sdiff_of_subset hut, ht, hucard]; omega
  apply hn (t \ u) (sdiff_subset.trans hts) hvcard
  have he := sum_sdiff hut (f := a)
  simpa [hsum, husum] using he

private lemma count_small {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (hp : 2 < p) (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (hs : s.card = 3 * p - 2 ∨ s.card = 3 * p - 1) :
    1 - zeroCount p a s p + zeroCount p a s (2 * p) = 0 := by
  have hc := count_master p hp a s (by omega) (by omega)
  rw [zeroCount_gt p a s (3 * p) (by omega), sub_zero] at hc
  exact hc

private lemma count_small_append {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (hp : 2 < p) (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (hs : s.card = 3 * p - 3) :
    1 - zeroCount p a s p - zeroCount p a s (p - 1) +
      zeroCount p a s (2 * p) + zeroCount p a s (2 * p - 1) = 0 := by
  let b : Option ι → ZMod p × ZMod p := fun i => i.elim 0 a
  let S := insert none (s.map Function.Embedding.some)
  have hcard : S.card = 3 * p - 2 := by simp [S, hs]; omega
  have hc := count_small p hp b S (Or.inl hcard)
  change 1 - zeroCount p b (insert none (s.map Function.Embedding.some)) p +
    zeroCount p b (insert none (s.map Function.Embedding.some)) (2 * p) = 0 at hc
  rw [zeroCount_append p a s p (by omega), zeroCount_append p a s (2 * p) (by omega)] at hc
  linear_combination hc

private lemma disjoint_flags {ι R : Type*} [DecidableEq ι] [AddCommMonoid R]
    (s : Finset ι) (u v : ℕ) (F : Finset ι → Finset ι → R) :
    (∑ A ∈ s.powersetCard u, ∑ C ∈ (s \ A).powersetCard v, F A C) =
      ∑ J ∈ s.powersetCard (u + v), ∑ C ∈ J.powersetCard v, F (J \ C) C := by
  have hdis : ∀ A C : Finset ι, C ⊆ s \ A → Disjoint A C := by
    intro A C h
    exact Finset.disjoint_left.mpr (fun i hi hC => (mem_sdiff.mp (h hC)).2 hi)
  rw [← Finset.sum_sigma (s.powersetCard u) (fun A => (s \ A).powersetCard v)
    (fun z : Σ _ : Finset ι, Finset ι => F z.1 z.2),
    ← Finset.sum_sigma (s.powersetCard (u + v)) (fun J => J.powersetCard v)
      (fun z : Σ _ : Finset ι, Finset ι => F (z.1 \ z.2) z.2)]
  apply Finset.sum_bij (fun z hz => ⟨z.1 ∪ z.2, z.2⟩)
  · intro z hz
    obtain ⟨hA, hC⟩ := mem_sigma.mp hz
    obtain ⟨hAs, hAc⟩ := mem_powersetCard.mp hA
    obtain ⟨hCs, hCc⟩ := mem_powersetCard.mp hC
    apply mem_sigma.mpr
    constructor
    · apply mem_powersetCard.mpr
      exact ⟨union_subset hAs (hCs.trans sdiff_subset), by
        rw [card_union_of_disjoint (hdis _ _ hCs), hAc, hCc]⟩
    · exact mem_powersetCard.mpr ⟨subset_union_right, hCc⟩
  · rintro ⟨A, C⟩ hAC ⟨B, D⟩ hBD he
    have hU : A ∪ C = B ∪ D := congrArg Sigma.fst he
    have hC : C = D := congrArg (fun z : Σ _ : Finset ι, Finset ι => z.2) he
    subst D
    have hdisA := hdis A C (mem_powersetCard.mp (mem_sigma.mp hAC).2).1
    have hdisB := hdis B C (mem_powersetCard.mp (mem_sigma.mp hBD).2).1
    have hAB : A = B := by
      rw [← union_sdiff_cancel_right hdisA, ← union_sdiff_cancel_right hdisB]
      exact congrArg (fun t : Finset ι => t \ C) hU
    subst B
    rfl
  · rintro ⟨J, C⟩ hJC
    obtain ⟨hJ, hC⟩ := mem_sigma.mp hJC
    obtain ⟨hJs, hJc⟩ := mem_powersetCard.mp hJ
    obtain ⟨hCJ, hCc⟩ := mem_powersetCard.mp hC
    refine ⟨⟨J \ C, C⟩, mem_sigma.mpr ⟨?_, ?_⟩, ?_⟩
    · apply mem_powersetCard.mpr
      exact ⟨sdiff_subset.trans hJs, by rw [card_sdiff_of_subset hCJ, hJc, hCc]; omega⟩
    · apply mem_powersetCard.mpr
      refine ⟨?_, hCc⟩
      intro i hi
      exact mem_sdiff.mpr ⟨hJs (hCJ hi), by simp [hi]⟩
    · simp [sdiff_union_of_subset hCJ]
  · intro z hz
    have hC := (mem_powersetCard.mp (mem_sigma.mp hz).2).1
    rw [union_sdiff_cancel_right (hdis _ _ hC)]

private lemma zero_flags {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (u v : ℕ) :
    (∑ A ∈ s.powersetCard u, if ∑ i ∈ A, a i = 0 then zeroCount p a (s \ A) v else 0) =
      ∑ J ∈ s.powersetCard (u + v), if ∑ i ∈ J, a i = 0 then zeroCount p a J v else 0 := by
  have hleft : (∑ A ∈ s.powersetCard u,
      if ∑ i ∈ A, a i = 0 then zeroCount p a (s \ A) v else 0) =
      ∑ A ∈ s.powersetCard u, ∑ C ∈ (s \ A).powersetCard v,
        if ∑ i ∈ A, a i = 0 ∧ ∑ i ∈ C, a i = 0 then (1 : ZMod p) else 0 := by
    apply Finset.sum_congr rfl
    intro A hA
    by_cases h : ∑ i ∈ A, a i = 0 <;> simp [h, zeroCount]
  rw [hleft, disjoint_flags]
  apply Finset.sum_congr rfl
  intro J hJ
  have hright : (∑ C ∈ J.powersetCard v,
      if ∑ i ∈ J \ C, a i = 0 ∧ ∑ i ∈ C, a i = 0 then (1 : ZMod p) else 0) =
      ∑ C ∈ J.powersetCard v,
        if ∑ i ∈ J, a i = 0 ∧ ∑ i ∈ C, a i = 0 then 1 else 0 := by
    apply Finset.sum_congr rfl
    intro C hC
    have hsum := sum_sdiff (mem_powersetCard.mp hC).1 (f := a)
    by_cases h : ∑ i ∈ C, a i = 0
    · simp only [h, add_zero] at hsum
      rw [hsum]
    · simp [h]
  rw [hright]
  by_cases h : ∑ i ∈ J, a i = 0 <;> simp [h, zeroCount]

private lemma count_balance {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (hp : 2 < p) (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (hs : s.card = 4 * p - 3)
    (hn : ∀ t ⊆ s, t.card = p → ∑ i ∈ t, a i ≠ 0) :
    zeroCount p a s (p - 1) = zeroCount p a s (3 * p - 1) := by
  have htwo : ∀ t ⊆ s, t.card = 3 * p - 2 ∨ t.card = 3 * p - 1 →
      zeroCount p a t (2 * p) = -1 := by
    intro t ht hcard
    have hc := count_small p hp a t hcard
    rw [zeroCount_eq_zero p a t p (fun u hu => hn u (hu.trans ht))] at hc
    linear_combination hc
  have hf := zero_flags p a s (p - 1) (2 * p)
  have he : p - 1 + 2 * p = 3 * p - 1 := by omega
  rw [he] at hf
  have hleft : (∑ A ∈ s.powersetCard (p - 1),
      if ∑ i ∈ A, a i = 0 then zeroCount p a (s \ A) (2 * p) else 0) =
      -zeroCount p a s (p - 1) := by
    rw [zeroCount, ← Finset.sum_neg_distrib]
    apply Finset.sum_congr rfl
    intro A hA
    have hc : (s \ A).card = 3 * p - 2 := by
      rw [card_sdiff_of_subset (mem_powersetCard.mp hA).1, hs, (mem_powersetCard.mp hA).2]
      omega
    rw [htwo (s \ A) sdiff_subset (Or.inl hc)]
    split_ifs <;> simp
  have hright : (∑ J ∈ s.powersetCard (3 * p - 1),
      if ∑ i ∈ J, a i = 0 then zeroCount p a J (2 * p) else 0) =
      -zeroCount p a s (3 * p - 1) := by
    rw [zeroCount, ← Finset.sum_neg_distrib]
    apply Finset.sum_congr rfl
    intro J hJ
    rw [htwo J (mem_powersetCard.mp hJ).1 (Or.inr (mem_powersetCard.mp hJ).2)]
    split_ifs <;> simp
  rw [hleft, hright] at hf
  exact neg_injective hf

private lemma choose_block (p : ℕ) [Fact p.Prime] (A B c : ℕ) (hc : c < p) :
    ((A * p + c).choose (B * p + c) : ZMod p) = (A.choose B : ZMod p) := by
  have h := Choose.choose_modEq_choose_mod_mul_choose_div_nat
    (p := p) (n := A * p + c) (k := B * p + c)
  have hz := (ZMod.natCast_eq_natCast_iff _ _ p).mpr h
  have hp : p ≠ 0 := (Fact.out : p.Prime).ne_zero
  have hdiv : ∀ D : ℕ, (D * p + c) / p = D := by
    intro D
    rw [Nat.add_comm, Nat.add_mul_div_right _ _ (Nat.pos_of_ne_zero hp),
      Nat.div_eq_of_lt hc, zero_add]
  simpa [Nat.add_mod, Nat.mod_eq_of_lt hc, hdiv] using hz

private lemma count_lifted {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (hp : 2 < p) (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (hs : s.card = 4 * p - 3) :
    3 - 2 * zeroCount p a s p - 2 * zeroCount p a s (p - 1) +
      zeroCount p a s (2 * p) + zeroCount p a s (2 * p - 1) = 0 := by
  have hsum : (∑ t ∈ s.powersetCard (3 * p - 3),
      (1 - zeroCount p a t p - zeroCount p a t (p - 1) +
        zeroCount p a t (2 * p) + zeroCount p a t (2 * p - 1))) = 0 := by
    apply Finset.sum_eq_zero
    intro t ht
    exact count_small_append p hp a t (mem_powersetCard.mp ht).2
  simp only [Finset.sum_add_distrib, Finset.sum_sub_distrib, Finset.sum_const,
    nsmul_eq_mul, mul_one, card_powersetCard] at hsum
  rw [zeroCount_lift p a s p (3 * p - 3) (by omega),
    zeroCount_lift p a s (p - 1) (3 * p - 3) (by omega),
    zeroCount_lift p a s (2 * p) (3 * p - 3) (by omega),
    zeroCount_lift p a s (2 * p - 1) (3 * p - 3) (by omega), hs] at hsum
  have h0 : ((4 * p - 3).choose (3 * p - 3) : ZMod p) = 3 := by
    have h := choose_block p 3 2 (p - 3) (by omega)
    have hN : 3 * p + (p - 3) = 4 * p - 3 := by omega
    have hL : 2 * p + (p - 3) = 3 * p - 3 := by omega
    simpa [hN, hL] using h
  have h1 : ((4 * p - 3 - p).choose (3 * p - 3 - p) : ZMod p) = 2 := by
    have h := choose_block p 2 1 (p - 3) (by omega)
    have hN : 2 * p + (p - 3) = 4 * p - 3 - p := by omega
    have hL : p + (p - 3) = 3 * p - 3 - p := by omega
    simpa [hN, hL] using h
  have h2 : ((4 * p - 3 - (p - 1)).choose (3 * p - 3 - (p - 1)) : ZMod p) = 2 := by
    have h := choose_block p 2 1 (p - 2) (by omega)
    have hN : 2 * p + (p - 2) = 4 * p - 3 - (p - 1) := by omega
    have hL : p + (p - 2) = 3 * p - 3 - (p - 1) := by omega
    simpa [hN, hL] using h
  have h3 : ((4 * p - 3 - 2 * p).choose (3 * p - 3 - 2 * p) : ZMod p) = 1 := by
    have h := choose_block p 1 0 (p - 3) (by omega)
    have hN : p + (p - 3) = 4 * p - 3 - 2 * p := by omega
    have hL : p - 3 = 3 * p - 3 - 2 * p := by omega
    simp only [one_mul, zero_mul, zero_add] at h
    rw [hN, hL] at h
    simpa using h
  have h4 : ((4 * p - 3 - (2 * p - 1)).choose (3 * p - 3 - (2 * p - 1)) : ZMod p) = 1 := by
    have h := choose_block p 1 0 (p - 2) (by omega)
    have hN : p + (p - 2) = 4 * p - 3 - (2 * p - 1) := by omega
    have hL : p - 2 = 3 * p - 3 - (2 * p - 1) := by omega
    simp only [one_mul, zero_mul, zero_add] at h
    rw [hN, hL] at h
    simpa using h
  simpa only [h0, h1, h2, h3, h4, one_mul] using hsum

private theorem kemnitz_odd_prime {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (hp : 2 < p) (a : ι → ZMod p × ZMod p) (s : Finset ι)
    (hs : s.card = 4 * p - 3) :
    ∃ t ⊆ s, t.card = p ∧ ∑ i ∈ t, a i = 0 := by
  by_contra! hn
  have hnp := zeroCount_eq_zero p a s p hn
  have hn3 := zeroCount_eq_zero p a s (3 * p) (no_three_p p hp a s hn)
  have hmaster := count_master p hp a s (by omega) (by omega)
  have hbal := count_balance p hp a s hs hn
  have hlift := count_lifted p hp a s hs
  let b : Option ι → ZMod p × ZMod p := fun i => i.elim 0 a
  let S := insert none (s.map Function.Embedding.some)
  have hcard : S.card = 4 * p - 2 := by simp [S, hs]; omega
  have hext := count_master p hp b S (by omega) (by omega)
  change 1 - zeroCount p b (insert none (s.map Function.Embedding.some)) p +
    zeroCount p b (insert none (s.map Function.Embedding.some)) (2 * p) -
    zeroCount p b (insert none (s.map Function.Embedding.some)) (3 * p) = 0 at hext
  rw [zeroCount_append p a s p (by omega), zeroCount_append p a s (2 * p) (by omega),
    zeroCount_append p a s (3 * p) (by omega)] at hext
  have habc : -zeroCount p a s (p - 1) + zeroCount p a s (2 * p - 1) -
      zeroCount p a s (3 * p - 1) = 0 := by linear_combination hext - hmaster
  rw [hnp, hn3] at hmaster
  rw [hnp] at hlift
  have htwo : (2 : ZMod p) = 0 := by linear_combination hlift - hmaster - habc + hbal
  have hdiv : p ∣ 2 := (ZMod.natCast_eq_zero_iff 2 p).mp (by simpa using htwo)
  exact (Nat.not_dvd_of_pos_of_lt (by omega : 0 < 2) hp) hdiv

private theorem kemnitz_two {ι : Type*} [DecidableEq ι]
    (a : ι → ZMod 2 × ZMod 2) (s : Finset ι) (hs : s.card = 5) :
    ∃ t ⊆ s, t.card = 2 ∧ ∑ i ∈ t, a i = 0 := by
  have hcard : (univ : Finset (ZMod 2 × ZMod 2)).card < s.card := by
    simp [hs, Fintype.card_prod, ZMod.card]
  obtain ⟨x, hx, y, hy, hxy, heq⟩ :=
    exists_ne_map_eq_of_card_lt_of_maps_to hcard (fun i hi => mem_univ (a i))
  refine ⟨{x, y}, ?_, by simp [hxy], ?_⟩
  · intro i hi
    simp only [mem_insert, mem_singleton] at hi
    rcases hi with rfl | rfl
    · exact hx
    · exact hy
  rw [sum_pair hxy, heq]
  apply Prod.ext <;> exact CharTwo.add_self_eq_zero _

private theorem kemnitz_prime {ι : Type*} [DecidableEq ι] (p : ℕ) [Fact p.Prime]
    (a : ι → ZMod p × ZMod p) (s : Finset ι) (hs : s.card = 4 * p - 3) :
    ∃ t ⊆ s, t.card = p ∧ ∑ i ∈ t, a i = 0 := by
  by_cases hp : p = 2
  · subst p
    exact kemnitz_two a s (by omega)
  · exact kemnitz_odd_prime p (by have := (Fact.out : p.Prime).two_le; omega) a s hs

private theorem kemnitz_int {ι : Type*} (n : ℕ) (a : ι → ℤ × ℤ) (s : Finset ι)
    (hs : 4 * n - 3 ≤ s.card) :
    ∃ t ⊆ s, t.card = n ∧ (n : ℤ) ∣ (∑ i ∈ t, (a i).1) ∧
      (n : ℤ) ∣ (∑ i ∈ t, (a i).2) := by
  classical
  induction n using Nat.prime_composite_induction generalizing ι with
  | zero => exact ⟨∅, by simp⟩
  | one =>
    obtain ⟨t, hts, ht⟩ := exists_subset_card_eq (show 1 ≤ s.card by omega)
    exact ⟨t, hts, ht, by simp, by simp⟩
  | prime p hp =>
    letI : Fact p.Prime := ⟨hp⟩
    obtain ⟨u, hus, hu⟩ := exists_subset_card_eq hs
    let b : ι → ZMod p × ZMod p := fun i => ((a i).1, (a i).2)
    obtain ⟨t, htu, ht, ht0⟩ := kemnitz_prime p b u hu
    refine ⟨t, htu.trans hus, ht, ?_, ?_⟩
    · apply (ZMod.intCast_zmod_eq_zero_iff_dvd _ p).mp
      have he := congrArg Prod.fst ht0
      simpa [b, Prod.fst_sum] using he
    · apply (ZMod.intCast_zmod_eq_zero_iff_dvd _ p).mp
      have he := congrArg Prod.snd ht0
      simpa [b, Prod.snd_sum] using he
  | composite m hm ihm n hn ihn =>
    suffices ∀ k ≤ 4 * m - 3, ∃ A : Finset (Finset ι), A.card = k ∧
        (A : Set (Finset ι)).Pairwise _root_.Disjoint ∧
        ∀ ⦃t⦄, t ∈ A → t ⊆ s ∧ t.card = n ∧
          (n : ℤ) ∣ (∑ i ∈ t, (a i).1) ∧ (n : ℤ) ∣ (∑ i ∈ t, (a i).2) by
      obtain ⟨A, hAc, hAd, hA⟩ := this _ le_rfl
      let b : Finset ι → ℤ × ℤ := fun t =>
        ((∑ i ∈ t, (a i).1) / n, (∑ i ∈ t, (a i).2) / n)
      obtain ⟨B, hBA, hBc, hB1, hB2⟩ := ihm b A hAc.ge
      refine ⟨B.biUnion (fun t => t), biUnion_subset.mpr (fun t ht => (hA (hBA ht)).1), ?_, ?_, ?_⟩
      · rw [card_biUnion (hAd.mono hBA),
          sum_const_nat (fun t ht => (hA (hBA ht)).2.1), hBc]
      · change (m : ℤ) ∣ ∑ t ∈ B, (∑ i ∈ t, (a i).1) / n at hB1
        rwa [sum_biUnion, Int.natCast_mul, mul_comm, ← Int.dvd_div_iff_mul_dvd,
          Int.sum_div]
        · exact fun t ht => (hA (hBA ht)).2.2.1
        · exact dvd_sum (fun t ht => (hA (hBA ht)).2.2.1)
        · exact hAd.mono hBA
      · change (m : ℤ) ∣ ∑ t ∈ B, (∑ i ∈ t, (a i).2) / n at hB2
        rwa [sum_biUnion, Int.natCast_mul, mul_comm, ← Int.dvd_div_iff_mul_dvd,
          Int.sum_div]
        · exact fun t ht => (hA (hBA ht)).2.2.2
        · exact dvd_sum (fun t ht => (hA (hBA ht)).2.2.2)
        · exact hAd.mono hBA
    intro k hk
    induction k with
    | zero => exact ⟨∅, by simp⟩
    | succ k ih =>
      obtain ⟨A, hAc, hAd, hA⟩ := ih (Nat.le_of_succ_le hk)
      have hremain : 4 * n - 3 ≤ (s \ A.biUnion id).card := by
        calc
          _ ≤ (4 * m - k) * n - 3 := by gcongr; omega
          _ = (4 * (m * n) - 3) - ∑ t ∈ A, t.card := by
            rw [tsub_mul, mul_assoc, tsub_right_comm,
              sum_const_nat (fun t ht => (hA ht).2.1), hAc]
          _ ≤ s.card - (A.biUnion id).card := by gcongr; exact card_biUnion_le
          _ ≤ (s \ A.biUnion id).card := le_card_sdiff ..
      obtain ⟨t, ht, htc, ht1, ht2⟩ := ihn a (s \ A.biUnion id) hremain
      have htA : t ∉ A := by
        intro h
        have hz : n = 0 := by
          simpa [← card_eq_zero, htc] using
            sdiff_disjoint.mono ht (subset_biUnion_of_mem id h)
        omega
      refine ⟨A.cons t htA, by rw [card_cons, hAc], ?_, ?_⟩
      · simp only [cons_eq_insert, coe_insert, Set.pairwise_insert_of_symm, mem_coe, ne_eq]
        exact ⟨hAd, fun u hu _ => sdiff_disjoint.mono ht (subset_biUnion_of_mem id hu)⟩
      · simp only [cons_eq_insert, mem_insert, forall_eq_or_imp, and_assoc]
        exact ⟨ht.trans sdiff_subset, htc, ht1, ht2, hA⟩

theorem problem8 (n : ℕ) (hn : 1 ≤ n)
    (f : Fin (4 * n - 3) → ZMod n × ZMod n) :
    ∃ s : Finset (Fin (4 * n - 3)),
      s.card = n ∧ ∑ i ∈ s, f i = 0 := by
  letI : NeZero n := ⟨by omega⟩
  let a : Fin (4 * n - 3) → ℤ × ℤ := fun i => ((f i).1.val, (f i).2.val)
  obtain ⟨s, hsu, hsc, hs1, hs2⟩ := kemnitz_int n a univ (by simp)
  refine ⟨s, hsc, Prod.ext ?_ ?_⟩
  · have he := (ZMod.intCast_zmod_eq_zero_iff_dvd (∑ i ∈ s, (a i).1) n).mpr hs1
    simpa [a, Prod.fst_sum] using he
  · have he := (ZMod.intCast_zmod_eq_zero_iff_dvd (∑ i ∈ s, (a i).2) n).mpr hs2
    simpa [a, Prod.snd_sum] using he
