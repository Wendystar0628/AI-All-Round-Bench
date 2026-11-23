import Mathlib.Data.ZMod.Basic
import Mathlib.Data.Set.Card
import Mathlib.Algebra.Polynomial.Derivative
import Mathlib.Algebra.Polynomial.RingDivision
import Mathlib.Algebra.Polynomial.BigOperators
import Mathlib.FieldTheory.Finite.Basic
import Mathlib.Algebra.CharP.Lemmas

open Polynomial Finset

namespace Problem2Aux

lemma monic_dvd_eq_C_mul {K : Type*} [Field K] {P Q : K[X]}
    (hP : P.Monic) (hQ : Q ≠ 0) (hdvd : P ∣ Q) (hdeg : Q.natDegree ≤ P.natDegree) :
    Q = C Q.leadingCoeff * P := by
  obtain ⟨R, rfl⟩ := hdvd
  have hR0 : R ≠ 0 := right_ne_zero_of_mul hQ
  have hRdeg : R.natDegree = 0 := by
    have := natDegree_mul hP.ne_zero hR0
    omega
  rw [eq_C_of_natDegree_eq_zero hRdeg]
  have hlc : (P * C (R.coeff 0)).leadingCoeff = R.coeff 0 := by
    rw [leadingCoeff_mul, hP.leadingCoeff, one_mul, leadingCoeff_C]
  rw [hlc, mul_comm]

lemma card_le_natDegree_of_eval_zero {K : Type*} [Field K] {P : K[X]} (hP : P ≠ 0)
    (s : Finset K) (hs : ∀ x ∈ s, P.eval x = 0) : s.card ≤ P.natDegree := by
  have hsub : s.val ⊆ P.roots := by
    intro x hx
    rw [mem_roots hP, IsRoot.def]
    exact hs x hx
  have hle : s.val.card ≤ P.roots.card :=
    Multiset.card_le_card ((Multiset.le_iff_subset s.nodup).mpr hsub)
  exact hle.trans (card_roots' P)

lemma prod_X_sub_C_univ (p : ℕ) [Fact p.Prime] :
    (∏ c : ZMod p, (X - C c) : (ZMod p)[X]) = X ^ p - X := by
  set P : (ZMod p)[X] := ∏ c : ZMod p, (X - C c)
  set Q : (ZMod p)[X] := X ^ p - X
  have hp1 : 1 < p := (Fact.out : p.Prime).one_lt
  have hP_monic : P.Monic := monic_prod_of_monic _ _ (fun c _ => monic_X_sub_C c)
  have hP_deg : P.natDegree = p := by
    rw [natDegree_prod_of_monic _ _ (fun c _ => monic_X_sub_C c)]
    simp [ZMod.card]
  have hQ_monic : Q.Monic := by
    have hlt : (X : (ZMod p)[X]).degree < (X ^ p : (ZMod p)[X]).degree := by
      rw [degree_X, degree_X_pow]
      exact_mod_cast hp1
    exact (monic_X_pow p).sub_of_left hlt
  have hQ_deg : Q.natDegree = p := by
    have hlt : (X : (ZMod p)[X]).natDegree < (X ^ p : (ZMod p)[X]).natDegree := by
      simp [hp1]
    rw [natDegree_sub_eq_left_of_natDegree_lt hlt, natDegree_X_pow]
  have hP_top : P.coeff p = 1 := by
    simpa [hP_deg] using hP_monic.coeff_natDegree
  have hQ_top : Q.coeff p = 1 := by
    simpa [hQ_deg] using hQ_monic.coeff_natDegree
  by_contra hne
  have hsub_ne : P - Q ≠ 0 := sub_ne_zero.mpr hne
  have hsub_deg : (P - Q).natDegree < p := by
    have hle : (P - Q).natDegree ≤ p - 1 := by
      rw [natDegree_le_iff_coeff_eq_zero]
      intro n hn
      by_cases hnp : n = p
      · rw [hnp, coeff_sub, hP_top, hQ_top, sub_self]
      · have hgt : p < n := by omega
        rw [coeff_sub, coeff_eq_zero_of_natDegree_lt (by omega),
          coeff_eq_zero_of_natDegree_lt (by omega), sub_self]
    omega
  have hcard : (Finset.univ : Finset (ZMod p)).card ≤ (P - Q).natDegree := by
    apply card_le_natDegree_of_eval_zero hsub_ne
    intro c _
    rw [eval_sub, eval_prod, Finset.prod_eq_zero (Finset.mem_univ c) (by simp),
      eval_sub, eval_pow, eval_X, ZMod.pow_card, sub_self, sub_self]
  simp [ZMod.card] at hcard
  omega

lemma coeff_X_sub_C_pow_pred {K : Type*} [Field K] (t : K) :
    ∀ n : ℕ, 1 ≤ n → ((X - C t) ^ n).coeff (n - 1) = -(n : K) * t
  | 0, h => by omega
  | 1, _ => by simp
  | n + 2, _ => by
    have ih := coeff_X_sub_C_pow_pred t (n + 1) (by omega)
    change ((X - C t) ^ (n + 2)).coeff (n + 1) = -((n + 2 : ℕ) : K) * t
    rw [pow_succ, mul_sub, coeff_sub, coeff_mul_X, coeff_mul_C]
    have hmon : ((X - C t) ^ (n + 1)).Monic := (monic_X_sub_C t).pow (n + 1)
    have hdeg : ((X - C t) ^ (n + 1)).natDegree = n + 1 := by
      rw [natDegree_pow, natDegree_X_sub_C, mul_one]
    have htop : ((X - C t) ^ (n + 1)).coeff (n + 1) = 1 := by
      simpa [hdeg] using hmon.coeff_natDegree
    have hpred : ((X - C t) ^ (n + 1)).coeff n = -((n + 1 : ℕ) : K) * t := by
      simpa using ih
    rw [hpred, htop, one_mul]
    push_cast
    ring

lemma coeff_comp_X_sub_C_pred {K : Type*} [Field K] {Q : K[X]} {d : ℕ}
    (hQ : Q.Monic) (hd : Q.natDegree = d) (hd1 : 1 ≤ d) (t : K) :
    (Q.comp (X - C t)).coeff (d - 1) = Q.coeff (d - 1) - (d : K) * t := by
  have hsum : Q = ∑ i ∈ range (d + 1), C (Q.coeff i) * X ^ i := by
    rw [← hd]
    exact Q.as_sum_range_C_mul_X_pow
  conv_lhs => rw [hsum]
  rw [Polynomial.sum_comp, finsetSum_coeff]
  have hsplit : ∑ i ∈ range (d + 1), ((C (Q.coeff i) * X ^ i).comp (X - C t)).coeff (d - 1) =
      ∑ i ∈ range (d + 1), Q.coeff i * ((X - C t) ^ i).coeff (d - 1) := by
    refine Finset.sum_congr rfl fun i _ => ?_
    rw [mul_comp, C_comp, pow_comp, X_comp, coeff_C_mul]
  rw [hsplit]
  have h2 : range (d + 1) = insert d (insert (d - 1) (range (d - 1))) := by
    ext i
    simp only [mem_range, mem_insert]
    omega
  rw [h2, sum_insert (by simp; omega), sum_insert (by simp)]
  have hzero : ∑ i ∈ range (d - 1), Q.coeff i * ((X - C t) ^ i).coeff (d - 1) = 0 := by
    apply Finset.sum_eq_zero
    intro i hi
    rw [mem_range] at hi
    have hdeg_lt : ((X - C t) ^ i).natDegree < d - 1 := by
      rw [natDegree_pow, natDegree_X_sub_C, mul_one]
      exact hi
    rw [coeff_eq_zero_of_natDegree_lt hdeg_lt, mul_zero]
  rw [hzero, add_zero]
  have hQd : Q.coeff d = 1 := by simpa [hd] using hQ.coeff_natDegree
  have hmon : ((X - C t) ^ (d - 1)).coeff (d - 1) = 1 := by
    have hm : ((X - C t) ^ (d - 1)).Monic := (monic_X_sub_C t).pow (d - 1)
    have hdg : ((X - C t) ^ (d - 1)).natDegree = d - 1 := by
      rw [natDegree_pow, natDegree_X_sub_C, mul_one]
    simpa [hdg] using hm.coeff_natDegree
  rw [hQd, one_mul, hmon, mul_one, coeff_X_sub_C_pow_pred t d hd1]
  ring

lemma bivariate_coeff_deg_bound {K : Type*} [Field K] {α : Type*} [DecidableEq α]
    (s : Finset α) (L : α → K[X]) (hL : ∀ x ∈ s, (L x).natDegree ≤ 1) :
    ∀ j, ((∏ x ∈ s, (X - C (L x)) : (K[X])[X]).coeff j) ≠ 0 →
      ((∏ x ∈ s, (X - C (L x)) : (K[X])[X]).coeff j).natDegree + j ≤ s.card := by
  induction s using Finset.induction_on with
  | empty =>
    intro j hj
    simp only [prod_empty, coeff_one] at hj ⊢
    split_ifs at hj with h
    · subst h; simp
    · exact absurd rfl hj
  | @insert a s ha ih =>
    rw [prod_insert ha, card_insert_of_notMem ha]
    have hLa : (L a).natDegree ≤ 1 := hL a (mem_insert_self a s)
    have ih' := ih (fun x hx => hL x (mem_insert_of_mem hx))
    set P : (K[X])[X] := ∏ x ∈ s, (X - C (L x))
    intro j hj
    set A : K[X] := if j = 0 then 0 else P.coeff (j - 1)
    set B : K[X] := L a * P.coeff j
    have hcoeff : ((X - C (L a)) * P).coeff j = A - B := by
      rw [sub_mul, coeff_sub, coeff_C_mul]
      cases j with
      | zero => simp [A, B]
      | succ k => simp [A, B, coeff_X_mul]
    rw [hcoeff] at hj ⊢
    have hA : A ≠ 0 → A.natDegree + j ≤ s.card + 1 := by
      intro hA0
      dsimp [A] at hA0 ⊢
      split_ifs at hA0 ⊢ with hj0
      · exact absurd rfl hA0
      · have := ih' (j - 1) hA0
        omega
    have hB : B ≠ 0 → B.natDegree + j ≤ s.card + 1 := by
      intro hB0
      have hP0 : P.coeff j ≠ 0 := right_ne_zero_of_mul hB0
      have h1 : B.natDegree ≤ (L a).natDegree + (P.coeff j).natDegree := natDegree_mul_le
      have h2 := ih' j hP0
      omega
    by_cases hA0 : A = 0
    · rw [hA0, zero_sub, natDegree_neg]
      apply hB
      intro hB0
      rw [hA0, hB0, sub_self] at hj
      exact hj rfl
    · by_cases hB0 : B = 0
      · rw [hB0, sub_zero]
        exact hA hA0
      · have hle : (A - B).natDegree ≤ max A.natDegree B.natDegree := natDegree_sub_le A B
        have h1 := hA hA0
        have h2 := hB hB0
        omega

lemma rootMultiplicity_prod_X_sub_C_pow {K : Type*} [Field K] [DecidableEq K]
    (S : Finset K) (m : K → ℕ) (c : K) :
    (∏ x ∈ S, (X - C x) ^ (m x)).rootMultiplicity c = if c ∈ S then m c else 0 := by
  have hprod_ne : ∀ T : Finset K, (∏ x ∈ T, (X - C x) ^ (m x)) ≠ 0 := fun T =>
    (monic_prod_of_monic _ _ (fun x _ => (monic_X_sub_C x).pow _)).ne_zero
  split_ifs with hc
  · rw [← Finset.mul_prod_erase S _ hc, mul_comm,
      rootMultiplicity_mul_X_sub_C_pow (hprod_ne (S.erase c))]
    have hev : ¬ (∏ x ∈ S.erase c, (X - C x) ^ (m x)).IsRoot c := by
      rw [IsRoot.def, eval_prod]
      apply Finset.prod_ne_zero_iff.mpr
      intro x hx
      rw [mem_erase] at hx
      rw [eval_pow, eval_sub, eval_X, eval_C]
      exact pow_ne_zero _ (sub_ne_zero.mpr (Ne.symm hx.1))
    rw [rootMultiplicity_eq_zero hev, zero_add]
  · apply rootMultiplicity_eq_zero
    rw [IsRoot.def, eval_prod]
    apply Finset.prod_ne_zero_iff.mpr
    intro x hx
    have hne : c ≠ x := fun h => hc (h ▸ hx)
    rw [eval_pow, eval_sub, eval_X, eval_C]
    exact pow_ne_zero _ (sub_ne_zero.mpr hne)

lemma solve_ode (p : ℕ) [Fact p.Prime] (hp5 : 5 ≤ p)
    {Q : (ZMod p)[X]} {a : ZMod p}
    (ha : a ≠ 0)
    (hQ_monic : Q.Monic) (hQ_deg : Q.natDegree = (p + 1) / 2)
    (hode : derivative (Q ^ 2) = X ^ p - X + C (a + 2 * a⁻¹) * Q) :
    ∃ (t u : ZMod p), u ^ 2 = 1 ∧ (a = u ∨ a = 2 * u) ∧
      Q.comp (X - C t) = X ^ ((p + 1) / 2) + C u * X := by
  have hp_prime : p.Prime := Fact.out
  have hp_odd : p % 2 = 1 := hp_prime.eq_two_or_odd.resolve_left (by omega)
  set d := (p + 1) / 2
  have hd_eq : 2 * d = p + 1 := by omega
  have hd3 : 3 ≤ d := by omega
  have h2_ne : (2 : ZMod p) ≠ 0 := by
    intro h2
    have hdvd : p ∣ 2 := (ZMod.natCast_eq_zero_iff 2 p).mp (by simpa using h2)
    have := Nat.le_of_dvd (by norm_num) hdvd
    omega
  have h2d : (2 : ZMod p) * (d : ZMod p) = 1 := by
    have : ((2 * d : ℕ) : ZMod p) = ((p + 1 : ℕ) : ZMod p) := by rw [hd_eq]
    push_cast at this
    simpa [ZMod.natCast_self] using this
  set μ : ZMod p := a + 2 * a⁻¹
  set t : ZMod p := 2 * Q.coeff (d - 1)
  set P : (ZMod p)[X] := Q.comp (X - C t)
  have hP_monic : P.Monic := hQ_monic.comp (monic_X_sub_C t) (by simp)
  have hP_deg : P.natDegree = d := by
    rw [natDegree_comp, hQ_deg, natDegree_X_sub_C, mul_one]
  have hP_pred : P.coeff (d - 1) = 0 := by
    rw [coeff_comp_X_sub_C_pred hQ_monic hQ_deg (by omega) t]
    have hdt : (d : ZMod p) * t = Q.coeff (d - 1) := by
      dsimp [t]
      calc (d : ZMod p) * (2 * Q.coeff (d - 1)) = (2 * (d : ZMod p)) * Q.coeff (d - 1) := by ring
        _ = Q.coeff (d - 1) := by rw [h2d, one_mul]
    rw [hdt, sub_self]
  have hXpt : (X - C t : (ZMod p)[X]) ^ p - (X - C t) = X ^ p - X := by
    rw [sub_pow_char, ← C_pow, ZMod.pow_card]
    ring
  have hP_ode : derivative (P ^ 2) = X ^ p - X + C μ * P := by
    have h1 : derivative (P ^ 2) = (derivative (Q ^ 2)).comp (X - C t) := by
      have hpow : P ^ 2 = (Q ^ 2).comp (X - C t) := by rw [pow_comp]
      rw [hpow, derivative_comp]
      simp
    rw [h1, hode]
    simp only [add_comp, sub_comp, mul_comp, pow_comp, X_comp, C_comp, hXpt]
    rfl
  set S : (ZMod p)[X] := P - X ^ d
  have hP_eq : P = X ^ d + S := by simp [S]
  have hS_deg : S.natDegree ≤ d - 2 := by
    rw [natDegree_le_iff_coeff_eq_zero]
    intro n hn
    dsimp [S]
    rw [coeff_sub]
    by_cases hnd : n = d
    · rw [hnd]
      have hPd : P.coeff d = 1 := by simpa [hP_deg] using hP_monic.coeff_natDegree
      rw [hPd, coeff_X_pow_self, sub_self]
    · by_cases hnd1 : n = d - 1
      · rw [hnd1, hP_pred, coeff_X_pow, ite_eq_right (by omega), sub_self]
      · have hgt : d < n := by omega
        rw [coeff_eq_zero_of_natDegree_lt (by omega), coeff_X_pow, ite_eq_right (by omega), sub_self]
  have hderiv_X2d : derivative (X ^ (2 * d) : (ZMod p)[X]) = X ^ p := by
    rw [derivative_X_pow, hd_eq]
    simp
  have hS_ode : derivative (2 * X ^ d * S + S ^ 2) = -X + C μ * X ^ d + C μ * S := by
    have hsq : P ^ 2 = X ^ (2 * d) + (2 * X ^ d * S + S ^ 2) := by
      rw [hP_eq]
      have : (X ^ d : (ZMod p)[X]) ^ 2 = X ^ (2 * d) := by rw [← pow_mul, mul_comm]
      linear_combination this
    rw [hsq, derivative_add, hderiv_X2d] at hP_ode
    rw [hP_eq, mul_add] at hP_ode
    linear_combination hP_ode
  have hS_le1 : S.natDegree ≤ 1 := by
    by_contra hgt
    push Not at hgt
    have hs2 : 2 ≤ S.natDegree := hgt
    have hS_ne : S ≠ 0 := by
      intro h0
      rw [h0, natDegree_zero] at hs2
      omega
    have hds_lt : d + S.natDegree < p := by omega
    have hds_pos : 1 ≤ d + S.natDegree := by omega
    have hcoeff_eq := congr_arg (fun F : (ZMod p)[X] => F.coeff (d + S.natDegree - 1)) hS_ode
    have hrhs0 : (-X + C μ * X ^ d + C μ * S).coeff (d + S.natDegree - 1) = 0 := by
      rw [coeff_add, coeff_add, coeff_neg, coeff_X, ite_eq_right (by omega), neg_zero, zero_add,
        coeff_C_mul, coeff_X_pow, ite_eq_right (by omega), mul_zero, zero_add,
        coeff_C_mul, coeff_eq_zero_of_natDegree_lt (by omega), mul_zero]
    have hlhs_eq : (derivative (2 * X ^ d * S + S ^ 2)).coeff (d + S.natDegree - 1) =
        ((d + S.natDegree : ℕ) : ZMod p) * (2 * S.leadingCoeff) := by
      rw [coeff_derivative, Nat.sub_add_cancel hds_pos, coeff_add]
      have hS2_zero : (S ^ 2).coeff (d + S.natDegree) = 0 := by
        apply coeff_eq_zero_of_natDegree_lt
        have h1 : (S ^ 2).natDegree ≤ 2 * S.natDegree := natDegree_pow_le
        omega
      have hterm1 : (2 * X ^ d * S).coeff (d + S.natDegree) = 2 * S.leadingCoeff := by
        rw [mul_assoc, coeff_ofNat_mul, add_comm d S.natDegree, coeff_X_pow_mul, coeff_natDegree]
      rw [hterm1, hS2_zero, add_zero, mul_comm]
      congr 1
      simp [Nat.cast_sub hds_pos]
    rw [hlhs_eq, hrhs0] at hcoeff_eq
    have hds_ne : ((d + S.natDegree : ℕ) : ZMod p) ≠ 0 := by
      intro h0
      have hdvd : p ∣ (d + S.natDegree) := (ZMod.natCast_eq_zero_iff (d + S.natDegree) p).mp h0
      have := Nat.le_of_dvd (by omega) hdvd
      omega
    have hlc_ne : S.leadingCoeff ≠ 0 := leadingCoeff_ne_zero.mpr hS_ne
    exact mul_ne_zero hds_ne (mul_ne_zero h2_ne hlc_ne) hcoeff_eq
  set u : ZMod p := S.coeff 1
  set v : ZMod p := S.coeff 0
  have hS_lin : S = C u * X + C v := by
    ext n
    match n with
    | 0 => simp [v]
    | 1 => simp [u]
    | n + 2 =>
      rw [coeff_eq_zero_of_natDegree_lt (by omega)]
      simp
  have hpoly_lhs : 2 * X ^ d * S + S ^ 2 =
      C (2 * u) * X ^ (d + 1) + C (2 * v) * X ^ d + C (u ^ 2) * X ^ 2 + C (2 * u * v) * X + C (v ^ 2) := by
    rw [hS_lin]
    have hC2 : (2 : (ZMod p)[X]) = C 2 := (map_ofNat C 2).symm
    simp only [map_mul, map_pow, ← hC2, pow_succ]
    ring
  have hderiv_lhs : derivative (2 * X ^ d * S + S ^ 2) =
      C (3 * u) * X ^ d + C v * X ^ (d - 1) + C (2 * u ^ 2) * X + C (2 * u * v) := by
    rw [hpoly_lhs]
    simp only [derivative_add, derivative_C_mul, derivative_X_pow, derivative_X, derivative_C,
      mul_one, add_zero, Nat.add_sub_cancel]
    have h1 : C (2 * u) * (C ((d + 1 : ℕ) : ZMod p) * X ^ d) = C (3 * u) * X ^ d := by
      rw [← mul_assoc, ← C_mul]
      congr 2
      push_cast
      linear_combination u * h2d
    have h2 : C (2 * v) * (C (d : ZMod p) * X ^ (d - 1)) = C v * X ^ (d - 1) := by
      rw [← mul_assoc, ← C_mul]
      congr 2
      linear_combination v * h2d
    have h3 : C (u ^ 2) * (C ((2 : ℕ) : ZMod p) * X ^ (2 - 1)) = C (2 * u ^ 2) * X := by
      rw [← mul_assoc, ← C_mul]
      simp [mul_comm]
    rw [h1, h2, h3]
  have hpoly_rhs : -X + C μ * X ^ d + C μ * S =
      C μ * X ^ d + C (μ * u - 1) * X + C (μ * v) := by
    rw [hS_lin]
    simp only [map_sub, map_mul, map_one]
    ring
  rw [hderiv_lhs, hpoly_rhs] at hS_ode
  have hv0 : v = 0 := by
    have h := congr_arg (fun F : (ZMod p)[X] => F.coeff (d - 1)) hS_ode
    simp only [coeff_add, coeff_C_mul, coeff_X_pow, coeff_X, coeff_C,
      ite_eq_right (show d - 1 ≠ d by omega), ite_true,
      ite_eq_right (show 1 ≠ d - 1 by omega), ite_eq_right (show d - 1 ≠ 0 by omega),
      mul_zero, mul_one, zero_add, add_zero] at h
    exact h
  have hmu : μ = 3 * u := by
    have h := congr_arg (fun F : (ZMod p)[X] => F.coeff d) hS_ode
    simp only [coeff_add, coeff_C_mul, coeff_X_pow, coeff_X, coeff_C,
      ite_true, ite_eq_right (show d ≠ d - 1 by omega),
      ite_eq_right (show 1 ≠ d by omega), ite_eq_right (show d ≠ 0 by omega),
      mul_zero, mul_one, zero_add, add_zero] at h
    exact h.symm
  have hu2 : u ^ 2 = 1 := by
    have h := congr_arg (fun F : (ZMod p)[X] => F.coeff 1) hS_ode
    simp only [coeff_add, coeff_C_mul, coeff_X_pow, coeff_X, coeff_C,
      ite_eq_right (show 1 ≠ d by omega), ite_eq_right (show 1 ≠ d - 1 by omega),
      ite_true, ite_eq_right (show (1 : ℕ) ≠ 0 by omega),
      mul_zero, mul_one, zero_add, add_zero] at h
    rw [hmu] at h
    linear_combination -h
  have ha_cases : a = u ∨ a = 2 * u := by
    have h1 : a ^ 2 + 2 = 3 * u * a := by
      have h0 : a * (a + 2 * a⁻¹) = a * (3 * u) := congr_arg (a * ·) hmu
      rw [mul_add, mul_left_comm, mul_inv_cancel₀ ha, mul_one] at h0
      linear_combination h0
    have hfac : (a - u) * (a - 2 * u) = 0 := by
      linear_combination h1 + 2 * hu2
    rcases mul_eq_zero.mp hfac with h | h
    · left; exact sub_eq_zero.mp h
    · right; exact sub_eq_zero.mp h
  refine ⟨t, u, hu2, ha_cases, ?_⟩
  change P = X ^ d + C u * X
  rw [hP_eq, hS_lin, hv0, C_0, add_zero]

lemma problem2_p3 (f : ZMod 3 → ZMod 3)
    (hf : ¬ ∃ a b : ZMod 3, ∀ x, f x = a * x + b) :
    3 ≤ (Finset.univ.filter (fun m : ZMod 3 =>
      ∃ x y : ZMod 3, x ≠ y ∧ f x - f y = m * (x - y))).card := by
  classical
  set D : Finset (ZMod 3) :=
    Finset.univ.filter (fun m => ∃ x y : ZMod 3, x ≠ y ∧ f x - f y = m * (x - y))
  by_contra hlt
  push Not at hlt
  set m1 : ZMod 3 := f 1 - f 0
  set m2 : ZMod 3 := 2 * (f 2 - f 0)
  set m3 : ZMod 3 := f 2 - f 1
  have h22 : (2 : ZMod 3) * 2 = 1 := by decide
  have h10 : (1 : ZMod 3) ≠ 0 := by decide
  have h20 : (2 : ZMod 3) ≠ 0 := by decide
  have h21 : (2 : ZMod 3) ≠ 1 := by decide
  have h1 : f 1 - f 0 = m1 * (1 - 0) := by dsimp [m1]; ring
  have h2 : f 2 - f 0 = m2 * (2 - 0) := by
    dsimp [m2]
    calc f 2 - f 0 = 1 * (f 2 - f 0) := (one_mul _).symm
      _ = (2 * 2) * (f 2 - f 0) := by rw [h22]
      _ = 2 * (f 2 - f 0) * (2 - 0) := by ring
  have h3' : f 2 - f 1 = m3 * (2 - 1) := by dsimp [m3]; ring
  have hm1 : m1 ∈ D := by simp only [D, mem_filter, mem_univ, true_and]; exact ⟨1, 0, h10, h1⟩
  have hm2 : m2 ∈ D := by simp only [D, mem_filter, mem_univ, true_and]; exact ⟨2, 0, h20, h2⟩
  have hm3 : m3 ∈ D := by simp only [D, mem_filter, mem_univ, true_and]; exact ⟨2, 1, h21, h3'⟩
  have heq_case : m1 = m2 ∨ m1 = m3 ∨ m2 = m3 := by
    by_contra hne
    push Not at hne
    have hsub : ({m1, m2, m3} : Finset (ZMod 3)) ⊆ D := by
      intro z hz
      simp only [mem_insert, mem_singleton] at hz
      rcases hz with rfl | rfl | rfl <;> assumption
    have hcard3 : ({m1, m2, m3} : Finset (ZMod 3)).card = 3 := by
      rw [card_insert_of_notMem, card_insert_of_notMem, card_singleton]
      · simp [hne.2.2]
      · simp [hne.1, hne.2.1]
    have := Finset.card_le_card hsub
    omega
  rcases heq_case with h12 | h13 | h23
  · apply hf; refine ⟨m1, f 0, fun x => ?_⟩
    rw [← h12] at h2
    fin_cases x
    · change f 0 = m1 * 0 + f 0; ring
    · change f 1 = m1 * 1 + f 0; linear_combination h1
    · change f 2 = m1 * 2 + f 0; linear_combination h2
  · apply hf; refine ⟨m1, f 1 - m1, fun x => ?_⟩
    rw [← h13] at h3'
    fin_cases x
    · change f 0 = m1 * 0 + (f 1 - m1); linear_combination -h1
    · change f 1 = m1 * 1 + (f 1 - m1); ring
    · change f 2 = m1 * 2 + (f 1 - m1); linear_combination h3'
  · apply hf; refine ⟨m2, f 2 - m2 * 2, fun x => ?_⟩
    rw [← h23] at h3'
    fin_cases x
    · change f 0 = m2 * 0 + (f 2 - m2 * 2); linear_combination -h2
    · change f 1 = m2 * 1 + (f 2 - m2 * 2); linear_combination -h3'
    · change f 2 = m2 * 2 + (f 2 - m2 * 2); ring

lemma double_count_contradiction (p : ℕ) [Fact p.Prime] (hp5 : 5 ≤ p)
    (f : ZMod p → ZMod p)
    (D : Finset (ZMod p))
    (hD_mem : ∀ y : ZMod p, y ∈ D ↔ ∃ x1 x2 : ZMod p, x1 ≠ x2 ∧ f x1 - f x2 = y * (x1 - x2))
    (hD_card : D.card = (p + 1) / 2)
    (hD_classify : ∀ y ∈ D,
      let S := Finset.univ.image (fun x => f x - y * x)
      let m := fun c => (Finset.univ.filter (fun x => f x - y * x = c)).card
      ((∃ c ∈ S, m c = (p + 1) / 2) ∧ ∑ c ∈ S, m c * (m c - 1) = ((p + 1) / 2) * ((p - 1) / 2)) ∨
      ((∀ c ∈ S, m c ≤ 2) ∧ ∑ c ∈ S, m c * (m c - 1) = 2 * ((p - 1) / 2))) : False := by
  classical
  have hp_prime : p.Prime := Fact.out
  have hp_odd : p % 2 = 1 := hp_prime.eq_two_or_odd.resolve_left (by omega)
  set k := (p - 1) / 2
  set d := (p + 1) / 2
  have hk2 : 2 ≤ k := by omega
  have hd3 : 3 ≤ d := by omega
  have hpk : p = 2 * k + 1 := by omega
  have hdk : d = k + 1 := by omega
  let S : ZMod p → Finset (ZMod p) := fun y => Finset.univ.image (fun x => f x - y * x)
  let m : ZMod p → ZMod p → ℕ := fun y c => (Finset.univ.filter (fun x => f x - y * x = c)).card
  set pairs : Finset (ZMod p × ZMod p) := Finset.univ.filter (fun z => z.1 ≠ z.2)
  have hpairs_card : pairs.card = p * (p - 1) := by
    have hdiag : pairs = Finset.univ \ (Finset.univ.image (fun x : ZMod p => (x, x))) := by
      ext ⟨x1, x2⟩
      simp [pairs]
    rw [hdiag, card_sdiff_of_subset (subset_univ _)]
    have himg : (Finset.univ.image (fun x : ZMod p => (x, x))).card = p := by
      rw [card_image_of_injective _ (fun a b h => (Prod.mk.inj h).1)]
      simp [ZMod.card]
    simp only [card_univ, Fintype.card_prod, ZMod.card, himg]
    rw [Nat.mul_sub_left_distrib, mul_one]
  let slope : ZMod p × ZMod p → ZMod p := fun z => (f z.1 - f z.2) * (z.1 - z.2)⁻¹
  have hslope_mem : ∀ z ∈ pairs, slope z ∈ D := by
    intro ⟨x1, x2⟩ hz
    have hne : x1 ≠ x2 := (mem_filter.mp hz).2
    rw [hD_mem]
    refine ⟨x1, x2, hne, ?_⟩
    dsimp [slope]
    rw [mul_assoc, inv_mul_cancel₀ (sub_ne_zero.mpr hne), mul_one]
  have hfiber_card : ∀ y ∈ D, (pairs.filter (fun z => slope z = y)).card =
      ∑ c ∈ S y, m y c * (m y c - 1) := by
    intro y _
    have hset : pairs.filter (fun z => slope z = y) =
        (S y).biUnion (fun c =>
          let F := Finset.univ.filter (fun x : ZMod p => f x - y * x = c)
          (F ×ˢ F).filter (fun z => z.1 ≠ z.2)) := by
      ext ⟨x1, x2⟩
      simp only [mem_filter, pairs, mem_univ, true_and, mem_biUnion, mem_product]
      constructor
      · rintro ⟨hne, hsl⟩
        have heq : f x1 - y * x1 = f x2 - y * x2 := by
          dsimp [slope] at hsl
          have h1 : f x1 - f x2 = y * (x1 - x2) := by
            rw [← hsl, mul_assoc, inv_mul_cancel₀ (sub_ne_zero.mpr hne), mul_one]
          linear_combination h1
        refine ⟨f x1 - y * x1, mem_image_of_mem _ (mem_univ x1), ⟨rfl, heq.symm⟩, hne⟩
      · rintro ⟨c, _, ⟨h1, h2⟩, hne⟩
        refine ⟨hne, ?_⟩
        dsimp [slope]
        have hdiff : f x1 - f x2 = y * (x1 - x2) := by linear_combination h1 - h2
        rw [hdiff, mul_assoc, mul_inv_cancel₀ (sub_ne_zero.mpr hne), mul_one]
    rw [hset, card_biUnion]
    · refine Finset.sum_congr rfl fun c _ => ?_
      set F := Finset.univ.filter (fun x : ZMod p => f x - y * x = c)
      have hsub_diag : F.image (fun x => (x, x)) ⊆ F ×ˢ F := by
        intro z hz
        rcases mem_image.mp hz with ⟨x, hx, rfl⟩
        exact mem_product.mpr ⟨hx, hx⟩
      have hdiag : (F ×ˢ F).filter (fun z => z.1 ≠ z.2) =
          (F ×ˢ F) \ (F.image (fun x => (x, x))) := by
        ext ⟨x1, x2⟩
        simp only [mem_filter, mem_product, mem_sdiff, mem_image, Prod.mk.injEq]
        constructor
        · rintro ⟨⟨h1, h2⟩, hne⟩
          refine ⟨⟨h1, h2⟩, ?_⟩
          rintro ⟨x, _, rfl, rfl⟩
          exact hne rfl
        · rintro ⟨⟨h1, h2⟩, hnot⟩
          refine ⟨⟨h1, h2⟩, fun h => hnot ⟨x1, h1, rfl, h⟩⟩
      rw [hdiag, card_sdiff_of_subset hsub_diag, card_product,
        card_image_of_injective _ (fun a b h => (Prod.mk.inj h).1)]
      dsimp [m, F]
      rw [Nat.mul_sub_left_distrib, mul_one]
    · intro c1 _ c2 _ hne
      dsimp only [Function.onFun]
      rw [Finset.disjoint_left]
      intro ⟨x1, x2⟩ h1 h2
      simp only [mem_filter, mem_product, mem_univ, true_and] at h1 h2
      exact hne (h1.1.1.symm.trans h2.1.1)
  have hdouble : p * (p - 1) = ∑ y ∈ D, ∑ c ∈ S y, m y c * (m y c - 1) := by
    rw [← hpairs_card, Finset.card_eq_sum_card_fiberwise hslope_mem]
    exact Finset.sum_congr rfl hfiber_card
  set D1 : Finset (ZMod p) := D.filter (fun y => ∃ c ∈ S y, m y c = d)
  set D2 : Finset (ZMod p) := D.filter (fun y => ¬ ∃ c ∈ S y, m y c = d)
  have hD_split : D1.card + D2.card = d := by
    rw [← hD_card]
    have h := Finset.sum_filter_add_sum_filter_not D (fun y => ∃ c ∈ S y, m y c = d) (fun _ => (1 : ℕ))
    simpa [D1, D2] using h
  have hsum_split : ∑ y ∈ D, ∑ c ∈ S y, m y c * (m y c - 1) =
      D1.card * (d * k) + D2.card * (2 * k) := by
    rw [← Finset.sum_filter_add_sum_filter_not D (fun y => ∃ c ∈ S y, m y c = d)]
    have h1 : ∑ y ∈ D1, ∑ c ∈ S y, m y c * (m y c - 1) = D1.card * (d * k) := by
      calc ∑ y ∈ D1, ∑ c ∈ S y, m y c * (m y c - 1)
          = ∑ _ ∈ D1, (d * k) := by
            refine Finset.sum_congr rfl fun y hy => ?_
            have hyD := (mem_filter.mp hy).1
            have hyA := (mem_filter.mp hy).2
            rcases hD_classify y hyD with ⟨_, hsum⟩ | ⟨hle2, _⟩
            · exact hsum
            · exfalso
              rcases hyA with ⟨c, hc, hmc⟩
              have hle : m y c ≤ 2 := hle2 c hc
              omega
        _ = D1.card * (d * k) := by simp
    have h2 : ∑ y ∈ D2, ∑ c ∈ S y, m y c * (m y c - 1) = D2.card * (2 * k) := by
      calc ∑ y ∈ D2, ∑ c ∈ S y, m y c * (m y c - 1)
          = ∑ _ ∈ D2, (2 * k) := by
            refine Finset.sum_congr rfl fun y hy => ?_
            have hyD := (mem_filter.mp hy).1
            have hyB := (mem_filter.mp hy).2
            rcases hD_classify y hyD with ⟨hyA, _⟩ | ⟨_, hsum⟩
            · exact absurd hyA hyB
            · exact hsum
        _ = D2.card * (2 * k) := by simp
    rw [h1, h2]
  rw [hsum_split] at hdouble
  have hD1_ge3 : 3 ≤ D1.card := by
    have hmul : (2 * k + 1) * (2 * k) = D1.card * ((k + 1) * k) + D2.card * (2 * k) := by
      rw [← hpk, ← hdk]
      have hp1 : p - 1 = 2 * k := by omega
      rw [hp1] at hdouble
      exact hdouble
    have hcancel : (2 * k + 1) * 2 = D1.card * (k + 1) + D2.card * 2 := by
      have hk0 : 0 < k := by omega
      have : ((2 * k + 1) * 2) * k = (D1.card * (k + 1) + D2.card * 2) * k := by
        linarith
      exact Nat.eq_of_mul_eq_mul_right hk0 this
    have hA_eq : D1.card * (k - 1) = 2 * k := by
      have h1 : D1.card * (k - 1) + D1.card * 2 = D1.card * (k + 1) := by
        have : k - 1 + 2 = k + 1 := by omega
        rw [← mul_add, this]
      omega
    by_contra hlt3
    have hle2 : D1.card ≤ 2 := by omega
    have : D1.card * (k - 1) ≤ 2 * (k - 1) := Nat.mul_le_mul_right (k - 1) hle2
    omega
  obtain ⟨y1, hy1, y2, hy2, y3, hy3, h12, h13, h23⟩ :
      ∃ y1 ∈ D1, ∃ y2 ∈ D1, ∃ y3 ∈ D1, y1 ≠ y2 ∧ y1 ≠ y3 ∧ y2 ≠ y3 := by
    obtain ⟨y1, hy1⟩ := Finset.card_pos.mp (by omega : 0 < D1.card)
    have hcard1 : 2 ≤ (D1.erase y1).card := by rw [card_erase_of_mem hy1]; omega
    obtain ⟨y2, hy2'⟩ := Finset.card_pos.mp (by omega : 0 < (D1.erase y1).card)
    have hcard2 : 1 ≤ ((D1.erase y1).erase y2).card := by rw [card_erase_of_mem hy2']; omega
    obtain ⟨y3, hy3'⟩ := Finset.card_pos.mp hcard2
    rw [mem_erase] at hy2' hy3'
    rw [mem_erase] at hy3'
    exact ⟨y1, hy1, y2, hy2'.2, y3, hy3'.2.2, hy2'.1.symm, hy3'.2.1.symm, hy3'.1.symm⟩
  obtain ⟨c1, _, hc1⟩ := (mem_filter.mp hy1).2
  obtain ⟨c2, _, hc2⟩ := (mem_filter.mp hy2).2
  obtain ⟨c3, _, hc3⟩ := (mem_filter.mp hy3).2
  set L1 := Finset.univ.filter (fun x : ZMod p => f x - y1 * x = c1)
  set L2 := Finset.univ.filter (fun x : ZMod p => f x - y2 * x = c2)
  set L3 := Finset.univ.filter (fun x : ZMod p => f x - y3 * x = c3)
  have hL1 : L1.card = d := hc1
  have hL2 : L2.card = d := hc2
  have hL3 : L3.card = d := hc3
  have hinter_le1 : ∀ (a1 a2 b1 b2 : ZMod p), a1 ≠ a2 →
      ((Finset.univ.filter (fun x : ZMod p => f x - a1 * x = b1)) ∩
       (Finset.univ.filter (fun x : ZMod p => f x - a2 * x = b2))).card ≤ 1 := by
    intro a1 a2 b1 b2 ha12
    rw [Finset.card_le_one]
    intro x hx x' hx'
    simp only [mem_inter, mem_filter, mem_univ, true_and] at hx hx'
    have h1 : (a1 - a2) * x = b2 - b1 := by linear_combination hx.2 - hx.1
    have h2 : (a1 - a2) * x' = b2 - b1 := by linear_combination hx'.2 - hx'.1
    exact mul_left_cancel₀ (sub_ne_zero.mpr ha12) (h1.trans h2.symm)
  have hI12 : (L1 ∩ L2).card ≤ 1 := hinter_le1 y1 y2 c1 c2 h12
  have hI13 : (L1 ∩ L3).card ≤ 1 := hinter_le1 y1 y3 c1 c3 h13
  have hI23 : (L2 ∩ L3).card ≤ 1 := hinter_le1 y2 y3 c2 c3 h23
  have hu12 : (L1 ∪ L2).card + (L1 ∩ L2).card = L1.card + L2.card := card_union_add_card_inter L1 L2
  have hu123 : (L1 ∪ L2 ∪ L3).card + ((L1 ∪ L2) ∩ L3).card = (L1 ∪ L2).card + L3.card :=
    card_union_add_card_inter (L1 ∪ L2) L3
  have hinter_dist : ((L1 ∪ L2) ∩ L3).card ≤ (L1 ∩ L3).card + (L2 ∩ L3).card := by
    rw [union_inter_distrib_right]
    exact card_union_le _ _
  have hub_total : (L1 ∪ L2 ∪ L3).card ≤ p := by
    have := card_le_univ (L1 ∪ L2 ∪ L3)
    simpa [ZMod.card] using this
  omega

lemma classify_direction (p : ℕ) [Fact p.Prime] (hp5 : 5 ≤ p)
    (f : ZMod p → ZMod p) (y : ZMod p)
    (hS_card : (Finset.univ.image (fun x => f x - y * x)).card = (p + 1) / 2)
    (hg_deg : ((∏ x : ZMod p, (X - C (f x - y * x)) : (ZMod p)[X]) - X ^ p).natDegree ≤ (p + 1) / 2)
    (hgX_ne : ((∏ x : ZMod p, (X - C (f x - y * x)) : (ZMod p)[X]) - X ^ p) + X ≠ 0)
    (hdg_ne : derivative ((∏ x : ZMod p, (X - C (f x - y * x)) : (ZMod p)[X]) - X ^ p) ≠ 0) :
    let S := Finset.univ.image (fun x => f x - y * x)
    let m := fun c => (Finset.univ.filter (fun x => f x - y * x = c)).card
    ((∃ c ∈ S, m c = (p + 1) / 2) ∧ ∑ c ∈ S, m c * (m c - 1) = ((p + 1) / 2) * ((p - 1) / 2)) ∨
    ((∀ c ∈ S, m c ≤ 2) ∧ ∑ c ∈ S, m c * (m c - 1) = 2 * ((p - 1) / 2)) := by
  classical
  have hp_prime : p.Prime := Fact.out
  have hp_odd : p % 2 = 1 := hp_prime.eq_two_or_odd.resolve_left (by omega)
  set k := (p - 1) / 2
  set d := (p + 1) / 2
  have hk2 : 2 ≤ k := by omega
  have hd3 : 3 ≤ d := by omega
  have hpk : p = 2 * k + 1 := by omega
  have hdk : d = k + 1 := by omega
  have h2d_eq : 2 * d = p + 1 := by omega
  have h2d_zmod : (2 : ZMod p) * (d : ZMod p) = 1 := by
    have : ((2 * d : ℕ) : ZMod p) = ((p + 1 : ℕ) : ZMod p) := by rw [h2d_eq]
    push_cast at this
    simpa [ZMod.natCast_self] using this
  set S : Finset (ZMod p) := Finset.univ.image (fun x => f x - y * x)
  let m : ZMod p → ℕ := fun c => (Finset.univ.filter (fun x => f x - y * x = c)).card
  set Hy : (ZMod p)[X] := ∏ x : ZMod p, (X - C (f x - y * x))
  set g : (ZMod p)[X] := Hy - X ^ p
  set Ry : (ZMod p)[X] := ∏ c ∈ S, (X - C c)
  set My : (ZMod p)[X] := ∏ c ∈ S, (X - C c) ^ (m c - 1)
  have hm_pos : ∀ c ∈ S, 1 ≤ m c := by
    intro c hc
    rcases mem_image.mp hc with ⟨x, _, rfl⟩
    exact Finset.card_pos.mpr ⟨x, mem_filter.mpr ⟨mem_univ x, rfl⟩⟩
  have hm_sum : ∑ c ∈ S, m c = p := by
    have h := Finset.card_eq_sum_card_fiberwise (f := fun x : ZMod p => f x - y * x)
      (s := Finset.univ) (t := S) (fun x hx => mem_image_of_mem _ hx)
    simpa [m, ZMod.card] using h.symm
  have hHy_fiber : Hy = ∏ c ∈ S, (X - C c) ^ (m c) := by
    dsimp [Hy]
    rw [← Finset.prod_fiberwise_of_maps_to (g := fun x : ZMod p => f x - y * x)
      (t := S) (fun x hx => mem_image_of_mem _ hx)]
    refine Finset.prod_congr rfl fun c _ => ?_
    rw [Finset.prod_congr rfl (fun x hx => by rw [(mem_filter.mp hx).2]), Finset.prod_const]
  have hHy_fac : Hy = Ry * My := by
    rw [hHy_fiber]
    dsimp [Ry, My]
    rw [← Finset.prod_mul_distrib]
    refine Finset.prod_congr rfl fun c hc => ?_
    have h1 := hm_pos c hc
    conv_lhs => rw [← Nat.sub_add_cancel h1, pow_succ']
  have hRy_monic : Ry.Monic := monic_prod_of_monic _ _ (fun c _ => monic_X_sub_C c)
  have hRy_deg : Ry.natDegree = d := by
    rw [natDegree_prod_of_monic _ _ (fun c _ => monic_X_sub_C c)]
    simp [hS_card]
  have hMy_monic : My.Monic := monic_prod_of_monic _ _ (fun c _ => (monic_X_sub_C c).pow _)
  have hMy_deg : My.natDegree = d - 1 := by
    rw [natDegree_prod_of_monic _ _ (fun c _ => (monic_X_sub_C c).pow _)]
    have hsum1 : ∑ c ∈ S, ((X - C c : (ZMod p)[X]) ^ (m c - 1)).natDegree =
        ∑ c ∈ S, (m c - 1) := by
      refine Finset.sum_congr rfl fun c _ => ?_
      rw [natDegree_pow, natDegree_X_sub_C, mul_one]
    rw [hsum1]
    have hadd : (∑ c ∈ S, (m c - 1)) + S.card = ∑ c ∈ S, m c := by
      have hcard1 : S.card = ∑ _ ∈ S, (1 : ℕ) := by simp
      rw [hcard1, ← Finset.sum_add_distrib]
      refine Finset.sum_congr rfl fun c hc => ?_
      have := hm_pos c hc
      omega
    rw [hm_sum, hS_card] at hadd
    omega
  have hRy_dvd : Ry ∣ g + X := by
    apply Finset.prod_dvd_of_coprime
    · intro c1 _ c2 _ hne
      exact isCoprime_X_sub_C_of_isUnit_sub (sub_ne_zero.mpr hne).isUnit
    · intro c hc
      rw [dvd_iff_isRoot, IsRoot.def]
      have hHy_c : Hy.eval c = 0 := by
        rw [hHy_fiber, eval_prod]
        exact Finset.prod_eq_zero hc (by rw [eval_pow, eval_sub, eval_X, eval_C, sub_self, zero_pow (by have := hm_pos c hc; omega)])
      simp [g, hHy_c, ZMod.pow_card]
  have hderiv_Hy : derivative Hy = derivative g := by
    have h1 : Hy = X ^ p + g := by dsimp [g]; ring
    rw [h1, derivative_add, derivative_X_pow]
    simp
  have hMy_dvd : My ∣ derivative g := by
    rw [← hderiv_Hy]
    apply Finset.prod_dvd_of_coprime
    · intro c1 _ c2 _ hne
      exact (isCoprime_X_sub_C_of_isUnit_sub (sub_ne_zero.mpr hne).isUnit).pow
    · intro c hc
      have hfac : Hy = (X - C c) ^ (m c) * ∏ c' ∈ S.erase c, (X - C c') ^ (m c') := by
        rw [hHy_fiber, ← Finset.mul_prod_erase _ _ hc]
      rw [hfac, derivative_mul, derivative_pow, derivative_sub, derivative_X, derivative_C,
        sub_zero, mul_one]
      apply dvd_add
      · exact dvd_mul_of_dvd_left (dvd_mul_of_dvd_right (dvd_refl _) _) _
      · exact dvd_mul_of_dvd_left (pow_dvd_pow _ (Nat.sub_le _ _)) _
  have hgX_le_d : (g + X).natDegree ≤ d :=
    (natDegree_add_le _ _).trans (max_le hg_deg (by rw [natDegree_X]; omega))
  have hgX_eq : g + X = C (g + X).leadingCoeff * Ry :=
    monic_dvd_eq_C_mul hRy_monic hgX_ne hRy_dvd (by rw [hRy_deg]; exact hgX_le_d)
  set a : ZMod p := (g + X).leadingCoeff
  have ha_ne : a ≠ 0 := leadingCoeff_ne_zero.mpr hgX_ne
  have hdg_le : (derivative g).natDegree ≤ d - 1 :=
    (natDegree_derivative_le _).trans (Nat.sub_le_sub_right hg_deg 1)
  have hdg_eq_C : derivative g = C (derivative g).leadingCoeff * My :=
    monic_dvd_eq_C_mul hMy_monic hdg_ne hMy_dvd (by rw [hMy_deg]; exact hdg_le)
  have hg_eq_Q : g = C a * Ry - X := by linear_combination hgX_eq
  have hdg_lc : (derivative g).leadingCoeff = (d : ZMod p) * a := by
    have hdg_deg : (derivative g).natDegree = d - 1 := by
      have h1 := natDegree_le_of_dvd hMy_dvd hdg_ne
      rw [hMy_deg] at h1
      omega
    rw [leadingCoeff, hdg_deg, coeff_derivative]
    have hsub : d - 1 + 1 = d := Nat.sub_add_cancel (by omega)
    have hRy_top : Ry.coeff d = 1 := by simpa [hRy_deg] using hRy_monic.coeff_natDegree
    have hgd : g.coeff d = a := by
      rw [hg_eq_Q, coeff_sub, coeff_C_mul, hRy_top, mul_one, coeff_X,
        ite_eq_right (show 1 ≠ d by omega), sub_zero]
    rw [hsub]
    simp only [Nat.cast_sub (show 1 ≤ d by omega), Nat.cast_one, sub_add_cancel, hgd, mul_comm]
  rw [hdg_lc] at hdg_eq_C
  have hode_raw : (g + X) * derivative g = C ((d : ZMod p) * a ^ 2) * Hy := by
    rw [hgX_eq, hdg_eq_C, hHy_fac]
    simp only [map_mul, map_pow]
    ring
  have hdg_sub : derivative g = C a * derivative Ry - 1 := by
    rw [hg_eq_Q, derivative_sub, derivative_C_mul, derivative_X]
  have hHy_sub : Hy = X ^ p - X + C a * Ry := by
    have h1 : Hy = X ^ p + g := by dsimp [g]; ring
    rw [h1, hg_eq_Q]
    ring
  have hQ_ode : derivative (Ry ^ 2) = X ^ p - X + C (a + 2 * a⁻¹) * Ry := by
    rw [hgX_eq, hdg_sub, hHy_sub] at hode_raw
    have hscale := congr_arg (C (2 * a⁻¹ ^ 2) * ·) hode_raw
    have hderiv_sq : derivative (Ry ^ 2) = 2 * Ry * derivative Ry := by
      rw [pow_two, derivative_mul]
      ring
    rw [hderiv_sq]
    have hca : C (2 * a⁻¹ ^ 2) * C ((d : ZMod p) * a ^ 2) = 1 := by
      rw [← C_mul]
      have : (2 * a⁻¹ ^ 2) * ((d : ZMod p) * a ^ 2) = 1 := by
        calc (2 * a⁻¹ ^ 2) * ((d : ZMod p) * a ^ 2)
            = (2 * (d : ZMod p)) * (a⁻¹ * a) ^ 2 := by ring
          _ = 1 := by rw [h2d_zmod, inv_mul_cancel₀ ha_ne]; ring
      rw [this, map_one]
    have hca2 : C (2 * a⁻¹ ^ 2) * C a * C a = C 2 := by
      rw [← C_mul, ← C_mul]
      have : 2 * a⁻¹ ^ 2 * a * a = 2 := by
        calc 2 * a⁻¹ ^ 2 * a * a = 2 * (a⁻¹ * a) ^ 2 := by ring
          _ = 2 := by rw [inv_mul_cancel₀ ha_ne]; ring
      rw [this]
    have hca1 : C (2 * a⁻¹ ^ 2) * C a = C (2 * a⁻¹) := by
      rw [← C_mul]
      congr 1
      field_simp [ha_ne]
    have h2C : (2 : (ZMod p)[X]) = C 2 := (map_ofNat C 2).symm
    have h1 : C (2 * a⁻¹ ^ 2) * ((C a * Ry) * (C a * derivative Ry - 1)) =
        2 * Ry * derivative Ry - C (2 * a⁻¹) * Ry := by
      calc C (2 * a⁻¹ ^ 2) * ((C a * Ry) * (C a * derivative Ry - 1))
          = (C (2 * a⁻¹ ^ 2) * C a * C a) * (Ry * derivative Ry) - (C (2 * a⁻¹ ^ 2) * C a) * Ry := by ring
        _ = C 2 * (Ry * derivative Ry) - C (2 * a⁻¹) * Ry := by rw [hca2, hca1]
        _ = 2 * Ry * derivative Ry - C (2 * a⁻¹) * Ry := by rw [← h2C]; ring
    have h2 : C (2 * a⁻¹ ^ 2) * (C ((d : ZMod p) * a ^ 2) * (X ^ p - X + C a * Ry)) =
        X ^ p - X + C a * Ry := by
      rw [← mul_assoc, hca, one_mul]
    rw [h1, h2] at hscale
    rw [map_add]
    linear_combination hscale
  obtain ⟨t, u, hu2, ha_cases, hP_eq⟩ := solve_ode p hp5 ha_ne hRy_monic hRy_deg hQ_ode
  have hXpt : (X - C t : (ZMod p)[X]) ^ p - (X - C t) = X ^ p - X := by
    rw [sub_pow_char, ← C_pow, ZMod.pow_card]
    ring
  have hHy_comp : Hy.comp (X - C t) = X ^ p + C a * X ^ d + C (a * u - 1) * X := by
    rw [hHy_sub]
    simp only [add_comp, sub_comp, mul_comp, pow_comp, X_comp, C_comp, hXpt, hP_eq]
    simp only [map_sub, map_mul, map_one]
    ring
  have hHy_comp_prod : Hy.comp (X - C t) = ∏ c ∈ S, (X - C (c + t)) ^ (m c) := by
    rw [hHy_fiber, Polynomial.prod_comp]
    refine Finset.prod_congr rfl fun c _ => ?_
    rw [pow_comp, sub_comp, X_comp, C_comp, map_add]
    ring
  have hrm_eq : ∀ c : ZMod p, (Hy.comp (X - C t)).rootMultiplicity (c + t) =
      if c ∈ S then m c else 0 := by
    intro c
    rw [hHy_comp_prod]
    have hbij : ∏ x ∈ S, (X - C (x + t)) ^ (m x) =
        ∏ z ∈ S.image (· + t), (X - C z) ^ (m (z - t)) := by
      rw [Finset.prod_image (fun x1 _ x2 _ h => add_right_cancel h)]
      refine Finset.prod_congr rfl fun x _ => by simp
    rw [hbij, rootMultiplicity_prod_X_sub_C_pow]
    simp
  have hu_ne : u ≠ 0 := by
    intro h0
    rw [h0, zero_pow (by norm_num)] at hu2
    exact zero_ne_one hu2
  change ((∃ c ∈ S, m c = d) ∧ ∑ c ∈ S, m c * (m c - 1) = d * k) ∨
    ((∀ c ∈ S, m c ≤ 2) ∧ ∑ c ∈ S, m c * (m c - 1) = 2 * k)
  rcases ha_cases with ha_eq | ha_eq
  · left
    rw [ha_eq] at hHy_comp
    have hfacA : Hy.comp (X - C t) = (X ^ k + C u) * (X - C 0) ^ d := by
      rw [hHy_comp, ← pow_two, hu2, sub_self, C_0, zero_mul, add_zero]
      have : d + k = p := by omega
      simp only [C_0, sub_zero]
      rw [add_mul, ← pow_add, add_comm k d, this]
    have hrm0 : (Hy.comp (X - C t)).rootMultiplicity 0 = d := by
      rw [hfacA]
      have hne0 : (X ^ k + C u : (ZMod p)[X]) ≠ 0 := by
        intro h0
        have := congr_arg (eval 0) h0
        simp [zero_pow (show k ≠ 0 by omega)] at this
        exact hu_ne this
      rw [rootMultiplicity_mul_X_sub_C_pow hne0]
      have hev0 : ¬ (X ^ k + C u : (ZMod p)[X]).IsRoot 0 := by
        rw [IsRoot.def]
        simp [zero_pow (show k ≠ 0 by omega), hu_ne]
      rw [rootMultiplicity_eq_zero hev0, zero_add]
    have hm_nt : -t ∈ S ∧ m (-t) = d := by
      have h := hrm_eq (-t)
      rw [neg_add_cancel, hrm0] at h
      split_ifs at h with hmem
      · exact ⟨hmem, h.symm⟩
      · omega
    refine ⟨⟨-t, hm_nt.1, hm_nt.2⟩, ?_⟩
    have hrest : ∀ c ∈ S.erase (-t), m c = 1 := by
      have hsum_er : ∑ c ∈ S.erase (-t), (m c - 1) = 0 := by
        have h1 := hm_sum
        rw [← Finset.add_sum_erase _ _ hm_nt.1, hm_nt.2] at h1
        have h2 : (∑ c ∈ S.erase (-t), (m c - 1)) + (S.erase (-t)).card =
            ∑ c ∈ S.erase (-t), m c := by
          have hcard1 : (S.erase (-t)).card = ∑ _ ∈ S.erase (-t), (1 : ℕ) := by simp
          rw [hcard1, ← Finset.sum_add_distrib]
          refine Finset.sum_congr rfl fun c hc => ?_
          have := hm_pos c (mem_of_mem_erase hc)
          omega
        rw [card_erase_of_mem hm_nt.1, hS_card] at h2
        omega
      intro c hc
      have h0 := (Finset.sum_eq_zero_iff.mp hsum_er) c hc
      have h1 := hm_pos c (mem_of_mem_erase hc)
      omega
    rw [← Finset.add_sum_erase _ _ hm_nt.1, hm_nt.2]
    have hsum0 : ∑ c ∈ S.erase (-t), m c * (m c - 1) = 0 := by
      apply Finset.sum_eq_zero
      intro c hc
      rw [hrest c hc]
      simp
    rw [hsum0, add_zero, hdk, Nat.add_sub_cancel]
  · right
    rw [ha_eq] at hHy_comp
    have hfacB : Hy.comp (X - C t) = (X ^ k + C u) ^ 2 * (X - C 0) ^ 1 := by
      rw [hHy_comp]
      have h2u2 : (2 * u) * u - 1 = 1 := by linear_combination 2 * hu2
      rw [h2u2, C_1, one_mul]
      simp only [C_0, sub_zero, pow_one]
      have hpow1 : (X ^ k + C u) ^ 2 * X = X ^ (2 * k + 1) + C (2 * u) * X ^ (k + 1) + C (u ^ 2) * X := by
        have h2C : (2 : (ZMod p)[X]) = C 2 := (map_ofNat C 2).symm
        simp only [map_mul, ← h2C, pow_add, pow_mul, pow_one, pow_two]
        ring
      rw [hpow1, hu2, C_1, one_mul, ← hpk, ← hdk]
    have hrm0 : (Hy.comp (X - C t)).rootMultiplicity 0 = 1 := by
      rw [hfacB]
      have hne0 : ((X ^ k + C u) ^ 2 : (ZMod p)[X]) ≠ 0 := by
        intro h0
        have := congr_arg (eval 0) h0
        simp [zero_pow (show k ≠ 0 by omega), hu2] at this
      rw [rootMultiplicity_mul_X_sub_C_pow hne0]
      have hev0 : ¬ ((X ^ k + C u) ^ 2 : (ZMod p)[X]).IsRoot 0 := by
        rw [IsRoot.def]
        simp [zero_pow (show k ≠ 0 by omega), hu2]
      rw [rootMultiplicity_eq_zero hev0, zero_add]
    have hm_nt : -t ∈ S ∧ m (-t) = 1 := by
      have h := hrm_eq (-t)
      rw [neg_add_cancel, hrm0] at h
      split_ifs at h with hmem
      exact ⟨hmem, h.symm⟩
    have hge2 : ∀ c ∈ S.erase (-t), 2 ≤ m c := by
      intro c hc
      have hcS : c ∈ S := mem_of_mem_erase hc
      have hne : c + t ≠ 0 := by
        intro h0
        exact (mem_erase.mp hc).1 (eq_neg_of_add_eq_zero_left h0)
      have hroot : (Hy.comp (X - C t)).eval (c + t) = 0 := by
        rw [hHy_comp_prod, eval_prod]
        exact Finset.prod_eq_zero hcS (by rw [eval_pow, eval_sub, eval_X, eval_C, sub_self, zero_pow (by have := hm_pos c hcS; omega)])
      rw [hfacB, eval_mul, eval_pow, eval_pow, eval_sub, eval_X, eval_C, sub_zero, pow_one] at hroot
      have hroot1 : (X ^ k + C u : (ZMod p)[X]).eval (c + t) = 0 :=
        eq_zero_of_pow_eq_zero ((mul_eq_zero.mp hroot).resolve_right hne)
      have hdvd1 : (X - C (c + t)) ∣ (X ^ k + C u) := dvd_iff_isRoot.mpr hroot1
      have hdvd2 : (X - C (c + t)) ^ 2 ∣ Hy.comp (X - C t) := by
        rw [hfacB]
        exact dvd_mul_of_dvd_left (pow_dvd_pow_of_dvd hdvd1 2) _
      have hcomp_ne : Hy.comp (X - C t) ≠ 0 := by
        rw [hHy_comp_prod]
        exact (monic_prod_of_monic _ _ (fun x _ => (monic_X_sub_C _).pow _)).ne_zero
      have hle := (le_rootMultiplicity_iff hcomp_ne).mpr hdvd2
      rw [hrm_eq c, if_pos hcS] at hle
      exact hle
    have hrest2 : ∀ c ∈ S.erase (-t), m c = 2 := by
      have hsum_er : ∑ c ∈ S.erase (-t), (m c - 2) = 0 := by
        have h1 := hm_sum
        rw [← Finset.add_sum_erase _ _ hm_nt.1, hm_nt.2] at h1
        have h2 : (∑ c ∈ S.erase (-t), (m c - 2)) + 2 * (S.erase (-t)).card =
            ∑ c ∈ S.erase (-t), m c := by
          have hcard2 : 2 * (S.erase (-t)).card = ∑ _ ∈ S.erase (-t), (2 : ℕ) := by
            simp [mul_comm]
          rw [hcard2, ← Finset.sum_add_distrib]
          refine Finset.sum_congr rfl fun c hc => ?_
          have := hge2 c hc
          omega
        rw [card_erase_of_mem hm_nt.1, hS_card] at h2
        omega
      intro c hc
      have h0 := (Finset.sum_eq_zero_iff.mp hsum_er) c hc
      have h2 := hge2 c hc
      omega
    refine ⟨?_, ?_⟩
    · intro c hc
      by_cases hct : c = -t
      · rw [hct, hm_nt.2]; omega
      · rw [hrest2 c (mem_erase.mpr ⟨hct, hc⟩)]
    · rw [← Finset.add_sum_erase _ _ hm_nt.1, hm_nt.2]
      simp only [Nat.sub_self, mul_zero, zero_add]
      rw [Finset.sum_congr rfl (fun c hc => by rw [hrest2 c hc])]
      simp [card_erase_of_mem hm_nt.1, hS_card, hdk, mul_comm]

end Problem2Aux

open Problem2Aux

theorem problem2 (p : ℕ) [Fact p.Prime] (hp : 2 < p)
    (f : ZMod p → ZMod p)
    (hf : ¬ ∃ a b : ZMod p, ∀ x, f x = a * x + b) :
    p + 3 ≤ 2 * Set.ncard {m : ZMod p |
      ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} := by
  classical
  have hp_prime : p.Prime := Fact.out
  set D : Finset (ZMod p) :=
    Finset.univ.filter (fun m => ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y))
  have hncard : Set.ncard {m : ZMod p | ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} = D.card := by
    rw [← Set.ncard_coe_finset D]
    congr 1
    ext m
    simp [D]
  rw [hncard]
  by_cases hp3 : p = 3
  · subst hp3
    have : 3 ≤ D.card := problem2_p3 f hf
    omega
  have hp5 : 5 ≤ p := by
    have hodd := hp_prime.eq_two_or_odd.resolve_left (by omega)
    omega
  have hp_odd : p % 2 = 1 := hp_prime.eq_two_or_odd.resolve_left (by omega)
  set k := (p - 1) / 2
  set d := (p + 1) / 2
  by_contra hlt
  push Not at hlt
  have hD_le : D.card ≤ d := by omega
  set Dc : Finset (ZMod p) := Finset.univ \ D
  set K := Dc.card
  have hDK : D.card + K = p := by
    have h1 : Dc.card + D.card = (Finset.univ : Finset (ZMod p)).card := by
      have := card_sdiff_add_card_eq_card (subset_univ D)
      simpa [Dc] using this
    rw [card_univ, ZMod.card] at h1
    change K + D.card = p at h1
    omega
  have hD_nonempty : D.Nonempty := by
    refine ⟨f 1 - f 0, ?_⟩
    simp only [D, mem_filter, mem_univ, true_and]
    exact ⟨1, 0, one_ne_zero, by ring⟩
  have hD_pos : 1 ≤ D.card := hD_nonempty.card_pos
  have hK_ge : k ≤ K := by omega
  have hK_lt : K < p := by omega
  have hpK_pos : 1 ≤ p - K := by omega
  have hmem_D : ∀ y : ZMod p, y ∈ D ↔ ¬ Function.Injective (fun x => f x - y * x) := by
    intro y
    simp only [D, mem_filter, mem_univ, true_and, Function.Injective]
    push Not
    constructor
    · rintro ⟨x1, x2, hne, heq⟩
      refine ⟨x1, x2, ?_, hne⟩
      linear_combination heq
    · rintro ⟨x1, x2, heq, hne⟩
      refine ⟨x1, x2, hne, ?_⟩
      linear_combination heq
  -- Bivariate Redei polynomial H ∈ (ZMod p)[Y][X]
  let L : ZMod p → (ZMod p)[X] := fun x => C (f x) - C x * X
  let H : ((ZMod p)[X])[X] := ∏ x : ZMod p, (X - C (L x))
  have hL_deg : ∀ x ∈ (Finset.univ : Finset (ZMod p)), (L x).natDegree ≤ 1 := by
    intro x _
    dsimp [L]
    refine (natDegree_sub_le _ _).trans (max_le ?_ ?_)
    · simp
    · exact (natDegree_C_mul_le x X).trans (by simp)
  have hH_bound : ∀ j, H.coeff j ≠ 0 → (H.coeff j).natDegree + j ≤ p := by
    intro j hj
    have := bivariate_coeff_deg_bound Finset.univ L hL_deg j hj
    simpa [ZMod.card] using this
  let Hy : ZMod p → (ZMod p)[X] := fun y => ∏ x : ZMod p, (X - C (f x - y * x))
  have hHy_map : ∀ y : ZMod p, H.map (evalRingHom y) = Hy y := by
    intro y
    dsimp [H, Hy, L]
    rw [Polynomial.map_prod]
    refine Finset.prod_congr rfl fun x _ => ?_
    simp only [Polynomial.map_sub, Polynomial.map_X, Polynomial.map_C,
      coe_evalRingHom, eval_sub, eval_C, eval_mul, eval_X, mul_comm x y]
  have hHy_coeff : ∀ y j, (Hy y).coeff j = (H.coeff j).eval y := by
    intro y j
    rw [← hHy_map y, coeff_map]
    rfl
  have hHy_monic : ∀ y, (Hy y).Monic := fun y =>
    monic_prod_of_monic _ _ (fun x _ => monic_X_sub_C _)
  have hHy_deg : ∀ y, (Hy y).natDegree = p := fun y => by
    rw [natDegree_prod_of_monic _ _ (fun x _ => monic_X_sub_C _)]
    simp only [natDegree_X_sub_C, sum_const, card_univ, ZMod.card, smul_eq_mul, mul_one]
  have hHy_Dc : ∀ y ∈ Dc, Hy y = X ^ p - X := by
    intro y hy
    have hnotD : y ∉ D := (mem_sdiff.mp hy).2
    have hinj : Function.Injective (fun x => f x - y * x) := by
      rw [hmem_D] at hnotD
      exact not_not.mp hnotD
    have hbij : Function.Bijective (fun x => f x - y * x) :=
      Finite.injective_iff_bijective.mp hinj
    dsimp [Hy]
    rw [Fintype.prod_bijective (fun x => f x - y * x) hbij
      (fun x => X - C (f x - y * x)) (fun c => X - C c) (fun _ => rfl)]
    exact prod_X_sub_C_univ p
  have hH_coeff_zero : ∀ j, p - K < j → j < p → H.coeff j = 0 := by
    intro j hj1 hj2
    by_contra hne
    have hdeg_lt : (H.coeff j).natDegree < K := by
      have := hH_bound j hne
      omega
    have hev : ∀ y ∈ Dc, (H.coeff j).eval y = 0 := by
      intro y hy
      rw [← hHy_coeff y j, hHy_Dc y hy, coeff_sub, coeff_X_pow, coeff_X,
        ite_eq_right (by omega), ite_eq_right (by omega), sub_self]
    have hle := card_le_natDegree_of_eval_zero hne Dc hev
    omega
  let g : ZMod p → (ZMod p)[X] := fun y => Hy y - X ^ p
  have hg_deg : ∀ y, (g y).natDegree ≤ p - K := by
    intro y
    rw [natDegree_le_iff_coeff_eq_zero]
    intro j hj
    dsimp [g]
    rw [coeff_sub]
    by_cases hjp : j = p
    · rw [hjp]
      have htop : (Hy y).coeff p = 1 := by
        simpa [hHy_deg y] using (hHy_monic y).coeff_natDegree
      rw [htop, coeff_X_pow_self, sub_self]
    · by_cases hjlt : j < p
      · rw [hHy_coeff y j, hH_coeff_zero j hj hjlt, eval_zero,
          coeff_X_pow, ite_eq_right hjp, sub_self]
      · rw [coeff_eq_zero_of_natDegree_lt (by rw [hHy_deg]; omega),
          coeff_X_pow, ite_eq_right hjp, sub_self]
  let S : ZMod p → Finset (ZMod p) := fun y => Finset.univ.image (fun x => f x - y * x)
  let m : ZMod p → ZMod p → ℕ := fun y c => (Finset.univ.filter (fun x => f x - y * x = c)).card
  let Ry : ZMod p → (ZMod p)[X] := fun y => ∏ c ∈ S y, (X - C c)
  let My : ZMod p → (ZMod p)[X] := fun y => ∏ c ∈ S y, (X - C c) ^ (m y c - 1)
  have hm_pos : ∀ y c, c ∈ S y → 1 ≤ m y c := by
    intro y c hc
    rcases mem_image.mp hc with ⟨x, _, rfl⟩
    exact Finset.card_pos.mpr ⟨x, mem_filter.mpr ⟨mem_univ x, rfl⟩⟩
  have hm_sum : ∀ y, ∑ c ∈ S y, m y c = p := by
    intro y
    have h := Finset.card_eq_sum_card_fiberwise (f := fun x : ZMod p => f x - y * x)
      (s := Finset.univ) (t := S y) (fun x hx => mem_image_of_mem _ hx)
    simpa [m, ZMod.card] using h.symm
  have hHy_fiber : ∀ y, Hy y = ∏ c ∈ S y, (X - C c) ^ (m y c) := by
    intro y
    dsimp [Hy]
    rw [← Finset.prod_fiberwise_of_maps_to (g := fun x : ZMod p => f x - y * x)
      (t := S y) (fun x hx => mem_image_of_mem _ hx)]
    refine Finset.prod_congr rfl fun c _ => ?_
    rw [Finset.prod_congr rfl (fun x hx => by rw [(mem_filter.mp hx).2]), Finset.prod_const]
  have hRy_deg : ∀ y, (Ry y).natDegree = (S y).card := fun y => by
    rw [natDegree_prod_of_monic _ _ (fun c _ => monic_X_sub_C c)]
    simp
  have hMy_deg : ∀ y, (My y).natDegree = p - (S y).card := fun y => by
    rw [natDegree_prod_of_monic _ _ (fun c _ => (monic_X_sub_C c).pow _)]
    have hsum1 : ∑ c ∈ S y, ((X - C c : (ZMod p)[X]) ^ (m y c - 1)).natDegree =
        ∑ c ∈ S y, (m y c - 1) := by
      refine Finset.sum_congr rfl fun c _ => ?_
      rw [natDegree_pow, natDegree_X_sub_C, mul_one]
    rw [hsum1]
    have hadd : (∑ c ∈ S y, (m y c - 1)) + (S y).card = ∑ c ∈ S y, m y c := by
      have hcard1 : (S y).card = ∑ _ ∈ S y, (1 : ℕ) := by simp
      rw [hcard1, ← Finset.sum_add_distrib]
      refine Finset.sum_congr rfl fun c hc => ?_
      have := hm_pos y c hc
      omega
    rw [hm_sum y] at hadd
    omega
  have hRy_dvd : ∀ y, Ry y ∣ g y + X := by
    intro y
    apply Finset.prod_dvd_of_coprime
    · intro c1 _ c2 _ hne
      exact isCoprime_X_sub_C_of_isUnit_sub (sub_ne_zero.mpr hne).isUnit
    · intro c hc
      rw [dvd_iff_isRoot, IsRoot.def]
      have hHy_c : (Hy y).eval c = 0 := by
        rw [hHy_fiber y, eval_prod]
        exact Finset.prod_eq_zero hc (by rw [eval_pow, eval_sub, eval_X, eval_C, sub_self, zero_pow (by have := hm_pos y c hc; omega)])
      simp [g, hHy_c, ZMod.pow_card]
  have hgX_ne : ∀ y ∈ D, g y + X ≠ 0 := by
    intro y hy h0
    have hEq : Hy y = X ^ p - X := by dsimp [g] at h0; linear_combination h0
    have hsurj : Function.Surjective (fun x => f x - y * x) := by
      intro c
      have hev : (Hy y).eval c = 0 := by
        rw [hEq, eval_sub, eval_pow, eval_X, ZMod.pow_card, sub_self]
      dsimp [Hy] at hev
      rw [eval_prod, Finset.prod_eq_zero_iff] at hev
      rcases hev with ⟨x, _, hx⟩
      rw [eval_sub, eval_X, eval_C, sub_eq_zero] at hx
      exact ⟨x, hx.symm⟩
    exact (hmem_D y).mp hy (Finite.injective_iff_surjective.mpr hsurj)
  have hderiv_Hy : ∀ y, derivative (Hy y) = derivative (g y) := by
    intro y
    have h1 : Hy y = X ^ p + g y := by dsimp [g]; ring
    rw [h1, derivative_add, derivative_X_pow]
    simp
  have hMy_dvd : ∀ y, My y ∣ derivative (g y) := by
    intro y
    rw [← hderiv_Hy y]
    apply Finset.prod_dvd_of_coprime
    · intro c1 _ c2 _ hne
      exact (isCoprime_X_sub_C_of_isUnit_sub (sub_ne_zero.mpr hne).isUnit).pow
    · intro c hc
      have hfac : Hy y = (X - C c) ^ (m y c) * ∏ c' ∈ (S y).erase c, (X - C c') ^ (m y c') := by
        rw [hHy_fiber y, ← Finset.mul_prod_erase _ _ hc]
      rw [hfac, derivative_mul, derivative_pow, derivative_sub, derivative_X, derivative_C,
        sub_zero, mul_one]
      apply dvd_add
      · exact dvd_mul_of_dvd_left (dvd_mul_of_dvd_right (dvd_refl _) _) _
      · exact dvd_mul_of_dvd_left (pow_dvd_pow _ (Nat.sub_le _ _)) _
  have hdg_ne : ∀ y, derivative (g y) ≠ 0 := by
    intro y h0
    have hcoeff0 : ∀ j, 1 ≤ j → (g y).coeff j = 0 := by
      intro j hj
      by_cases hjle : j ≤ p - K
      · have hjp : j < p := by omega
        have hjz : (j : ZMod p) ≠ 0 := by
          intro h
          have hdvd := (ZMod.natCast_eq_zero_iff j p).mp h
          have := Nat.le_of_dvd (by omega) hdvd
          omega
        have hc := congr_arg (fun F : (ZMod p)[X] => F.coeff (j - 1)) h0
        rw [coeff_derivative, coeff_zero] at hc
        have hsub : j - 1 + 1 = j := Nat.sub_add_cancel hj
        have hcast : ((j - 1 : ℕ) : ZMod p) + 1 = (j : ZMod p) := by
          simp [Nat.cast_sub hj]
        rw [hsub, hcast] at hc
        exact (mul_eq_zero.mp hc).resolve_right hjz
      · exact coeff_eq_zero_of_natDegree_lt (lt_of_le_of_lt (hg_deg y) (by omega))
    have hg_const : g y = C ((g y).coeff 0) := by
      ext j
      cases j with
      | zero => simp
      | succ n => rw [hcoeff0 (n + 1) (by omega), coeff_C, ite_eq_right (Nat.succ_ne_zero n)]
    set b : ZMod p := -(g y).coeff 0
    have hHy_pow : Hy y = (X - C b) ^ p := by
      rw [sub_pow_char, ← C_pow, ZMod.pow_card]
      have h1 : Hy y = X ^ p + g y := by dsimp [g]; ring
      rw [h1, hg_const]
      dsimp [b]
      simp [sub_eq_add_neg]
    apply hf
    refine ⟨y, b, fun x => ?_⟩
    have hev : (Hy y).eval (f x - y * x) = 0 := by
      dsimp [Hy]
      rw [eval_prod]
      exact Finset.prod_eq_zero (mem_univ x) (by simp)
    rw [hHy_pow, eval_pow, eval_sub, eval_X, eval_C] at hev
    have hsub0 : f x - y * x - b = 0 := eq_zero_of_pow_eq_zero hev
    linear_combination hsub0
  have hS_bounds : ∀ y ∈ D, K + 1 ≤ (S y).card ∧ (S y).card ≤ p - K := by
    intro y hy
    have hub : (S y).card ≤ p - K := by
      have h1 : (Ry y).natDegree ≤ (g y + X).natDegree :=
        natDegree_le_of_dvd (hRy_dvd y) (hgX_ne y hy)
      have h2 : (g y + X).natDegree ≤ p - K :=
        (natDegree_add_le _ _).trans (max_le (hg_deg y) (by rw [natDegree_X]; omega))
      rw [hRy_deg y] at h1
      omega
    have hlb : K + 1 ≤ (S y).card := by
      have h1 : (My y).natDegree ≤ (derivative (g y)).natDegree :=
        natDegree_le_of_dvd (hMy_dvd y) (hdg_ne y)
      have h2 : (derivative (g y)).natDegree ≤ (g y).natDegree - 1 := natDegree_derivative_le _
      have h3 : (g y).natDegree ≤ p - K := hg_deg y
      rw [hMy_deg y] at h1
      omega
    exact ⟨hlb, hub⟩
  obtain ⟨y₀, hy₀⟩ := hD_nonempty
  have hK_eq : K = k := by
    have ⟨h1, h2⟩ := hS_bounds y₀ hy₀
    omega
  have hD_card : D.card = d := by omega
  have hpK_eq : p - K = d := by omega
  have hD_classify : ∀ y ∈ D,
      let Sy := Finset.univ.image (fun x => f x - y * x)
      let my := fun c => (Finset.univ.filter (fun x => f x - y * x = c)).card
      ((∃ c ∈ Sy, my c = d) ∧ ∑ c ∈ Sy, my c * (my c - 1) = d * k) ∨
      ((∀ c ∈ Sy, my c ≤ 2) ∧ ∑ c ∈ Sy, my c * (my c - 1) = 2 * k) := by
    intro y hy
    have hSy_card : (S y).card = d := by
      have ⟨h1, h2⟩ := hS_bounds y hy
      omega
    have hgd : (Hy y - X ^ p).natDegree ≤ d := by
      rw [← hpK_eq]
      exact hg_deg y
    exact classify_direction p hp5 f y hSy_card hgd (hgX_ne y hy) (hdg_ne y)
  exact double_count_contradiction p hp5 f D
    (fun y => by simp [D]) hD_card hD_classify
