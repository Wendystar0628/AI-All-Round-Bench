import Mathlib.Combinatorics.Additive.ErdosGinzburgZiv
import Mathlib.FieldTheory.ChevalleyWarning
import Mathlib.Tactic

open scoped BigOperators
open Finset MvPolynomial

namespace Problem8

section Support

variable {ι K : Type*} [Fintype ι] [DecidableEq ι]
    [Field K] [Fintype K] [DecidableEq K]

private def support (x : ι → K) : Finset ι :=
  Finset.univ.filter fun i => x i ≠ 0

private noncomputable def supportFiberEquiv (t : Finset ι) :
    {x : ι → K // support x = t} ≃ (t → Kˣ) where
  toFun x i := Units.mk0 (x.1 i) <| by
    have hi : i.1 ∈ support x.1 := by rw [x.2]; exact i.2
    exact (Finset.mem_filter.1 hi).2
  invFun u :=
    ⟨fun i => if h : i ∈ t then (u ⟨i, h⟩ : K) else 0, by
      ext i
      simp only [support, Finset.mem_filter, Finset.mem_univ, true_and]
      by_cases h : i ∈ t
      · simp [h, Units.ne_zero]
      · simp [h]⟩
  left_inv x := by
    apply Subtype.ext
    funext i
    by_cases h : i ∈ t
    · simp [h]
    · have hi : x.1 i = 0 := by
        by_contra hi
        have : i ∈ support x.1 := Finset.mem_filter.2 ⟨Finset.mem_univ _, hi⟩
        rw [x.2] at this
        exact h this
      simp [h, hi]
  right_inv u := by
    funext i
    apply Units.ext
    simp [i.2]

private noncomputable def supportEquiv :
    (ι → K) ≃ Σ t : Finset ι, t → Kˣ :=
  (Equiv.sigmaFiberEquiv support).symm.trans
    (Equiv.sigmaCongrRight supportFiberEquiv)

private lemma card_support_fiber (t : Finset ι) :
    Fintype.card (t → Kˣ) = (Fintype.card K - 1) ^ t.card := by
  rw [Fintype.card_fun, Fintype.card_units, Fintype.card_coe]

private noncomputable def goodSupportEquiv (P : Finset ι → Prop) [DecidablePred P] :
    (Σ t : {t : Finset ι // P t}, t.1 → Kˣ) ≃
      {x : ι → K // P (support x)} :=
  (Equiv.sigmaCongrRight fun t : {t : Finset ι // P t} =>
    (supportFiberEquiv (K := K) t.1).symm).trans
      (Equiv.sigmaSubtypeFiberEquivSubtype support fun _ => Iff.rfl)

end Support

section ChevalleyWarning

variable {p : ℕ} [Fact p.Prime] {ι : Type*} [Fintype ι] [DecidableEq ι]

private noncomputable def cardPoly (c : ZMod p) : MvPolynomial ι (ZMod p) :=
  (∑ i, X i ^ (p - 1)) - C c

private noncomputable def coordPoly (a : ι → ZMod p) : MvPolynomial ι (ZMod p) :=
  ∑ i, a i • X i ^ (p - 1)

private lemma totalDegree_cardPoly_le (c : ZMod p) :
    (cardPoly (ι := ι) c).totalDegree ≤ p - 1 := by
  apply (totalDegree_sub _ _).trans
  rw [max_le_iff]
  constructor
  · apply totalDegree_finsetSum_le
    intro i _
    exact (totalDegree_X_pow i _).le
  · simp

private lemma totalDegree_coordPoly_le (a : ι → ZMod p) :
    (coordPoly a).totalDegree ≤ p - 1 := by
  apply totalDegree_finsetSum_le
  intro i _
  exact (totalDegree_smul_le _ _).trans (totalDegree_X_pow i _).le

private lemma eval_cardPoly (c : ZMod p) (x : ι → ZMod p) :
    eval x (cardPoly c) = ((support x).card : ZMod p) - c := by
  simp only [cardPoly, map_sub, map_sum, eval_X, map_pow, eval_C,
    ZMod.pow_card_sub_one]
  congr 1
  simpa [support] using
    (Finset.sum_boole (R := ZMod p) (fun i => x i ≠ 0) Finset.univ)

private lemma eval_coordPoly (a : ι → ZMod p) (x : ι → ZMod p) :
    eval x (coordPoly a) = ∑ i ∈ support x, a i := by
  simp [coordPoly, ZMod.pow_card_sub_one, support, Finset.sum_filter]

private def Good (a b : ι → ZMod p) (c : ZMod p) (t : Finset ι) : Prop :=
  (t.card : ZMod p) = c ∧ (∑ i ∈ t, a i) = 0 ∧ (∑ i ∈ t, b i) = 0

private noncomputable instance instDecidableGood (a b : ι → ZMod p) (c : ZMod p) :
    DecidablePred (Good a b c) := Classical.decPred _

private lemma chevalleyWarning_support_sum (a b : ι → ZMod p) (c : ZMod p)
    (hcard : 3 * (p - 1) < Fintype.card ι) :
    (∑ t : {t : Finset ι // Good a b c t},
      (-1 : ZMod p) ^ t.1.card) = 0 := by
  classical
  let f : Fin 3 → MvPolynomial ι (ZMod p) :=
    ![cardPoly c, coordPoly a, coordPoly b]
  have hdeg : (∑ j, (f j).totalDegree) < Fintype.card ι := by
    calc
      (∑ j, (f j).totalDegree) ≤ ∑ _j : Fin 3, (p - 1) := by
        apply Finset.sum_le_sum
        intro j _
        fin_cases j
        · exact totalDegree_cardPoly_le c
        · exact totalDegree_coordPoly_le a
        · exact totalDegree_coordPoly_le b
      _ = 3 * (p - 1) := by simp
      _ < Fintype.card ι := hcard
  have hdvd := char_dvd_card_solutions_of_fintype_sum_lt p hdeg
  have hdvd' : p ∣ Nat.card {x : ι → ZMod p // ∀ j : Fin 3,
      eval x (f j) = 0} := by
    simpa only [← Nat.card_eq_fintype_card] using hdvd
  let T := {x : ι → ZMod p // Good a b c (support x)}
  have hRT : Fintype.card {x : ι → ZMod p // ∀ j : Fin 3,
      eval x (f j) = 0} = Fintype.card T := by
    apply Fintype.card_congr
    apply Equiv.subtypeEquivRight
    intro x
    constructor
    · intro hx
      have h0 : (support x).card = c := by
        exact sub_eq_zero.mp (by simpa [f, eval_cardPoly] using hx 0)
      have h1 : (∑ i ∈ support x, a i) = 0 := by
        simpa [f, eval_coordPoly] using hx 1
      have h2 : (∑ i ∈ support x, b i) = 0 := by
        simpa [f, eval_coordPoly] using hx 2
      exact ⟨h0, h1, h2⟩
    · rintro ⟨h0, h1, h2⟩ j
      fin_cases j
      · simpa [f, eval_cardPoly] using sub_eq_zero.mpr h0
      · simpa [f, eval_coordPoly] using h1
      · simpa [f, eval_coordPoly] using h2
  have hroot : (Fintype.card {x : ι → ZMod p // ∀ j : Fin 3,
      eval x (f j) = 0} : ZMod p) = 0 := by
    rw [CharP.cast_eq_zero_iff (ZMod p)]
    rw [← Nat.card_eq_fintype_card]
    exact hdvd'
  have hT : (Fintype.card T : ZMod p) = 0 := by
    rw [← hRT]
    exact hroot
  have hcardT : Fintype.card T =
      ∑ t : {t : Finset ι // Good a b c t}, (p - 1) ^ t.1.card := by
    rw [← Fintype.card_congr (goodSupportEquiv (K := ZMod p) (Good a b c)),
      Fintype.card_sigma]
    apply Finset.sum_congr rfl
    intro t _
    simpa [ZMod.card] using card_support_fiber (K := ZMod p) t.1
  have hpcast : ((p - 1 : ℕ) : ZMod p) = -1 := by
    rw [Nat.cast_sub ((Fact.out : p.Prime).one_le), Nat.cast_one]
    simp
  rw [hcardT, Nat.cast_sum] at hT
  have hsubtype : (∑ t : {t : Finset ι // Good a b c t},
      (-1 : ZMod p) ^ t.1.card) = 0 := by
    simpa [Nat.cast_pow, hpcast] using hT
  exact hsubtype

private def cardIndex (t : Finset ι) : Fin (Fintype.card ι + 1) :=
  ⟨t.card, Nat.lt_succ_of_le (Finset.card_le_univ t)⟩

private noncomputable def zeroCount (a b : ι → ZMod p) (c : ZMod p)
    (k : Fin (Fintype.card ι + 1)) : ℕ :=
  Nat.card {t : {t : Finset ι // Good a b c t} // t.1.card = k.1}

private lemma chevalleyWarning_count_relation (a b : ι → ZMod p) (c : ZMod p)
    (hcard : 3 * (p - 1) < Fintype.card ι) :
    (∑ k : Fin (Fintype.card ι + 1),
      (-1 : ZMod p) ^ k.1 * zeroCount a b c k) = 0 := by
  classical
  rw [← chevalleyWarning_support_sum a b c hcard]
  rw [← Fintype.sum_fiberwise (fun t : {t : Finset ι // Good a b c t} =>
    cardIndex t.1) (fun t => (-1 : ZMod p) ^ t.1.card)]
  apply Finset.sum_congr rfl
  intro k _
  have hconst : (∑ t : {t : {t : Finset ι // Good a b c t} //
      cardIndex t.1 = k}, (-1 : ZMod p) ^ t.1.1.card) =
      Fintype.card {t : {t : Finset ι // Good a b c t} //
        cardIndex t.1 = k} • ((-1 : ZMod p) ^ k.1) := by
    calc
      _ = ∑ _t : {t : {t : Finset ι // Good a b c t} //
          cardIndex t.1 = k}, (-1 : ZMod p) ^ k.1 := by
        apply Fintype.sum_congr
        intro t
        congr 1
        exact congrArg Fin.val t.2
      _ = _ := by simp
  rw [hconst, nsmul_eq_mul, mul_comm]
  congr 2
  rw [zeroCount, Nat.card_eq_fintype_card]
  apply Fintype.card_congr
  apply Equiv.subtypeEquivRight
  intro t
  constructor
  · intro h
    apply Fin.ext
    exact h
  · intro h
    exact congrArg Fin.val h

private def ZeroSumCard (a b : ι → ZMod p) (k : ℕ) (t : Finset ι) : Prop :=
  t.card = k ∧ (∑ i ∈ t, a i) = 0 ∧ (∑ i ∈ t, b i) = 0

private noncomputable def zcount (a b : ι → ZMod p) (k : ℕ) : ℕ :=
  Nat.card {t : Finset ι // ZeroSumCard a b k t}

private lemma zeroCount_eq_zcount (a b : ι → ZMod p) (c : ZMod p)
    (k : Fin (Fintype.card ι + 1)) (hk : (k.1 : ZMod p) = c) :
    zeroCount a b c k = zcount a b k.1 := by
  classical
  rw [zeroCount, zcount]
  apply Nat.card_congr
  exact
    { toFun := fun t => ⟨t.1.1, t.2, t.1.2.2⟩
      invFun := fun t =>
        ⟨⟨t.1, by
            refine ⟨?_, t.2.2⟩
            simpa [t.2.1] using hk⟩, t.2.1⟩
      left_inv := fun t => by ext; rfl
      right_inv := fun t => by ext; rfl }

private lemma zeroCount_eq_zero_of_not_candidate (a b : ι → ZMod p) (c : ZMod p)
    (k : Fin (Fintype.card ι + 1))
    (h : ∀ t : Finset ι, Good a b c t → t.card = k.1 → False) :
    zeroCount a b c k = 0 := by
  rw [zeroCount, Nat.card_eq_fintype_card, Fintype.card_eq_zero_iff]
  exact ⟨fun t => h t.1 t.1.2 t.2⟩

private lemma card_cases_zero (hp : 2 < p) {N : ℕ} (hN : N < 4 * p)
    (k : Fin (N + 1)) (hk : (k.1 : ZMod p) = 0) :
    k.1 = 0 ∨ k.1 = p ∨ k.1 = 2 * p ∨ k.1 = 3 * p := by
  rw [CharP.cast_eq_zero_iff (ZMod p)] at hk
  obtain ⟨d, hd⟩ := hk
  have hkle : k.1 ≤ N := Nat.le_of_lt_succ k.2
  have hdlt : d < 4 := by
    nlinarith
  interval_cases d <;> omega

private lemma card_cases_neg_one (hp : 2 < p) {N : ℕ} (hN : N < 4 * p - 1)
    (k : Fin (N + 1)) (hk : (k.1 : ZMod p) = -1) :
    k.1 = p - 1 ∨ k.1 = 2 * p - 1 ∨ k.1 = 3 * p - 1 := by
  have hk' : ((k.1 + 1 : ℕ) : ZMod p) = 0 := by
    rw [Nat.cast_add, hk]
    simp
  rw [CharP.cast_eq_zero_iff (ZMod p)] at hk'
  obtain ⟨d, hd⟩ := hk'
  have hkle : k.1 ≤ N := Nat.le_of_lt_succ k.2
  have hdpos : 0 < d := by
    apply Nat.pos_of_ne_zero
    intro hd0
    subst d
    simp at hd
  have hdlt : d < 4 := by
    by_contra h
    have hd4 : 4 ≤ d := by omega
    have hmul : p * 4 ≤ p * d := Nat.mul_le_mul_left p hd4
    omega
  interval_cases d <;> omega

private lemma zcount_zero (a b : ι → ZMod p) : zcount a b 0 = 1 := by
  classical
  rw [zcount]
  letI : Nonempty {t : Finset ι // ZeroSumCard a b 0 t} :=
    ⟨⟨∅, by simp [ZeroSumCard]⟩⟩
  letI : Subsingleton {t : Finset ι // ZeroSumCard a b 0 t} :=
    ⟨fun s t => by
      apply Subtype.ext
      have hs : s.1 = ∅ := Finset.card_eq_zero.mp s.2.1
      have ht : t.1 = ∅ := Finset.card_eq_zero.mp t.2.1
      rw [hs, ht]⟩
  exact Nat.card_unique

private lemma cw_short_relation (hp : 2 < p) (a b : ι → ZMod p)
    (hlo : 3 * p - 2 ≤ Fintype.card ι) (hhi : Fintype.card ι < 3 * p) :
    (1 : ZMod p) - zcount a b p + zcount a b (2 * p) = 0 := by
  classical
  have hp0 : 0 < p := hp.trans_le' (by omega)
  have hpodd : Odd p := (Fact.out : p.Prime).odd_of_ne_two (by omega)
  let k0 : Fin (Fintype.card ι + 1) := ⟨0, by omega⟩
  let k1 : Fin (Fintype.card ι + 1) := ⟨p, by omega⟩
  let k2 : Fin (Fintype.card ι + 1) := ⟨2 * p, by omega⟩
  have h01 : k0 ≠ k1 := by
    intro h; have hv := congrArg Fin.val h; simp [k0, k1] at hv; omega
  have h02 : k0 ≠ k2 := by
    intro h; have hv := congrArg Fin.val h; simp [k0, k2] at hv; omega
  have h12 : k1 ≠ k2 := by
    intro h; have hv := congrArg Fin.val h; simp [k1, k2] at hv; omega
  have h10 : k1 ≠ k0 := Ne.symm h01
  have h20 : k2 ≠ k0 := Ne.symm h02
  have h21 : k2 ≠ k1 := Ne.symm h12
  have hterm (k : Fin (Fintype.card ι + 1)) :
      (-1 : ZMod p) ^ k.1 * zeroCount a b 0 k =
        if k = k0 then 1 else if k = k1 then -(zcount a b p : ZMod p)
          else if k = k2 then (zcount a b (2 * p) : ZMod p) else 0 := by
    by_cases h0 : k = k0
    · subst k
      rw [if_pos rfl, zeroCount_eq_zcount a b 0 k0 (by simp [k0]), zcount_zero]
      simp [k0]
    by_cases h1 : k = k1
    · subst k
      rw [zeroCount_eq_zcount a b 0 k1 (by simp [k1])]
      simp [h10, k1, hpodd.neg_one_pow]
    by_cases h2 : k = k2
    · subst k
      rw [zeroCount_eq_zcount a b 0 k2 (by simp [k2])]
      have heven : Even (2 * p) := even_two_mul p
      simp [h20, h21, k2, heven.neg_one_pow]
    rw [if_neg h0, if_neg h1, if_neg h2,
      zeroCount_eq_zero_of_not_candidate a b 0 k]
    · simp
    · intro t ht htk
      have hkcast : (k.1 : ZMod p) = 0 := by simpa [← htk] using ht.1
      rcases card_cases_zero hp (show Fintype.card ι < 4 * p by omega) k hkcast with
        hk | hk | hk | hk
      · exact h0 (Fin.ext hk)
      · exact h1 (Fin.ext hk)
      · exact h2 (Fin.ext hk)
      · have := k.2
        omega
  have hcw := chevalleyWarning_count_relation a b 0 (by omega)
  have hsplit :
      (∑ k : Fin (Fintype.card ι + 1),
        (if k = k0 then 1 else if k = k1 then -(zcount a b p : ZMod p)
          else if k = k2 then (zcount a b (2 * p) : ZMod p) else 0)) =
      (∑ k : Fin (Fintype.card ι + 1), if k = k0 then (1 : ZMod p) else 0) +
      (∑ k : Fin (Fintype.card ι + 1),
        if k = k1 then -(zcount a b p : ZMod p) else 0) +
      (∑ k : Fin (Fintype.card ι + 1),
        if k = k2 then (zcount a b (2 * p) : ZMod p) else 0) := by
    rw [← Finset.sum_add_distrib, ← Finset.sum_add_distrib]
    apply Finset.sum_congr rfl
    intro k _
    by_cases h0 : k = k0 <;> by_cases h1 : k = k1 <;> by_cases h2 : k = k2 <;>
      simp [h0, h1, h2, h01, h02, h12, h10, h20, h21]
  calc
    (1 : ZMod p) - zcount a b p + zcount a b (2 * p) =
        ∑ k : Fin (Fintype.card ι + 1),
          (if k = k0 then 1 else if k = k1 then -(zcount a b p : ZMod p)
            else if k = k2 then (zcount a b (2 * p) : ZMod p) else 0) := by
              rw [hsplit]
              simp [sub_eq_add_neg, add_assoc]
    _ = ∑ k : Fin (Fintype.card ι + 1),
        (-1 : ZMod p) ^ k.1 * zeroCount a b 0 k := by
          apply Finset.sum_congr rfl
          intro k _
          exact (hterm k).symm
    _ = 0 := hcw

end ChevalleyWarning

end Problem8
