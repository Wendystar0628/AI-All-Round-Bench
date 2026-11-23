import Mathlib.FieldTheory.ChevalleyWarning
import Mathlib.Data.Nat.Choose.Lucas
import Mathlib.Data.Finset.Powerset
import Mathlib.Combinatorics.Additive.ErdosGinzburgZiv
import Mathlib.Tactic.LinearCombination

open Finset MvPolynomial FiniteField

variable {ι : Type*} [DecidableEq ι]

private def p8_support {p : ℕ} (s : Finset ι) (x : s → ZMod p) : Finset ι :=
  (Finset.univ.filter fun i => x i ≠ 0).map ⟨Subtype.val, Subtype.val_injective⟩

private lemma p8_mem_support {p : ℕ} {s : Finset ι} {x : s → ZMod p} (i : s) :
    i.val ∈ p8_support s x ↔ x i ≠ 0 := by
  simp [p8_support]

private lemma p8_support_subset {p : ℕ} (s : Finset ι) (x : s → ZMod p) :
    p8_support s x ⊆ s := by
  intro i hi
  obtain ⟨a, ha, h⟩ := Finset.mem_map.mp hi
  exact h ▸ a.property

private noncomputable def p8_poly {p : ℕ} (s : Finset ι) (w : ι → ZMod p) :
    MvPolynomial s (ZMod p) :=
  ∑ i : s, w i • X i ^ (p - 1)

private lemma p8_eval {p : ℕ} [Fact p.Prime] (s : Finset ι) (x : s → ZMod p) (w : ι → ZMod p) :
    eval x (p8_poly s w) = ∑ i ∈ p8_support s x, w i := by
  classical
  simp [p8_poly, p8_support, sum_map, sum_filter, ZMod.pow_card_sub_one, mul_ite]

private lemma p8_fibre {p : ℕ} [Fact p.Prime] (s t : Finset ι) (ht : t ⊆ s) :
    ∑ x : s → ZMod p, (if p8_support s x = t then (1 : ZMod p) else 0) =
      (-1 : ZMod p) ^ t.card := by
  classical
  let a : s → ZMod p → ZMod p := fun i v => if (v ≠ 0 ↔ i.val ∈ t) then 1 else 0
  have he (x : s → ZMod p) : p8_support s x = t ↔ ∀ i : s, x i ≠ 0 ↔ i.val ∈ t := by
    constructor
    · intro h i
      rw [← p8_mem_support, h]
    · intro h
      ext i
      constructor
      · intro hi
        have his := p8_support_subset s x hi
        exact (h ⟨i, his⟩).mp ((p8_mem_support ⟨i, his⟩).mp hi)
      · intro hi
        exact (p8_mem_support ⟨i, ht hi⟩).mpr ((h ⟨i, ht hi⟩).mpr hi)
  have hf (x : s → ZMod p) :
      (if p8_support s x = t then (1 : ZMod p) else 0) = ∏ i : s, a i (x i) := by
    by_cases h : p8_support s x = t
    · rw [ite_eq_left h]
      exact (Finset.prod_eq_one fun i _ => ite_eq_left ((he x).mp h i)).symm
    · rw [ite_eq_right h]
      obtain ⟨i, hi⟩ := not_forall.mp (mt (he x).mpr h)
      exact (Finset.prod_eq_zero (Finset.mem_univ i) (ite_eq_right hi)).symm
  simp_rw [hf, ← Fintype.prod_sum]
  have hS (i : s) : (∑ v : ZMod p, a i v) = if i.val ∈ t then -1 else 1 := by
    by_cases h : i.val ∈ t
    · simp only [a, h, iff_true, ite_true]
      rw [Finset.sum_boole, show (Finset.univ.filter fun x : ZMod p => x ≠ 0) =
        Finset.univ.erase 0 by ext; simp]
      have hp : 1 ≤ p := (Fact.out : p.Prime).one_lt.le
      simp [Finset.card_erase_of_mem (Finset.mem_univ (0 : ZMod p)), ZMod.card, Nat.cast_sub hp]
    · simp [a, h]
  simp_rw [hS]
  rw [Finset.prod_ite, Finset.prod_const, Finset.prod_const, one_pow, mul_one]
  congr 1
  let e : s ↪ ι := ⟨Subtype.val, Subtype.val_injective⟩
  have hmap : (Finset.univ.filter fun i : s => i.val ∈ t).map e = t := by
    ext i
    constructor
    · intro hi
      obtain ⟨a, ha, he⟩ := Finset.mem_map.mp hi
      exact he ▸ (Finset.mem_filter.mp ha).2
    · intro hi
      exact Finset.mem_map.mpr ⟨⟨i, ht hi⟩, Finset.mem_filter.mpr ⟨Finset.mem_univ _, hi⟩, rfl⟩
  exact (Finset.card_map _).symm.trans (congrArg Finset.card hmap)

private lemma p8_warning {p : ℕ} [Fact p.Prime] (s : Finset ι) (f : ι → ZMod p × ZMod p)
    (hs : 3 * (p - 1) < s.card) :
    ∑ t ∈ s.powerset.filter (fun t => p ∣ t.card ∧ ∑ i ∈ t, f i = 0),
      (-1 : ZMod p) ^ t.card = 0 := by
  classical
  let w : Fin 3 → ι → ZMod p := ![fun _ => 1, fun i => (f i).1, fun i => (f i).2]
  let F := fun j => p8_poly s (w j)
  have hD (j : Fin 3) : (F j).totalDegree ≤ p - 1 := by
    apply totalDegree_finsetSum_le
    intro i hi
    exact (totalDegree_smul_le ..).trans (totalDegree_X_pow ..).le
  let P := fun t : Finset ι => p ∣ t.card ∧ ∑ i ∈ t, f i = 0
  have hsol (x : s → ZMod p) : (∀ j, eval x (F j) = 0) ↔ P (p8_support s x) := by
    simp [Fin.forall_fin_succ, F, p8_eval, w, P, Prod.ext_iff, Prod.fst_sum, Prod.snd_sum,
      ZMod.natCast_eq_zero_iff]
  let Z : MvPolynomial s (ZMod p) := ∏ j, (1 - F j ^ (p - 1))
  have hZ : Z.totalDegree < (Fintype.card (ZMod p) - 1) * Fintype.card ↥s := by
    rw [ZMod.card, Fintype.card_coe]
    refine (totalDegree_finsetProd _ _).trans_lt ?_
    have hD' (j : Fin 3) : (1 - F j ^ (p - 1)).totalDegree ≤ (p - 1) * (p - 1) :=
      (totalDegree_sub _ _).trans (by
        simpa using ((totalDegree_pow (F j) (p - 1)).trans (Nat.mul_le_mul_left (p - 1) (hD j))))
    refine (Finset.sum_le_sum fun j _ => hD' j).trans_lt ?_
    simp only [Finset.sum_const, Finset.card_univ, Fintype.card_fin, nsmul_eq_mul]
    have hpos : 0 < p - 1 := Nat.sub_pos_of_lt (Fact.out : p.Prime).one_lt
    change 3 * ((p - 1) * (p - 1)) < (p - 1) * s.card
    simpa only [mul_assoc, mul_left_comm, mul_comm] using Nat.mul_lt_mul_of_pos_left hs hpos
  have hZval (x : s → ZMod p) : eval x Z = if P (p8_support s x) then 1 else 0 := by
    change eval x (∏ j : Fin 3, (1 - F j ^ (p - 1))) = _
    rw [map_prod]
    simp only [map_sub, map_one, map_pow, ZMod.pow_card_sub_one]
    by_cases hx : P (p8_support s x)
    · rw [ite_eq_left hx]
      exact Finset.prod_eq_one fun j _ => by simp [(hsol x).mpr hx j]
    · rw [ite_eq_right hx]
      obtain ⟨j, hj⟩ := not_forall.mp (mt (hsol x).mp hx)
      exact Finset.prod_eq_zero (Finset.mem_univ j) (by simp [hj])
  have hzero := Z.sum_eval_eq_zero hZ
  simp_rw [hZval] at hzero
  let T := s.powerset.filter P
  have hcount (x : s → ZMod p) :
      (if P (p8_support s x) then 1 else (0 : ZMod p)) =
        ∑ t ∈ T, if p8_support s x = t then 1 else 0 := by
    simp [T, Finset.mem_powerset, p8_support_subset]
  have hzero' : (∑ x : s → ZMod p, ∑ t ∈ T, if p8_support s x = t then (1 : ZMod p) else 0) = 0 := by
    simpa only [← hcount] using hzero
  rw [Finset.sum_comm] at hzero'
  have he : (∑ t ∈ T, ∑ x : s → ZMod p, if p8_support s x = t then 1 else 0) =
     ∑ t ∈ T, (-1 : ZMod p) ^ t.card := by
    apply Finset.sum_congr rfl
    intro t ht
    exact p8_fibre s t (Finset.mem_powerset.mp (Finset.mem_filter.mp ht).1)
  rwa [he] at hzero'


private def p8_good {G : Type*} [AddCommMonoid G] [DecidableEq G]
    (s : Finset ι) (f : ι → G) (k : ℕ) : Finset (Finset ι) :=
  (s.powersetCard k).filter (fun t => ∑ x ∈ t, f x = 0)

private abbrev p8_count {G : Type*} [AddCommMonoid G] [DecidableEq G]
    (s : Finset ι) (f : ι → G) (k : ℕ) : ℕ := (p8_good s f k).card

private lemma p8_mem_good {G : Type*} [AddCommMonoid G] [DecidableEq G]
    {s t : Finset ι} {f : ι → G} {k : ℕ} :
    t ∈ p8_good s f k ↔ t ⊆ s ∧ t.card = k ∧ ∑ x ∈ t, f x = 0 := by
  simp [p8_good, and_assoc]

private lemma p8_count_zero {G : Type*} [AddCommMonoid G] [DecidableEq G]
    (s : Finset ι) (f : ι → G) : p8_count s f 0 = 1 := by
  have he : p8_good s f 0 = {∅} := by
    ext t
    simp only [p8_mem_good, Finset.mem_singleton, Finset.card_eq_zero]
    exact ⟨fun h => h.2.1, fun h => by subst t; simp⟩
  simp [p8_count, he]

private lemma p8_good_mono {G : Type*} [AddCommMonoid G] [DecidableEq G]
    {s t : Finset ι} (h : s ⊆ t) (f : ι → G) (k : ℕ) :
    p8_good s f k ⊆ p8_good t f k := by
  intro a ha
  obtain ⟨ha, hk, hsum⟩ := p8_mem_good.mp ha
  exact p8_mem_good.mpr ⟨ha.trans h, hk, hsum⟩

private lemma p8_warning_count {p : ℕ} [Fact p.Prime] (hodd : Odd p)
    (s : Finset ι) (f : ι → ZMod p × ZMod p) (d : ℕ)
    (hs : 3 * (p - 1) < s.card) (hd : s.card < d * p) :
    ∑ j ∈ Finset.range d, (-1 : ZMod p) ^ j * (p8_count s f (j*p) : ZMod p) = 0 := by
  classical
  have hp : 0 < p := (Fact.out : p.Prime).pos
  let T := s.powerset.filter (fun t => p ∣ t.card ∧ ∑ i ∈ t, f i = 0)
  have ht (t : Finset ι) (ht : t ∈ T) : t.card / p ∈ Finset.range d := by
    have ht' := Finset.card_le_card (Finset.mem_powerset.mp (Finset.mem_filter.mp ht).1)
    exact Finset.mem_range.mpr ((Nat.div_lt_iff_lt_mul hp).mpr (ht'.trans_lt hd))
  have he := Finset.sum_fiberwise_of_maps_to ht (fun t => (-1 : ZMod p) ^ t.card)
  rw [p8_warning s f hs] at he
  rw [← he]
  apply Finset.sum_congr rfl
  intro j hj
  have hjj : T.filter (fun t => t.card / p = j) = p8_good s f (j*p) := by
    ext t
    simp only [T, Finset.mem_filter, Finset.mem_powerset, p8_mem_good]
    constructor
    · rintro ⟨⟨ht, hdiv, hz⟩, h⟩
      exact ⟨ht, by rw [← h, Nat.div_mul_cancel hdiv], hz⟩
    · rintro ⟨ht, hc, hz⟩
      exact ⟨⟨ht, by rw [hc]; exact dvd_mul_left .., hz⟩, by rw [hc, Nat.mul_div_cancel _ hp]⟩
  rw [hjj]
  have heq : (∑ t ∈ p8_good s f (j*p), (-1 : ZMod p) ^ t.card) =
      ∑ _t ∈ p8_good s f (j*p), (-1 : ZMod p) ^ j := by
    apply Finset.sum_congr rfl
    intro t ht
    rw [(p8_mem_good.mp ht).2.1, Nat.mul_comm, pow_mul, hodd.neg_one_pow]
  rw [heq, Finset.sum_const, nsmul_eq_mul, mul_comm]

private lemma p8_append {G : Type*} [AddCommMonoid G] [DecidableEq G]
    (s : Finset ι) (f : ι → G) (k : ℕ) :
    p8_count s.insertNone (Option.elim' 0 f) (k+1) = p8_count s f (k+1) + p8_count s f k := by
  classical
  let e : Finset ι ↪ Finset (Option ι) :=
    ⟨fun t => t.map Function.Embedding.some, Finset.map_injective _⟩
  let e' : Finset ι ↪ Finset (Option ι) := (Finset.insertNone : Finset ι ↪o _).toEmbedding
  have he (t : Finset ι) : e t = t.map Function.Embedding.some := rfl
  have he' (t : Finset ι) : e' t = t.insertNone := rfl
  let A := (p8_good s f (k+1)).map e
  let B := (p8_good s f k).map e'
  have hdis : Disjoint A B := by
    apply Finset.disjoint_left.mpr
    intro t ht ht'
    obtain ⟨a, ha, rfl⟩ := Finset.mem_map.mp ht
    obtain ⟨b, hb, hh⟩ := Finset.mem_map.mp ht'
    have hnone := Finset.none_mem_insertNone (s := b)
    rw [← he' b, hh, he] at hnone
    simpa using hnone
  have hdec : p8_good s.insertNone (Option.elim' 0 f) (k+1) = A ∪ B := by
    ext t
    simp only [Finset.mem_union, p8_mem_good]
    constructor
    · rintro ⟨ht, hc, hsum⟩
      have hsub : t.eraseNone ⊆ s := by
        intro a ha
        exact Finset.some_mem_insertNone.mp (ht (Finset.mem_eraseNone.mp ha))
      have hsum' : ∑ x ∈ t.eraseNone, f x = 0 := (Finset.sum_eraseNone f t).trans hsum
      by_cases hnone : none ∈ t
      · right
        refine Finset.mem_map.mpr ⟨t.eraseNone, p8_mem_good.mpr ⟨hsub, ?_, hsum'⟩, ?_⟩
        · rw [Finset.card_eraseNone_of_mem hnone, hc]; omega
        · rw [he', Finset.insertNone_eraseNone, Finset.insert_eq_of_mem hnone]
      · left
        refine Finset.mem_map.mpr ⟨t.eraseNone, p8_mem_good.mpr ⟨hsub, ?_, hsum'⟩, ?_⟩
        · rwa [Finset.card_eraseNone_of_notMem hnone]
        · rw [he, Finset.map_some_eraseNone, Finset.erase_eq_of_notMem hnone]
    · rintro (ht | ht)
      · obtain ⟨a, ha, rfl⟩ := Finset.mem_map.mp ht
        obtain ⟨has, hc, hsum⟩ := p8_mem_good.mp ha
        refine ⟨?_, by simpa [he] using hc, ?_⟩
        · intro x hx
          obtain ⟨i, hi, rfl⟩ := Finset.mem_map.mp (he a ▸ hx)
          exact Finset.some_mem_insertNone.mpr (has hi)
        · simpa [he, Finset.sum_map] using hsum
      · obtain ⟨a, ha, rfl⟩ := Finset.mem_map.mp ht
        obtain ⟨has, hc, hsum⟩ := p8_mem_good.mp ha
        rw [he']
        exact ⟨Finset.insertNone.monotone has, by rw [Finset.card_insertNone, hc],
          by simpa using hsum⟩
  rw [p8_count, hdec, Finset.card_union_of_disjoint hdis]
  simp [A, B, p8_count]

private lemma p8_superset_count {G : Type*} [AddCommMonoid G] [DecidableEq G]
    (s : Finset ι) (f : ι → G) {k l : ℕ} (hkl : k ≤ l) :
    ∑ J ∈ s.powersetCard l, p8_count J f k =
      p8_count s f k * (s.card - k).choose (l - k) := by
  classical
  calc
    _ = ∑ J ∈ s.powersetCard l, ∑ t ∈ p8_good s f k, if t ⊆ J then 1 else 0 := by
      apply Finset.sum_congr rfl
      intro J hJ
      rw [Finset.sum_boole, p8_count]
      congr 1
      ext t
      simp only [p8_mem_good, Finset.mem_filter]
      exact ⟨fun ⟨h, hc, hz⟩ => ⟨⟨h.trans (Finset.mem_powersetCard.mp hJ).1, hc, hz⟩, h⟩,
        fun ⟨⟨_, hc, hz⟩, h⟩ => ⟨h, hc, hz⟩⟩
    _ = ∑ t ∈ p8_good s f k, ∑ J ∈ s.powersetCard l, if t ⊆ J then 1 else 0 := Finset.sum_comm
    _ = ∑ _t ∈ p8_good s f k, (s.card - k).choose (l - k) := by
      apply Finset.sum_congr rfl
      intro t ht
      obtain ⟨hts, htc, _⟩ := p8_mem_good.mp ht
      rw [Finset.sum_boole, Finset.card_filter_powersetCard_subset t s _ hts (by omega), htc]
      rfl
    _ = _ := by simp [p8_count]

private lemma p8_sub_sum {G : Type*} [AddCommGroup G] {s t : Finset ι}
    {f : ι → G} (ht : t ⊆ s) (hs : ∑ x ∈ s, f x = 0) (hz : ∑ x ∈ t, f x = 0) :
    ∑ x ∈ s \ t, f x = 0 := by
  have he := Finset.sum_sdiff (f := f) ht
  rw [hs, hz, add_zero] at he
  exact he

private lemma p8_double_count {G : Type*} [AddCommGroup G] [DecidableEq G]
    (s : Finset ι) (f : ι → G) (a b : ℕ) :
    ∑ t ∈ p8_good s f a, p8_count (s \ t) f b =
      ∑ y ∈ p8_good s f (a+b), p8_count y f b := by
  classical
  rw [← Finset.card_sigma, ← Finset.card_sigma]
  let A := (p8_good s f a).sigma (fun t => p8_good (s \ t) f b)
  let B := (p8_good s f (a+b)).sigma (fun y => p8_good y f b)
  change A.card = B.card
  have hA {t u : Finset ι} (h : (⟨t, u⟩ : Sigma fun _ : Finset ι => Finset ι) ∈ A) :=
    Finset.mem_sigma.mp h
  have hB {t u : Finset ι} (h : (⟨t, u⟩ : Sigma fun _ : Finset ι => Finset ι) ∈ B) :=
    Finset.mem_sigma.mp h
  have hdis {t u : Finset ι} (h : u ⊆ s \ t) : Disjoint t u :=
    (Finset.sdiff_disjoint.mono_left h).symm
  apply Finset.card_bij (fun x _ => ⟨x.1 ∪ x.2, x.2⟩)
  · rintro ⟨t,u⟩ h
    obtain ⟨ht, hc, hz⟩ := p8_mem_good.mp (hA h).1
    obtain ⟨hu, hcu, hzu⟩ := p8_mem_good.mp (hA h).2
    refine Finset.mem_sigma.mpr ⟨p8_mem_good.mpr ⟨
      Finset.union_subset ht (hu.trans Finset.sdiff_subset), ?_, ?_⟩,
      p8_mem_good.mpr ⟨Finset.subset_union_right, hcu, hzu⟩⟩
    · rw [Finset.card_union_of_disjoint (hdis hu), hc, hcu]
    · rw [Finset.sum_union (hdis hu), hz, hzu, add_zero]
  · rintro ⟨t,u⟩ ht ⟨v,w⟩ hv he
    have he₁ := congrArg (fun x : Sigma fun _ : Finset ι => Finset ι => x.1) he
    have he₂ := congrArg (fun x : Sigma fun _ : Finset ι => Finset ι => x.2) he
    change u = w at he₂
    subst w
    change t ∪ u = v ∪ u at he₁
    have hh := congrArg (fun x : Finset ι => x \ u) he₁
    rw [Finset.union_sdiff_cancel_right (hdis (p8_mem_good.mp (hA ht).2).1),
      Finset.union_sdiff_cancel_right (hdis (p8_mem_good.mp (hA hv).2).1)] at hh
    change t = v at hh
    subst v
    rfl
  · rintro ⟨y,u⟩ h
    obtain ⟨hy, hc, hz⟩ := p8_mem_good.mp (hB h).1
    obtain ⟨hu, hcu, hzu⟩ := p8_mem_good.mp (hB h).2
    refine ⟨⟨y \ u, u⟩, Finset.mem_sigma.mpr ⟨p8_mem_good.mpr ⟨
      Finset.sdiff_subset.trans hy, ?_, p8_sub_sum hu hz hzu⟩, p8_mem_good.mpr
      ⟨?_, hcu, hzu⟩⟩, ?_⟩
    · rw [Finset.card_sdiff_of_subset hu, hc, hcu, Nat.add_sub_cancel]
    · intro x hx
      exact Finset.mem_sdiff.mpr ⟨hy (hu hx), fun hh => (Finset.mem_sdiff.mp hh).2 hx⟩
    · change (⟨(y \ u) ∪ u, u⟩ : Sigma fun _ : Finset ι => Finset ι) = ⟨y, u⟩
      rw [Finset.sdiff_union_of_subset hu]


private lemma p8_low {p : ℕ} [Fact p.Prime] (hodd : Odd p)
    (s : Finset ι) (f : ι → ZMod p × ZMod p) (hs : 3*p - 2 ≤ s.card)
    (ht : s.card < 3*p) :
    1 - (p8_count s f p : ZMod p) + (p8_count s f (2*p) : ZMod p) = 0 := by
  have hp := (Fact.out : p.Prime).two_le
  have h := p8_warning_count hodd s f 3 (by omega) ht
  norm_num [Finset.sum_range_succ, p8_count_zero] at h
  linear_combination h

private lemma p8_high {p : ℕ} [Fact p.Prime] (hodd : Odd p)
    (s : Finset ι) (f : ι → ZMod p × ZMod p) (hs : 3*p - 2 ≤ s.card)
    (ht : s.card < 4*p) :
    1 - (p8_count s f p : ZMod p) + (p8_count s f (2*p) : ZMod p) -
      (p8_count s f (3*p) : ZMod p) = 0 := by
  have hp := (Fact.out : p.Prime).two_le
  have h := p8_warning_count hodd s f 4 (by omega) ht
  norm_num [Finset.sum_range_succ, p8_count_zero] at h
  linear_combination h

private lemma p8_small {p : ℕ} [Fact p.Prime] (hodd : Odd p)
    (s : Finset ι) (f : ι → ZMod p × ZMod p) (hs : s.card = 3*p - 3) :
    1 - (p8_count s f (p-1) : ZMod p) - (p8_count s f p : ZMod p) +
      (p8_count s f (2*p-1) : ZMod p) + (p8_count s f (2*p) : ZMod p) = 0 := by
  have hp := (Fact.out : p.Prime).two_le
  have h := p8_low hodd s.insertNone (Option.elim' 0 f) (by rw [Finset.card_insertNone]; omega)
    (by rw [Finset.card_insertNone]; omega)
  have h1 := p8_append s f (p-1)
  have h2 := p8_append s f (2*p-1)
  rw [show p-1+1=p by omega] at h1
  rw [show 2*p-1+1=2*p by omega] at h2
  rw [h1, h2, Nat.cast_add, Nat.cast_add] at h
  linear_combination h

private lemma p8_choose {p : ℕ} [Fact p.Prime] (N : ℕ) :
    (N.choose p : ZMod p) = (N / p : ℕ) := by
  have hp := (Fact.out : p.Prime).pos
  have h := Choose.choose_modEq_choose_mod_mul_choose_div_nat (n := N) (k := p) (p := p)
  have he := (ZMod.natCast_eq_natCast_iff _ _ p).mpr h
  simpa [Nat.div_self hp] using he

private lemma p8_sum_small {p : ℕ} [Fact p.Prime] (hodd : Odd p) (hp : 3 ≤ p)
    (s : Finset ι) (f : ι → ZMod p × ZMod p) (hs : s.card = 4*p - 3) :
    3 - 2 * (p8_count s f (p-1) : ZMod p) - 2 * (p8_count s f p : ZMod p) +
      (p8_count s f (2*p-1) : ZMod p) + (p8_count s f (2*p) : ZMod p) = 0 := by
  classical
  let L := 3*p - 3
  have h := Finset.sum_eq_zero (s := s.powersetCard L) (f := fun J =>
    1 - (p8_count J f (p-1) : ZMod p) - (p8_count J f p : ZMod p) +
      (p8_count J f (2*p-1) : ZMod p) + (p8_count J f (2*p) : ZMod p))
    (fun J hJ => p8_small hodd J f (Finset.mem_powersetCard.mp hJ).2)
  have hcoeff (k : ℕ) (hk : k ≤ L) :
      ∑ J ∈ s.powersetCard L, (p8_count J f k : ZMod p) =
        (p8_count s f k : ZMod p) * ((s.card-k)/p : ℕ) := by
    rw [← Nat.cast_sum, p8_superset_count s f hk, Nat.cast_mul]
    congr 1
    rw [← Nat.choose_symm (by omega : L-k ≤ s.card-k)]
    have he : s.card - k - (L-k) = p := by dsimp [L] at hk ⊢; omega
    rw [he, p8_choose]
  have hc : (s.card.choose L : ZMod p) = 3 := by
    rw [← Nat.choose_symm (by dsimp [L]; omega : L ≤ s.card)]
    rw [show s.card - L = p by dsimp [L]; omega, p8_choose]
    have he : s.card / p = 3 := by
      apply Nat.le_antisymm
      · apply Nat.le_of_lt_succ
        exact (Nat.div_lt_iff_lt_mul (by omega : 0 < p)).mpr (by omega)
      · exact (Nat.le_div_iff_mul_le (by omega : 0 < p)).mpr (by omega)
    simp [he]
  have hdiv (k q : ℕ) (h₁ : q * p ≤ s.card - k) (h₂ : s.card - k < (q+1)*p) :
      (s.card - k) / p = q := by
    exact Nat.le_antisymm (Nat.le_of_lt_succ ((Nat.div_lt_iff_lt_mul (by omega)).mpr h₂))
      ((Nat.le_div_iff_mul_le (by omega)).mpr h₁)
  simp only [Finset.sum_add_distrib, Finset.sum_sub_distrib, Finset.sum_const, nsmul_one,
    Finset.card_powersetCard] at h
  rw [hc, hcoeff (p-1) (by dsimp [L]; omega), hcoeff p (by dsimp [L]; omega),
    hcoeff (2*p-1) (by dsimp [L]; omega), hcoeff (2*p) (by dsimp [L]; omega),
    hdiv (p-1) 2 (by omega) (by omega), hdiv p 2 (by omega) (by omega),
    hdiv (2*p-1) 1 (by omega) (by omega), hdiv (2*p) 1 (by omega) (by omega)] at h
  push_cast at h
  linear_combination h

private lemma p8_prime_odd {p : ℕ} [Fact p.Prime] (hodd : Odd p) (hp : 3 ≤ p)
    (s : Finset ι) (f : ι → ZMod p × ZMod p) (hs : s.card = 4*p - 3) :
    ∃ t ⊆ s, t.card = p ∧ ∑ i ∈ t, f i = 0 := by
  classical
  by_contra hn
  have hnp {J : Finset ι} (hJ : J ⊆ s) : p8_count J f p = 0 := by
    apply Finset.card_eq_zero.mpr
    apply Finset.eq_empty_iff_forall_notMem.mpr
    intro t ht
    obtain ⟨htj, htc, htz⟩ := p8_mem_good.mp ht
    exact hn ⟨t, htj.trans hJ, htc, htz⟩
  have h3 : p8_count s f (3*p) = 0 := by
    apply Finset.card_eq_zero.mpr
    apply Finset.eq_empty_iff_forall_notMem.mpr
    intro t ht
    obtain ⟨hts, htc, htz⟩ := p8_mem_good.mp ht
    obtain ⟨x, hx⟩ := Finset.card_pos.mp (show 0 < t.card by omega)
    let J := t.erase x
    have hJ : J ⊆ t := Finset.erase_subset .. 
    have hJc : J.card = 3*p - 1 := by rw [Finset.card_erase_of_mem hx, htc]
    have hh := p8_low hodd J f (by omega) (by omega)
    rw [hnp (hJ.trans hts), Nat.cast_zero, sub_zero] at hh
    have hpos : 0 < p8_count J f (2*p) := by
      by_contra! H
      rw [Nat.eq_zero_of_le_zero H, Nat.cast_zero, add_zero] at hh
      exact one_ne_zero hh
    obtain ⟨u, hu⟩ := Finset.card_pos.mp hpos
    obtain ⟨huJ, huc, huz⟩ := p8_mem_good.mp hu
    have hut := huJ.trans hJ
    apply hn
    exact ⟨t \ u, Finset.sdiff_subset.trans hts, by
      rw [Finset.card_sdiff_of_subset hut, htc, huc]; omega, p8_sub_sum hut htz huz⟩
  have h4 := p8_high hodd s f (by omega) (by omega)
  rw [hnp Subset.rfl, h3, Nat.cast_zero, sub_zero, sub_zero] at h4
  have hrel : (p8_count s f (p-1) : ZMod p) - (p8_count s f (2*p-1) : ZMod p) +
      (p8_count s f (3*p-1) : ZMod p) = 0 := by
    have hh := p8_high hodd s.insertNone (Option.elim' 0 f)
      (by rw [Finset.card_insertNone]; omega) (by rw [Finset.card_insertNone]; omega)
    have h1 := p8_append s f (p-1)
    have h2 := p8_append s f (2*p-1)
    have h3' := p8_append s f (3*p-1)
    rw [show p-1+1=p by omega] at h1
    rw [show 2*p-1+1=2*p by omega] at h2
    rw [show 3*p-1+1=3*p by omega] at h3'
    rw [h1, h2, h3', hnp Subset.rfl, h3] at hh
    push_cast at hh
    linear_combination h4 - hh
  have hdbl : -(p8_count s f (p-1) : ZMod p) = -(p8_count s f (3*p-1) : ZMod p) := by
    have h := congrArg (fun n : ℕ => (n : ZMod p)) (p8_double_count s f (p-1) (2*p))
    simp only [Nat.cast_sum] at h
    rw [show p-1+2*p=3*p-1 by omega] at h
    have hval (J : Finset ι) (hJ : J ⊆ s) (hc : 3*p-2 ≤ J.card) (hc' : J.card < 3*p) :
        (p8_count J f (2*p) : ZMod p) = -1 := by
      have hh := p8_low hodd J f hc hc'
      rw [hnp hJ, Nat.cast_zero, sub_zero] at hh
      linear_combination hh
    have hleft : ∑ t ∈ p8_good s f (p-1), (p8_count (s \ t) f (2*p) : ZMod p) =
        ∑ _t ∈ p8_good s f (p-1), (-1 : ZMod p) := by
      apply Finset.sum_congr rfl
      intro t ht
      obtain ⟨hts, htc, _⟩ := p8_mem_good.mp ht
      exact hval _ Finset.sdiff_subset (by rw [Finset.card_sdiff_of_subset hts]; omega)
        (by rw [Finset.card_sdiff_of_subset hts]; omega)
    have hright : ∑ t ∈ p8_good s f (3*p-1), (p8_count t f (2*p) : ZMod p) =
        ∑ _t ∈ p8_good s f (3*p-1), (-1 : ZMod p) := by
      apply Finset.sum_congr rfl
      intro t ht
      obtain ⟨hts, htc, _⟩ := p8_mem_good.mp ht
      exact hval _ hts (by omega) (by omega)
    rw [hleft, hright] at h
    simpa [Finset.sum_const, nsmul_eq_mul, p8_count] using h
  have hsum := p8_sum_small hodd hp s f hs
  rw [hnp Subset.rfl, Nat.cast_zero, mul_zero, sub_zero] at hsum
  have htwo : (2 : ZMod p) = 0 := by linear_combination hsum + hrel - hdbl - h4
  rw [← Nat.cast_two, ZMod.natCast_eq_zero_iff] at htwo
  exact Nat.not_dvd_of_pos_of_lt (by decide) (by omega) htwo


private lemma p8_prime {p : ℕ} (hp : p.Prime) (s : Finset ι) (f : ι → ZMod p × ZMod p)
    (hs : s.card = 4*p - 3) :
    ∃ t ⊆ s, t.card = p ∧ ∑ i ∈ t, f i = 0 := by
  classical
  rcases hp.eq_two_or_odd' with h | h
  · subst p
    have hc : Fintype.card (ZMod 2 × ZMod 2) < s.card := by
      norm_num [Fintype.card_prod, ZMod.card, hs]
    obtain ⟨i, hi, j, hj, hij, he⟩ := Finset.exists_ne_map_eq_of_card_lt_of_maps_to
      (t := Finset.univ) (by simpa using hc) (f := f) (fun _ _ => Finset.mem_univ _)
    refine ⟨{i,j}, Finset.insert_subset_iff.mpr ⟨hi, Finset.singleton_subset_iff.mpr hj⟩,
      by simp [hij], ?_⟩
    rw [Finset.sum_insert (by simpa using hij), Finset.sum_singleton, he]
    have hz (x : ZMod 2) : x + x = 0 := by
      rw [← two_mul, show (2 : ZMod 2) = 0 by decide, zero_mul]
    exact Prod.ext (hz (f j).1) (hz (f j).2)
  · letI : Fact p.Prime := ⟨hp⟩
    have h2 : p ≠ 2 := by
      intro he
      subst p
      obtain ⟨k, hk⟩ := h
      omega
    exact p8_prime_odd h (by have := hp.two_le; omega) s f hs

private lemma p8_cast_sum {n : ℕ} (s : Finset ι) (a : ι → ℤ × ℤ) :
    (∑ i ∈ s, ((((a i).1 : ℤ) : ZMod n), (((a i).2 : ℤ) : ZMod n))) = 0 ↔
      (n : ℤ) ∣ (∑ i ∈ s, (a i).1) ∧ (n : ℤ) ∣ (∑ i ∈ s, (a i).2) := by
  rw [Prod.ext_iff]
  simp only [Prod.fst_sum, Prod.snd_sum, Prod.fst_zero, Prod.snd_zero,
    ← Int.cast_sum, ZMod.intCast_zmod_eq_zero_iff_dvd]

private lemma p8_supply (m n k N : ℕ) (hk : k+1 ≤ 4*m - 3)
    (hs : 4*(m*n) - 3 ≤ N) : 4*n - 3 ≤ N - k*n := by
  have hle := Nat.mul_le_mul_right n (show k+4 ≤ 4*m by omega)
  simp only [Nat.add_mul, Nat.mul_assoc] at hle
  omega

private lemma p8_int (n : ℕ) (s : Finset ι) (a : ι → ℤ × ℤ) (hs : 4*n - 3 ≤ s.card) :
    ∃ t ⊆ s, t.card = n ∧
      (n : ℤ) ∣ (∑ i ∈ t, (a i).1) ∧ (n : ℤ) ∣ (∑ i ∈ t, (a i).2) := by
  classical
  induction n using Nat.prime_composite_induction generalizing ι with
  | zero => exact ⟨∅, by simp⟩
  | one => simpa using Finset.exists_subset_card_eq hs
  | prime p hp =>
    obtain ⟨t, hts, htc⟩ := Finset.exists_subset_card_eq hs
    obtain ⟨u, hut, huc, huz⟩ :=
      p8_prime hp t (fun i => ((a i).1, (a i).2)) htc
    exact ⟨u, hut.trans hts, huc, (p8_cast_sum u a).mp huz⟩
  | composite m hm ihm n hn ihn =>
    suffices ∀ k ≤ 4*m - 3, ∃ A : Finset (Finset ι), A.card = k ∧
      (↑A : Set (Finset ι)).PairwiseDisjoint id ∧
      ∀ t ∈ A, t ⊆ s ∧ t.card = n ∧
        (n : ℤ) ∣ (∑ i ∈ t, (a i).1) ∧ (n : ℤ) ∣ (∑ i ∈ t, (a i).2) by
      obtain ⟨A, hc, hd, hA⟩ := this _ le_rfl
      obtain ⟨B, hB, hBc, hB₁, hB₂⟩ := ihm A
        (fun t => ((∑ i ∈ t, (a i).1) / (n : ℤ), (∑ i ∈ t, (a i).2) / (n : ℤ))) hc.ge
      have hdis : (↑B : Set (Finset ι)).PairwiseDisjoint id :=
        Set.Pairwise.mono hB hd
      refine ⟨B.biUnion id, Finset.biUnion_subset.mpr (fun t ht => (hA t (hB ht)).1), ?_, ?_⟩
      · rw [Finset.card_biUnion hdis]
        change (∑ t ∈ B, t.card) = _
        rw [sum_const_nat (fun t ht => (hA t (hB ht)).2.1), hBc]
      · have hsum (f : ι → ℤ) (h₁ : ∀ t ∈ B, (n : ℤ) ∣ ∑ i ∈ t, f i)
            (h₂ : (m : ℤ) ∣ ∑ t ∈ B, (∑ i ∈ t, f i) / (n : ℤ)) :
            ((m*n : ℕ) : ℤ) ∣ ∑ i ∈ B.biUnion id, f i := by
          rw [Finset.sum_biUnion hdis, Int.natCast_mul, mul_comm, ← Int.dvd_div_iff_mul_dvd,
            Int.sum_div]
          · exact h₂
          · exact h₁
          · exact Finset.dvd_sum h₁
        exact ⟨hsum _ (fun t ht => (hA t (hB ht)).2.2.1) hB₁,
          hsum _ (fun t ht => (hA t (hB ht)).2.2.2) hB₂⟩
    intro k hk
    induction k with
    | zero => exact ⟨∅, by simp⟩
    | succ k ih =>
      obtain ⟨A, hc, hd, hA⟩ := ih (by omega)
      have hAs : A.biUnion id ⊆ s :=
        Finset.biUnion_subset.mpr (fun t ht => (hA t ht).1)
      have hsz : (A.biUnion id).card = k*n := by
        rw [Finset.card_biUnion hd]
        change (∑ t ∈ A, t.card) = _
        rw [sum_const_nat (fun t ht => (hA t ht).2.1), hc]
      have hsize : 4*n - 3 ≤ (s \ A.biUnion id).card := by
        rw [Finset.card_sdiff_of_subset hAs, hsz]
        exact p8_supply m n k _ hk hs
      obtain ⟨t, ht, htc, ht₁, ht₂⟩ := ihn (s \ A.biUnion id) a hsize
      have hdis (u : Finset ι) (hu : u ∈ A) : Disjoint t u :=
        Finset.sdiff_disjoint.mono ht (Finset.subset_biUnion_of_mem id hu)
      have hnew : t ∉ A := by
        intro H
        have hh := disjoint_self.mp (hdis t H)
        simp [hh] at htc
        omega
      refine ⟨insert t A, by rw [Finset.card_insert_of_notMem hnew, hc], ?_, ?_⟩
      · rw [Finset.coe_insert]
        exact hd.insert_of_notMem hnew (fun u hu => hdis u hu)
      · intro u hu
        rcases Finset.mem_insert.mp hu with rfl | hu
        · exact ⟨ht.trans Finset.sdiff_subset, htc, ht₁, ht₂⟩
        · exact hA u hu

theorem problem8 (n : ℕ) (hn : 1 ≤ n)
    (f : Fin (4 * n - 3) → ZMod n × ZMod n) :
    ∃ s : Finset (Fin (4 * n - 3)),
      s.card = n ∧ ∑ i ∈ s, f i = 0 := by
  haveI : NeZero n := ⟨by omega⟩
  let a : Fin (4*n-3) → ℤ × ℤ := fun i => ((f i).1.val, (f i).2.val)
  obtain ⟨s, _, hs, hs₁, hs₂⟩ := p8_int n Finset.univ a (by simp)
  refine ⟨s, hs, ?_⟩
  have hh := (p8_cast_sum (n := n) s a).mpr ⟨hs₁, hs₂⟩
  simpa [a, ZMod.natCast_zmod_val, Prod.mk.eta] using hh

#print axioms problem8
