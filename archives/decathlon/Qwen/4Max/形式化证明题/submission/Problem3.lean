import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.Algebra.Polynomial.Splits
import Mathlib.Algebra.GeomSum
import Mathlib.RingTheory.Int.Basic

open Polynomial Finset

-- A finite geometric-sum bound: ∑_{j=0}^{m-1} (1/9)^{j+1} ≤ 1/8.
lemma geom_bound (m : ℕ) : ∑ j in range m, (1 / 9 : ℝ) ^ (j + 1) ≤ 1 / 8 := by
  have h : ∑ j in range m, (1 / 9 : ℝ) ^ (j + 1) =
      (1 / 9) * ∑ j in range m, (1 / 9 : ℝ) ^ j := by
    apply sum_congr rfl; intro j _; ring
  rw [h]
  have hsum : ∑ j in range m, (1 / 9 : ℝ) ^ j = ((1 / 9 : ℝ) ^ m - 1) / (1 / 9 - 1) := by
    rw [geom_sum_eq] <;> norm_num
  rw [hsum]
  have h9 : (1 / 9 : ℝ) - 1 = -(8 / 9) := by norm_num
  rw [h9]
  have : (1 / 9 : ℝ) * (((1 / 9 : ℝ) ^ m - 1) / (-(8 / 9))) =
      (1 - (1 / 9 : ℝ) ^ m) / 8 := by ring
  rw [this]
  have : 0 ≤ (1 / 9 : ℝ) ^ m := by positivity
  linarith

-- If every element of a nonempty multiset of complex numbers has abs > 1,
-- then the abs of the product is > 1.
lemma multiset_abs_prod_gt_one (s : Multiset ℂ)
    (h : ∀ z ∈ s, 1 < Complex.abs z) (hne : s ≠ 0) :
    1 < Complex.abs s.prod := by
  induction s using Multiset.induction_on with
  | empty => contradiction
  | cons a s ih =>
    rw [Multiset.prod_cons, Complex.abs.map_mul]
    have ha : 1 < Complex.abs a := h a (Multiset.mem_cons_self a s)
    have hs : 1 ≤ Complex.abs s.prod := by
      by_cases hs0 : s = 0
      · simp [hs0]
      · exact le_of_lt (ih (fun z hz => h z (Multiset.mem_cons.mpr (Or.inr hz))) hs0)
    calc (1 : ℝ) < Complex.abs a := ha
      _ ≤ Complex.abs a * Complex.abs s.prod :=
        le_mul_of_one_le_right (Complex.abs.nonneg a) hs

-- Every complex root of a digit-polynomial has real part < 9.
lemma root_re_lt_nine (f : ℤ[X]) (hf0 : f ≠ 0)
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (α : ℂ) (hroot : aeval α f = 0) :
    Complex.re α < 9 := by
  by_contra hre
  push Not at hre
  have hα0 : α ≠ 0 := by
    intro h; rw [h] at hre; simp at hre; linarith
  set n := f.natDegree
  have hn1 : 1 ≤ n := by
    by_contra h
    have hn0 : n = 0 := by omega
    have hfC : f = C (f.coeff 0) := eq_C_of_natDegree_eq_zero hn0
    have : f.coeff 0 = 0 := by
      have := congrArg (fun p => aeval α p) hfC
      simp at this
      simpa [hfC] using hroot
    have : f = 0 := by rw [hfC, this]; simp
    contradiction
  set β := α⁻¹
  have hβ : α * β = 1 := by field_simp [β, hα0]
  have hβabs : Complex.abs β ≤ 1 / 9 := by
    have hαabs : (9 : ℝ) ≤ Complex.abs α := by
      calc (9 : ℝ) ≤ Complex.re α := hre
        _ ≤ Complex.abs α := Complex.re_le_abs α
    have : Complex.abs β = 1 / Complex.abs α := by
      simp [β, Complex.abs.inv, inv_eq_one_div]
    rw [this]
    exact one_div_le_one_div_of_le (by norm_num) hαabs
  -- the leading coefficient is a positive integer, hence ≥ 1
  have hlead : 1 ≤ f.leadingCoeff := by
    have hd := hdigit n
    have hne : f.coeff n ≠ 0 := leadingCoeff_ne_zero.mpr hf0
    have : 0 < f.coeff n := by
      by_contra h; have : f.coeff n = 0 := by linarith [hd.1]; contradiction
    have : f.leadingCoeff = f.coeff n := by simp [n, leadingCoeff]
    linarith
  -- Expand f(α) = 0, multiply by β^(n-1), and peel off the top two terms.
  have hsum : ∑ i in range (n + 1), (f.coeff i : ℂ) * α ^ i = 0 := by
    have h := aeval_eq_sum_range (R := ℤ) (S := ℂ) α f
    simp only [n] at h
    rw [← h]
    exact hroot
  have hsum' : ∑ i in range (n + 1), (f.coeff i : ℂ) * α ^ i * β ^ (n - 1) = 0 := by
    rw [← sum_mul, hsum, zero_mul]
  have hpow_n : α ^ n * β ^ (n - 1) = α := by
    calc α ^ n * β ^ (n - 1) = α ^ (n - 1) * α * β ^ (n - 1) := by
        rw [show n = (n - 1) + 1 by omega, pow_succ]
      _ = α * (α * β) ^ (n - 1) := by rw [mul_pow]; ring
      _ = α := by rw [hβ, one_pow]; ring
  have hpow_n1 : α ^ (n - 1) * β ^ (n - 1) = 1 := by
    rw [← mul_pow, hβ, one_pow]
  have hpow_i (i : ℕ) (hi : i < n - 1) : α ^ i * β ^ (n - 1) = β ^ (n - 1 - i) := by
    have hle : i ≤ n - 1 := by omega
    calc α ^ i * β ^ (n - 1) = α ^ i * (β ^ i * β ^ (n - 1 - i)) := by
        rw [show n - 1 = i + (n - 1 - i) by omega, pow_add]
      _ = (α * β) ^ i * β ^ (n - 1 - i) := by rw [← mul_pow]; ring
      _ = β ^ (n - 1 - i) := by rw [hβ, one_pow, one_mul]
  have hpeel : ∑ i in range (n + 1), (f.coeff i : ℂ) * α ^ i * β ^ (n - 1) =
      (f.coeff n : ℂ) * α + (f.coeff (n - 1) : ℂ) +
        ∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i) := by
    have hn2 : n + 1 = (n - 1) + 2 := by omega
    rw [hn2]
    simp only [sum_range_succ, sum_range_succ]
    have h1 : (f.coeff ((n - 1) + 1) : ℂ) * α ^ ((n - 1) + 1) * β ^ (n - 1) =
        (f.coeff n : ℂ) * α := by
      have : (n - 1) + 1 = n := by omega
      simp only [this]; rw [hpow_n]; ring
    have h2 : (f.coeff (n - 1) : ℂ) * α ^ (n - 1) * β ^ (n - 1) = (f.coeff (n - 1) : ℂ) := by
      rw [hpow_n1]; ring
    have h3 : ∑ i in range (n - 1), (f.coeff i : ℂ) * α ^ i * β ^ (n - 1) =
        ∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i) := by
      apply sum_congr rfl; intro i hi
      rw [hpow_i i (mem_range.mp hi)]; ring
    simp only [h1, h2, h3]; ring
  have heq : (f.leadingCoeff : ℂ) * α + (f.coeff (n - 1) : ℂ) =
      -∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i) := by
    have hcn : (f.coeff n : ℂ) = (f.leadingCoeff : ℂ) := by simp [n, leadingCoeff]
    rw [← hcn]
    linarith [hsum', hpeel]
  -- lower bound on the LHS
  set L := (f.leadingCoeff : ℝ) * Complex.re α + (f.coeff (n - 1) : ℝ)
  have hLHS : (9 : ℝ) ≤ L := by
    have h1 : (1 : ℝ) ≤ f.leadingCoeff := by exact_mod_cast hlead
    have h2 : (0 : ℝ) ≤ f.coeff (n - 1) := by exact_mod_cast (hdigit (n - 1)).1
    nlinarith
  -- the real part of the RHS sum is -L
  have hReS : Complex.re (∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i)) = -L := by
    have := congrArg Complex.re heq
    simp only [L, Complex.re_add, Complex.re_mul, Complex.re_neg, Complex.re_sum,
      Complex.re_intCast, Complex.im_intCast, mul_zero, sub_zero, zero_mul,
      Complex.re_natCast] at this ⊢
    linarith
  -- upper bound on the absolute value of the RHS sum
  have hRHS : Complex.abs (∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i)) ≤ 9 / 8 := by
    calc Complex.abs (∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i))
        ≤ ∑ i in range (n - 1), Complex.abs ((f.coeff i : ℂ) * β ^ (n - 1 - i)) :=
          Complex.abs.sum_le _ _
      _ = ∑ i in range (n - 1), Complex.abs (f.coeff i : ℂ) * Complex.abs β ^ (n - 1 - i) := by
          apply sum_congr rfl; intro i _
          rw [Complex.abs.map_mul, Complex.abs.map_pow]
      _ ≤ ∑ i in range (n - 1), 9 * (1 / 9 : ℝ) ^ (n - 1 - i) := by
          apply sum_le_sum; intro i _
          have hci : Complex.abs (f.coeff i : ℂ) ≤ 9 := by
            have hd := hdigit i
            have : Complex.abs (f.coeff i : ℂ) = |(f.coeff i : ℝ)| := by
              simp [Complex.abs_ofReal]
            rw [this]
            exact abs_le.mpr ⟨by linarith [hd.1], by linarith [hd.2]⟩
          have hb : Complex.abs β ^ (n - 1 - i) ≤ (1 / 9 : ℝ) ^ (n - 1 - i) := by
            gcongr
          have hnon : 0 ≤ Complex.abs β ^ (n - 1 - i) := by positivity
          nlinarith
      _ = 9 * ∑ i in range (n - 1), (1 / 9 : ℝ) ^ (n - 1 - i) := by rw [sum_mul]
      _ ≤ 9 * (1 / 8) := by
          gcongr
          have hreidx : ∑ i in range (n - 1), (1 / 9 : ℝ) ^ (n - 1 - i) =
              ∑ j in range (n - 1), (1 / 9 : ℝ) ^ (j + 1) := by
            apply sum_bij' (fun i _ => n - 2 - i) (fun j _ => n - 2 - j)
            <;> simp_all [mem_range]
            <;> omega
          rw [hreidx]
          exact geom_bound (n - 1)
      _ = 9 / 8 := by ring
  -- |Re S| ≤ |S|, and |Re S| = L since L ≥ 9 > 0
  have hge : L ≤ Complex.abs (∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i)) := by
    have h1 : Complex.abs (Complex.re (∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i))) ≤
        Complex.abs (∑ i in range (n - 1), (f.coeff i : ℂ) * β ^ (n - 1 - i)) :=
      Complex.abs_re_le_abs _
    rw [hReS] at h1
    have hLnonneg : 0 ≤ L := by linarith
    simp only [abs_neg, abs_of_nonneg hLnonneg] at h1
    exact h1
  linarith

open Polynomial in
theorem problem3 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  sorry
