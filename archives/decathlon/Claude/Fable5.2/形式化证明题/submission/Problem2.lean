import Mathlib.FieldTheory.Finite.Basic
import Mathlib.LinearAlgebra.Lagrange
import Mathlib.Data.Set.Card
import Mathlib.Data.Nat.Prime.Factorial

open Polynomial Finset

namespace Problem2

variable {p : ℕ} [Fact p.Prime]

lemma sum_pow_top : ∑ x : ZMod p, x ^ (p - 1) = -1 := by
  have hp : 1 ≤ p := (Fact.out : p.Prime).one_lt.le
  simp_rw [ZMod.pow_card_sub_one]
  rw [Finset.sum_ite, Finset.sum_const_zero, add_zero, Finset.sum_const, nsmul_eq_mul, mul_one,
    Finset.filter_ne', Finset.card_erase_of_mem (Finset.mem_univ _), Finset.card_univ, ZMod.card,
    Nat.cast_sub hp]
  simp

lemma sum_eval (g : (ZMod p)[X]) (hg : g.natDegree < p) :
    ∑ x : ZMod p, g.eval x = - g.coeff (p - 1) := by
  have hp : 1 ≤ p := (Fact.out : p.Prime).one_lt.le
  simp_rw [eval_eq_sum_range' hg]
  rw [Finset.sum_comm]
  simp_rw [← Finset.mul_sum]
  rw [Finset.sum_eq_single (p - 1)]
  · rw [sum_pow_top, mul_neg, mul_one]
  · intro k hk hne
    have hk' : k < p - 1 := by have := Finset.mem_range.1 hk; omega
    rw [FiniteField.sum_pow_lt_card_sub_one (ZMod p) k (by rw [ZMod.card]; exact hk'), mul_zero]
  · intro h; exact absurd (Finset.mem_range.2 (by omega)) h

lemma choose_ne_zero (k j : ℕ) (hjk : j ≤ k) (hk : k < p) : (Nat.choose k j : ZMod p) ≠ 0 := by
  intro h
  rw [ZMod.natCast_eq_zero_iff] at h
  have h1 : p ∣ k.factorial := by
    rw [← Nat.choose_mul_factorial_mul_factorial hjk]
    exact Dvd.dvd.mul_right (Dvd.dvd.mul_right h _) _
  have hpp : Nat.Prime p := Fact.out
  have := (Nat.Prime.dvd_factorial hpp).1 h1
  omega

lemma key (f : ZMod p → ZMod p) (hp3 : 2 < p)
    (hN : 2 * Set.ncard {m : ZMod p | ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} ≤ p + 1)
    (k : ℕ) (hk1 : 1 ≤ k) (hk2 : 2 * k ≤ p - 1) (j : ℕ) (hj : j ≤ k) :
    ∑ x : ZMod p, x ^ j * f x ^ (k - j) = 0 := by
  set M : Set (ZMod p) := {m : ZMod p | ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)}
    with hMdef
  have hkp : k < p - 1 := by omega
  have hsumk : ∑ y : ZMod p, y ^ k = 0 :=
    FiniteField.sum_pow_lt_card_sub_one (ZMod p) k (by rw [ZMod.card]; exact hkp)
  -- coefficients
  set c : ℕ → ZMod p :=
    fun j => ∑ x : ZMod p, (-x) ^ j * f x ^ (k - j) * (Nat.choose k j : ZMod p) with hc
  have hck : c k = 0 := by
    simp only [hc, Nat.sub_self, pow_zero, mul_one, Nat.choose_self, Nat.cast_one]
    have : ∑ x : ZMod p, (-x) ^ k = (-1) ^ k * ∑ x : ZMod p, x ^ k := by
      rw [Finset.mul_sum]
      refine Finset.sum_congr rfl (fun x _ => ?_)
      rw [← mul_pow]; simp
    rw [this, hsumk, mul_zero]
  set P : (ZMod p)[X] := ∑ j ∈ Finset.range k, C (c j) * X ^ j with hP
  have hPeval : ∀ m : ZMod p, P.eval m = ∑ x : ZMod p, (f x - m * x) ^ k := by
    intro m
    have h1 : P.eval m = ∑ j ∈ Finset.range (k + 1), c j * m ^ j := by
      rw [Finset.sum_range_succ, hck, zero_mul, add_zero]
      simp [hP, eval_finsetSum]
    rw [h1]
    simp only [hc, Finset.sum_mul]
    rw [Finset.sum_comm]
    refine Finset.sum_congr rfl (fun x _ => ?_)
    have : f x - m * x = (-(m * x)) + f x := by ring
    rw [this, add_pow]
    refine Finset.sum_congr rfl (fun j _ => ?_)
    rw [show -(m * x) = (-x) * m by ring, mul_pow]
    ring
  have hroot : ∀ m, m ∉ M → P.eval m = 0 := by
    intro m hm
    rw [hPeval]
    have hinj : Function.Injective (fun x : ZMod p => f x - m * x) := by
      intro x y hxy
      by_contra hne
      apply hm
      refine ⟨x, y, hne, ?_⟩
      simp only at hxy
      linear_combination hxy
    have hbij : Function.Bijective (fun x : ZMod p => f x - m * x) := hinj.bijective_of_finite
    rw [Function.Bijective.sum_comp hbij (fun y => y ^ k)]
    exact hsumk
  have hP0 : P = 0 := by
    by_contra hPne
    have hdeg : P.natDegree ≤ k - 1 := by
      apply natDegree_sum_le_of_forall_le
      intro j hj
      have := Finset.mem_range.1 hj
      exact (natDegree_C_mul_X_pow_le _ _).trans (by omega)
    have hsub : Mᶜ ⊆ ↑(P.roots.toFinset) := by
      intro m hm
      simp only [Finset.mem_coe, Multiset.mem_toFinset]
      rw [mem_roots hPne]
      exact hroot m hm
    have h1 : Mᶜ.ncard ≤ P.roots.toFinset.card := by
      have := Set.ncard_le_ncard hsub (Finset.finite_toSet _)
      rwa [Set.ncard_coe_finset] at this
    have h2 : P.roots.toFinset.card ≤ P.natDegree :=
      (Multiset.toFinset_card_le _).trans (card_roots' P)
    have h3 : M.ncard + Mᶜ.ncard = p := by
      rw [Set.ncard_add_ncard_compl, Nat.card_zmod]
    omega
  have hcj : c j = 0 := by
    rcases Nat.lt_or_ge j k with h | h
    · have : P.coeff j = c j := by
        rw [hP, finsetSum_coeff]
        simp only [coeff_C_mul_X_pow]
        rw [Finset.sum_eq_single j]
        · simp
        · intro i _ hij
          simp [Ne.symm hij]
        · intro hj'
          exact absurd (Finset.mem_range.2 h) hj'
      rw [← this, hP0, coeff_zero]
    · have : j = k := le_antisymm hj h
      rw [this]; exact hck
  simp only [hc] at hcj
  rw [← Finset.sum_mul] at hcj
  have h2 := (mul_eq_zero.1 hcj).resolve_right (choose_ne_zero k j hj (by omega))
  have h3 : ∑ x : ZMod p, (-x) ^ j * f x ^ (k - j)
      = (-1) ^ j * ∑ x : ZMod p, x ^ j * f x ^ (k - j) := by
    rw [Finset.mul_sum]
    refine Finset.sum_congr rfl (fun x _ => ?_)
    rw [neg_pow]; ring
  rw [h3] at h2
  exact (mul_eq_zero.1 h2).resolve_left (pow_ne_zero _ (neg_ne_zero.2 one_ne_zero))

lemma arith (P d : ℕ) (hP : P % 2 = 0) (hd2 : 2 ≤ d) (hdP : d ≤ P) :
    2 * (P % d + P / d) ≤ P := by
  have h1 : P % d + d * (P / d) = P := Nat.mod_add_div P d
  have h2 : P % d < d := Nat.mod_lt _ (by omega)
  have hj : 1 ≤ P / d := Nat.div_pos hdP (by omega)
  generalize P / d = j at *
  generalize P % d = i at *
  rcases Nat.lt_or_ge j 2 with hj2 | hj2
  · have : j = 1 := by omega
    subst this
    rw [mul_one] at h1
    omega
  · rcases Nat.lt_or_ge d 3 with hd3 | hd3
    · have : d = 2 := by omega
      subst this
      omega
    · have h3 : (d - 2) * 2 ≤ (d - 2) * j := Nat.mul_le_mul_left _ hj2
      have h4 : d * j = (d - 2) * j + 2 * j := by
        rw [← Nat.add_mul]
        congr 1
        omega
      generalize (d - 2) * j = t at *
      generalize d * j = s at *
      omega

theorem main (p : ℕ) [Fact p.Prime] (hp : 2 < p)
    (f : ZMod p → ZMod p)
    (hf : ¬ ∃ a b : ZMod p, ∀ x, f x = a * x + b) :
    p + 3 ≤ 2 * Set.ncard {m : ZMod p |
      ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} := by
  by_contra hcon
  have hpp : p.Prime := Fact.out
  have hodd : p % 2 = 1 := by
    rcases hpp.eq_two_or_odd with h | h <;> omega
  have hN : 2 * Set.ncard {m : ZMod p | ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)}
      ≤ p + 1 := by
    omega
  -- interpolation polynomial
  set F : (ZMod p)[X] := Lagrange.interpolate Finset.univ id f with hF
  have hFeval : ∀ x, F.eval x = f x := fun x =>
    Lagrange.eval_interpolate_at_node (v := (id : ZMod p → ZMod p)) f
      (Set.injOn_id _) (Finset.mem_univ x)
  have hFdeg : F.natDegree < p := by
    have h := Lagrange.degree_interpolate_lt (s := Finset.univ)
      (v := (id : ZMod p → ZMod p)) f (Set.injOn_id _)
    rw [Finset.card_univ, ZMod.card] at h
    by_cases h0 : F = 0
    · rw [h0]; simp; exact hpp.pos
    · exact (natDegree_lt_iff_degree_lt h0).2 h
  have hd2 : 2 ≤ F.natDegree := by
    by_contra h
    have h1 : F.natDegree ≤ 1 := by omega
    apply hf
    refine ⟨F.coeff 1, F.coeff 0, fun x => ?_⟩
    rw [← hFeval x]
    conv_lhs => rw [eq_X_add_C_of_natDegree_le_one h1]
    simp
  have hF0 : F ≠ 0 := by
    intro h; rw [h] at hd2; simp at hd2
  set d := F.natDegree with hd
  set j := (p - 1) / d with hj
  set i := (p - 1) % d with hi
  have hij : i + d * j = p - 1 := Nat.mod_add_div (p - 1) d
  have har : 2 * (i + j) ≤ p - 1 := arith (p - 1) d (by omega) hd2 (by omega)
  have hj1 : 1 ≤ j := Nat.div_pos (by omega) (by omega)
  -- the polynomial X^i * F^j
  set g : (ZMod p)[X] := X ^ i * F ^ j with hg
  have hg0 : g ≠ 0 := mul_ne_zero (pow_ne_zero _ X_ne_zero) (pow_ne_zero _ hF0)
  have hgdeg : g.natDegree = p - 1 := by
    rw [hg, natDegree_mul (pow_ne_zero _ X_ne_zero) (pow_ne_zero _ hF0), natDegree_X_pow,
      natDegree_pow, ← hd, mul_comm j d]
    exact hij
  have hsum := sum_eval g (by rw [hgdeg]; omega)
  have hsum0 : ∑ x : ZMod p, g.eval x = 0 := by
    have hk := key f hp hN (i + j) (by omega) har i (by omega)
    rw [← hk]
    refine Finset.sum_congr rfl (fun x _ => ?_)
    rw [hg, eval_mul, eval_pow, eval_pow, eval_X, hFeval, Nat.add_sub_cancel_left]
  rw [hsum0] at hsum
  have hlead : g.coeff (p - 1) ≠ 0 := by
    rw [← hgdeg, coeff_natDegree]
    exact leadingCoeff_ne_zero.2 hg0
  exact hlead (neg_eq_zero.1 hsum.symm)

end Problem2

theorem problem2 (p : ℕ) [Fact p.Prime] (hp : 2 < p)
    (f : ZMod p → ZMod p)
    (hf : ¬ ∃ a b : ZMod p, ∀ x, f x = a * x + b) :
    p + 3 ≤ 2 * Set.ncard {m : ZMod p |
      ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} := 
  Problem2.main p hp f hf

#print axioms problem2
