import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.Algebra.Order.Field.GeomSum
import Mathlib.Data.Int.Order.Units
import Mathlib.Tactic

set_option maxHeartbeats 4000000

open scoped BigOperators
open Finset Polynomial

private lemma re_lt_nine_of_aeval_eq_zero (f : ℤ[X])
    (hf : f ≠ 0) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    {z : ℂ} (hz : Polynomial.aeval z f = 0) : z.re < 9 := by
  by_contra! hz9
  have hR : 9 ≤ ‖z‖ := by
    exact hz9.trans (Complex.re_le_norm z)
  have hz0 : z ≠ 0 := by
    intro h
    norm_num [h] at hR
  have hn : 0 < f.natDegree :=
    Polynomial.natDegree_pos_of_aeval_root hf hz (by
      intro x hx
      change (x : ℂ) = 0 at hx
      exact_mod_cast hx)
  obtain ⟨k, hk⟩ := Nat.exists_eq_succ_of_ne_zero (Nat.ne_of_gt hn)
  have heval : (∑ i ∈ range k, (f.coeff i : ℂ) * z ^ i) +
      (f.coeff k : ℂ) * z ^ k + (f.coeff (k + 1) : ℂ) * z ^ (k + 1) = 0 := by
    have h := Polynomial.aeval_eq_sum_range (R := ℤ) (S := ℂ) (p := f) z
    rw [hz, hk] at h
    simp only [sum_range_succ, Algebra.smul_def] at h
    change 0 = (∑ i ∈ range k, (f.coeff i : ℂ) * z ^ i) +
      (f.coeff k : ℂ) * z ^ k + (f.coeff (k + 1) : ℂ) * z ^ (k + 1) at h
    exact h.symm
  have hmain : (f.coeff (k + 1) : ℂ) * z + f.coeff k =
      -(∑ i ∈ range k, (f.coeff i : ℂ) * z ^ i) / z ^ k := by
    apply (eq_div_iff (pow_ne_zero k hz0)).2
    have hzpow : z ^ (k + 1) = z ^ k * z := by ring
    rw [hzpow] at heval
    linear_combination heval
  have hmain' : (f.coeff (k + 1) : ℂ) * z + f.coeff k =
      -∑ i ∈ range k, (f.coeff i : ℂ) * (z⁻¹) ^ (k - i) := by
    rw [hmain, neg_div, Finset.sum_div]
    congr 1
    apply sum_congr rfl
    intro i hi
    rw [inv_pow_sub₀ hz0 (Nat.le_of_lt (mem_range.mp hi))]
    ring
  have hlead : 1 ≤ f.coeff (k + 1) := by
    have hne : f.coeff (k + 1) ≠ 0 := by
      rw [show k + 1 = f.natDegree by omega, coeff_natDegree]
      exact leadingCoeff_ne_zero.mpr hf
    have hnonneg := (hdigit (k + 1)).1
    omega
  have hleft : 9 ≤ ‖(f.coeff (k + 1) : ℂ) * z + f.coeff k‖ := by
    apply le_trans _ (Complex.re_le_norm _)
    simp only [Complex.add_re, Complex.mul_re, Complex.intCast_re, Complex.intCast_im,
      zero_mul, sub_zero]
    have hleadR : (1 : ℝ) ≤ f.coeff (k + 1) := by exact_mod_cast hlead
    have hk0 : (0 : ℝ) ≤ f.coeff k := by exact_mod_cast (hdigit k).1
    nlinarith
  let t : ℝ := ‖z‖⁻¹
  have ht : 0 < t := inv_pos.mpr (lt_of_lt_of_le (by norm_num) hR)
  have ht9 : t ≤ 1 / 9 := by
    dsimp [t]
    rw [inv_le_comm₀ (by positivity) (by norm_num)]
    simpa using hR
  have ht1 : t < 1 := ht9.trans_lt (by norm_num)
  have hright : ‖-∑ i ∈ range k, (f.coeff i : ℂ) * (z⁻¹) ^ (k - i)‖ ≤ 9 / 8 := by
    calc
      ‖-∑ i ∈ range k, (f.coeff i : ℂ) * (z⁻¹) ^ (k - i)‖ =
          ‖∑ i ∈ range k, (f.coeff i : ℂ) * (z⁻¹) ^ (k - i)‖ := norm_neg _
      _ ≤ ∑ i ∈ range k, ‖(f.coeff i : ℂ) * (z⁻¹) ^ (k - i)‖ := norm_sum_le _ _
      _ ≤ ∑ i ∈ range k, 9 * t ^ (k - i) := by
        apply sum_le_sum
        intro i hi
        have hc : ‖(f.coeff i : ℂ)‖ = (f.coeff i : ℝ) := by
          rw [Complex.norm_intCast, abs_of_nonneg]
          exact_mod_cast (hdigit i).1
        rw [norm_mul, norm_pow, norm_inv, hc]
        have hc9 : (f.coeff i : ℝ) ≤ 9 := by exact_mod_cast (hdigit i).2
        exact mul_le_mul_of_nonneg_right hc9 (pow_nonneg ht.le _)
      _ = 9 * t * ∑ i ∈ range k, t ^ i := by
        calc
          ∑ i ∈ range k, 9 * t ^ (k - i) =
              ∑ i ∈ range k, 9 * t * t ^ (k - 1 - i) := by
            apply sum_congr rfl
            intro i hi
            have hik := mem_range.mp hi
            have he : k - i = k - 1 - i + 1 := by omega
            rw [he, pow_succ]
            ring
          _ = 9 * t * ∑ i ∈ range k, t ^ (k - 1 - i) := by rw [Finset.mul_sum]
          _ = 9 * t * ∑ i ∈ range k, t ^ i := by
            exact congrArg (fun x => 9 * t * x)
              (Finset.sum_range_reflect (fun i => t ^ i) k)
      _ ≤ 9 * t * (1 - t)⁻¹ := by
        apply mul_le_mul_of_nonneg_left _ (by positivity)
        rw [range_eq_Ico]
        simpa only [pow_zero, one_div] using
          (geom_sum_Ico_le_of_lt_one (m := 0) (n := k) ht.le ht1)
      _ ≤ 9 / 8 := by
        rw [← div_eq_mul_inv, div_le_iff₀ (sub_pos.mpr ht1)]
        nlinarith
  rw [hmain'] at hleft
  linarith

private lemma one_lt_multiset_prod {s : Multiset ℝ} (hs : s ≠ 0)
    (h : ∀ a ∈ s, 1 < a) : 1 < s.prod := by
  induction s using Multiset.induction_on with
  | empty => exact (hs rfl).elim
  | @cons a s ih =>
    rw [Multiset.prod_cons]
    by_cases hs0 : s = 0
    · subst s
      simpa using h a (by simp)
    · have ha : 1 < a := h a (by simp)
      have hsp : 1 < s.prod := ih hs0 (fun b hb => h b (by simp [hb]))
      calc
        1 < a * 1 := by simpa using ha
        _ ≤ a * s.prod := mul_le_mul_of_nonneg_left hsp.le (by linarith)

private lemma one_lt_norm_ten_sub_of_mem_aroots (f : ℤ[X]) (hf : f ≠ 0)
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) {z : ℂ}
    (hz : z ∈ f.aroots ℂ) : 1 < ‖(10 : ℂ) - z‖ := by
  have hz0 : Polynomial.aeval z f = 0 := (Polynomial.mem_aroots.mp hz).2
  have hre := re_lt_nine_of_aeval_eq_zero f hf hdigit hz0
  apply lt_of_lt_of_le _ (Complex.re_le_norm ((10 : ℂ) - z))
  simp only [Complex.sub_re, Complex.re_ofNat]
  linarith

private lemma isUnit_of_eval_isUnit_of_mul_eq (f g h : ℤ[X]) (hf : f ≠ 0)
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hfg : f = g * h)
    (hg10 : IsUnit (g.eval 10)) : IsUnit g := by
  by_contra hg
  have hg0 : g ≠ 0 := by
    intro hzero
    subst g
    simp at hg10
  have hdeg : 0 < g.natDegree := by
    by_contra! hdeg
    have hdeg0 : g.natDegree = 0 := Nat.eq_zero_of_le_zero hdeg
    apply hg
    rw [eq_C_of_natDegree_eq_zero hdeg0]
    apply isUnit_C.mpr
    have he : g.eval 10 = g.coeff 0 := by
      simpa only [eval_C] using congrArg (Polynomial.eval 10) (eq_C_of_natDegree_eq_zero hdeg0)
    rwa [← he]
  have hroots : g.aroots ℂ ≠ 0 := by
    rw [← Multiset.card_pos, IsAlgClosed.card_aroots_eq_natDegree]
    exact hdeg
  have hprod : 1 < ‖((g.aroots ℂ).map ((10 : ℂ) - ·)).prod‖ := by
    rw [Multiset.norm_prod_map]
    apply one_lt_multiset_prod
    · simpa using hroots
    · intro a ha
      obtain ⟨z, hz, rfl⟩ := Multiset.mem_map.mp ha
      apply one_lt_norm_ten_sub_of_mem_aroots f hf hdigit
      rw [Polynomial.mem_aroots]
      refine ⟨hf, ?_⟩
      have hgz : Polynomial.aeval z g = 0 := (Polynomial.mem_aroots.mp hz).2
      rw [hfg, Polynomial.aeval_mul, hgz, zero_mul]
  have hsplit : (g.map (algebraMap ℤ ℂ)).Splits := IsAlgClosed.splits _
  have hleadmap : (g.map (algebraMap ℤ ℂ)).leadingCoeff = (g.leadingCoeff : ℂ) := by
    apply Polynomial.leadingCoeff_map_of_leadingCoeff_ne_zero
    change (g.leadingCoeff : ℂ) ≠ 0
    exact_mod_cast leadingCoeff_ne_zero.mpr hg0
  have heval : g.aeval (10 : ℂ) = (g.leadingCoeff : ℂ) *
      ((g.aroots ℂ).map ((10 : ℂ) - ·)).prod := by
    rw [← hleadmap]
    simpa only [Polynomial.eval_map_algebraMap, Polynomial.aroots_def] using
      hsplit.eval_eq_prod_roots (10 : ℂ)
  have heval10 : g.aeval (10 : ℂ) = ((Polynomial.eval (10 : ℤ) g : ℤ) : ℂ) := by
    simpa using Polynomial.aeval_algebraMap_apply_eq_algebraMap_eval (R := ℤ) (A := ℂ) (10 : ℤ) g
  have hgcast : ‖((Polynomial.eval (10 : ℤ) g : ℤ) : ℂ)‖ = 1 := by
    rw [Complex.norm_intCast]
    have habs : |((Polynomial.eval (10 : ℤ) g : ℤ) : ℝ)| = 1 := by
      exact_mod_cast Int.isUnit_iff_abs_eq.mp hg10
    exact habs
  have hlead : 1 ≤ ‖(g.leadingCoeff : ℂ)‖ := by
    rw [Complex.norm_intCast]
    have hne : g.leadingCoeff ≠ 0 := leadingCoeff_ne_zero.mpr hg0
    have hone : 1 ≤ |g.leadingCoeff| := by
      rw [Int.abs_eq_natAbs]
      exact_mod_cast Nat.one_le_iff_ne_zero.mpr (Int.natAbs_ne_zero.mpr hne)
    exact_mod_cast hone
  have hlarge : 1 < ‖g.aeval (10 : ℂ)‖ := by
    rw [heval, norm_mul]
    change 1 < ‖(g.leadingCoeff : ℂ)‖ * ‖((g.aroots ℂ).map ((10 : ℂ) - ·)).prod‖
    have hnonneg := mul_nonneg (sub_nonneg.mpr hlead) (sub_nonneg.mpr hprod.le)
    nlinarith
  rw [heval10, hgcast] at hlarge
  exact (lt_irrefl 1 hlarge)

open Polynomial in
theorem problem3 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf : f ≠ 0 := by
    intro hzero
    subst f
    simp at hp
  apply irreducible_iff.mpr
  constructor
  · intro hfu
    exact hp.not_isUnit (hfu.map (Polynomial.evalRingHom 10))
  · intro g h hfg
    have heval : f.eval 10 = g.eval 10 * h.eval 10 := by rw [hfg, eval_mul]
    rcases hp.irreducible.isUnit_or_isUnit heval with hg | hh
    · exact Or.inl (isUnit_of_eval_isUnit_of_mul_eq f g h hf hdigit hfg hg)
    · exact Or.inr (isUnit_of_eval_isUnit_of_mul_eq f h g hf hdigit
        (by simpa [mul_comm] using hfg) hh)

#print axioms problem3
