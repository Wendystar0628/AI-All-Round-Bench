import Mathlib.Algebra.Polynomial.Reverse
import Mathlib.Algebra.Polynomial.Splits
import Mathlib.Algebra.Order.Field.GeomSum
import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.RingTheory.PrincipalIdealDomain
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.NormNum
import Mathlib.Tactic.Positivity

open Polynomial

private lemma digitPolynomial_root_far (f : ℤ[X])
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf : f ≠ 0)
    {z : ℂ} (hz : (f.map (Int.castRingHom ℂ)).eval z = 0) :
    1 < ‖10 - z‖ := by
  by_contra hfar
  have hdist : ‖10 - z‖ ≤ 1 := le_of_not_gt hfar
  have hz_norm : 9 ≤ ‖z‖ := by
    have htri := norm_sub_norm_le (10 : ℂ) z
    norm_num at htri
    linarith
  have hz_re : 9 ≤ z.re := by
    have hre := Complex.abs_re_le_norm (10 - z)
    simp only [Complex.sub_re] at hre
    have := hre.trans hdist
    rw [abs_le] at this
    norm_num at this
    linarith
  have hz0 : z ≠ 0 := by
    intro h
    subst z
    norm_num at hz_norm
  let q : ℂ[X] := f.reverse.map (Int.castRingHom ℂ)
  have hq0 : q ≠ 0 := by
    change f.reverse.map (Int.castRingHom ℂ) ≠ 0
    intro h
    have hr : f.reverse.map (Int.castRingHom ℂ) =
        (0 : ℤ[X]).map (Int.castRingHom ℂ) := by simpa using h
    have := Polynomial.map_injective (Int.castRingHom ℂ) Int.cast_injective hr
    exact hf (Polynomial.reverse_eq_zero.mp this)
  letI : Invertible z := invertibleOfNonzero hz0
  have hinv : ⅟z = z⁻¹ := invOf_eq_inv z
  have hqroot : q.eval z⁻¹ = 0 := by
    rw [← hinv]
    simpa [q, eval_map] using
      ((Polynomial.eval₂_reverse_eq_zero_iff (Int.castRingHom ℂ) z f).mpr (by
        simpa [eval_map] using hz))
  obtain ⟨k, hk⟩ := Nat.exists_eq_succ_of_ne_zero
    (ne_of_gt (Polynomial.natDegree_pos_of_eval₂_root hq0 (RingHom.id ℂ) hqroot
      (fun x hx ↦ hx)))
  have hcoeff (i : ℕ) : 0 ≤ (q.coeff i).re ∧ ‖q.coeff i‖ ≤ 9 := by
    simp only [q, coeff_map, Complex.ofReal_intCast, Complex.norm_intCast,
      Complex.intCast_re, coeff_reverse]
    have hi := hdigit (revAt f.natDegree i)
    constructor
    · change 0 ≤ ((f.coeff (revAt f.natDegree i) : ℤ) : ℝ)
      exact_mod_cast hi.1
    · change ‖((f.coeff (revAt f.natDegree i) : ℤ) : ℂ)‖ ≤ 9
      rw [Complex.norm_intCast, abs_of_nonneg]
      exact_mod_cast hi.2
      exact_mod_cast hi.1
  have hconst : 1 ≤ (q.coeff 0).re := by
    simp only [q, coeff_map, Complex.ofReal_intCast, Complex.intCast_re, coeff_zero_reverse,
      leadingCoeff]
    change (1 : ℝ) ≤ (f.coeff f.natDegree : ℤ)
    have hlead := (hdigit f.natDegree).1
    have hne : f.coeff f.natDegree ≠ 0 := by
      rw [coeff_natDegree]
      exact leadingCoeff_ne_zero.mpr hf
    exact_mod_cast (show (1 : ℤ) ≤ f.coeff f.natDegree by omega)
  have ht_norm : ‖z⁻¹‖ ≤ (1 / 9 : ℝ) := by
    rw [norm_inv]
    simpa only [one_div] using
      ((inv_le_inv₀ (norm_pos_iff.mpr hz0) (by norm_num : (0 : ℝ) < 9)).2 hz_norm)
  have ht_re : 0 ≤ (z⁻¹).re := by
    rw [Complex.inv_re]
    exact div_nonneg (hz_re.trans' (by norm_num)) (Complex.normSq_nonneg _)
  have hexpand :
      q.eval z⁻¹ = q.coeff 0 + q.coeff 1 * z⁻¹ +
        ∑ i ∈ Finset.range k, q.coeff (i + 2) * z⁻¹ ^ (i + 2) := by
    rw [Polynomial.eval_eq_sum_range, hk]
    simp only [Finset.sum_range_succ', pow_zero, mul_one, pow_one]
    ring
  rw [hexpand] at hqroot
  have htail_norm :
      ‖∑ i ∈ Finset.range k, q.coeff (i + 2) * z⁻¹ ^ (i + 2)‖ ≤ (1 / 8 : ℝ) := by
    calc
      _ ≤ ∑ i ∈ Finset.range k, ‖q.coeff (i + 2) * z⁻¹ ^ (i + 2)‖ := norm_sum_le _ _
      _ ≤ ∑ i ∈ Finset.range k, 9 * (1 / 9 : ℝ) ^ (i + 2) := by
        gcongr with i hi
        rw [norm_mul, norm_pow]
        calc
          ‖q.coeff (i + 2)‖ * ‖z⁻¹‖ ^ (i + 2)
              ≤ 9 * ‖z⁻¹‖ ^ (i + 2) := by gcongr; exact (hcoeff _).2
          _ ≤ 9 * (1 / 9 : ℝ) ^ (i + 2) := by
            gcongr
      _ = 9 * ∑ i ∈ Finset.range k, (1 / 9 : ℝ) ^ (i + 2) := by rw [Finset.mul_sum]
      _ ≤ 9 * ((1 / 9 : ℝ) ^ 2 / (1 - 1 / 9)) := by
        gcongr
        have hgeo := geom_sum_Ico_le_of_lt_one (x := (1 / 9 : ℝ))
          (m := 2) (n := k + 2) (by positivity) (by norm_num)
        rw [Finset.sum_Ico_eq_sum_range] at hgeo
        simpa only [Nat.add_sub_cancel, add_comm] using hgeo
      _ = 1 / 8 := by norm_num
  have htail_re :
      -(1 / 8 : ℝ) ≤
        (∑ i ∈ Finset.range k, q.coeff (i + 2) * z⁻¹ ^ (i + 2)).re := by
    have hre := (Complex.abs_re_le_norm
      (∑ i ∈ Finset.range k, q.coeff (i + 2) * z⁻¹ ^ (i + 2))
      ).trans htail_norm
    exact neg_le_of_abs_le hre
  have hlinear : 0 ≤ (q.coeff 1 * z⁻¹).re := by
    rw [Complex.mul_re]
    have him : (q.coeff 1).im = 0 := by
      simp [q, coeff_reverse]
    rw [him, zero_mul, sub_zero]
    exact mul_nonneg (hcoeff 1).1 ht_re
  have := congrArg Complex.re hqroot
  simp only [map_zero, Complex.zero_re, Complex.add_re] at this
  linarith

private lemma one_lt_multiset_prod {s : Multiset ℝ} (hs : s ≠ 0)
    (h : ∀ x ∈ s, 1 < x) : 1 < s.prod := by
  induction s using Multiset.induction_on with
  | empty => exact (hs rfl).elim
  | cons a s ih =>
      by_cases hs0 : s = 0
      · subst s
        simpa using h a (by simp)
      · rw [Multiset.prod_cons]
        exact one_lt_mul_of_lt_of_le (h a (by simp))
          (ih hs0 (fun x hx ↦ h x (by simp [hx]))).le

private lemma digitPolynomial_factor_isUnit (f : ℤ[X])
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf : f ≠ 0)
    {g : ℤ[X]} (hgf : g ∣ f) (hgu : IsUnit (g.eval 10)) : IsUnit g := by
  by_contra hgnu
  have hgdeg : 0 < g.natDegree := by
    by_contra h
    have hg0 : g.natDegree = 0 := Nat.eq_zero_of_not_pos h
    have hgC := Polynomial.eq_C_of_natDegree_eq_zero hg0
    have hc : IsUnit (g.coeff 0) := by
      rw [hgC] at hgu
      simpa using hgu
    apply hgnu
    rw [hgC]
    exact hc.map Polynomial.C.toMonoidHom
  let G : ℂ[X] := g.map (Int.castRingHom ℂ)
  let F : ℂ[X] := f.map (Int.castRingHom ℂ)
  have hG0 : G ≠ 0 := by
    intro h
    have heq : g.map (Int.castRingHom ℂ) =
        (0 : ℤ[X]).map (Int.castRingHom ℂ) := by simpa [G] using h
    have : g = 0 := Polynomial.map_injective (Int.castRingHom ℂ) Int.cast_injective heq
    subst g
    simp at hgdeg
  have hF0 : F ≠ 0 := by
    intro h
    have heq : f.map (Int.castRingHom ℂ) =
        (0 : ℤ[X]).map (Int.castRingHom ℂ) := by simpa [F] using h
    exact hf (Polynomial.map_injective (Int.castRingHom ℂ) Int.cast_injective heq)
  have hGdvdF : G ∣ F := by
    exact Polynomial.map_dvd (Int.castRingHom ℂ) hgf
  have hsplit : G.Splits := IsAlgClosed.splits G
  have hGdeg : G.natDegree = g.natDegree := by
    exact Polynomial.natDegree_map_eq_of_injective Int.cast_injective g
  have hroots0 : G.roots ≠ 0 := by
    intro h
    have hc := hsplit.natDegree_eq_card_roots
    rw [hGdeg, h, Multiset.card_zero] at hc
    omega
  have hrootfar : ∀ z ∈ G.roots, 1 < ‖(10 : ℂ) - z‖ := by
    intro z hz
    apply digitPolynomial_root_far f hdigit hf
    have hzG : G.IsRoot z := (Polynomial.mem_roots hG0).mp hz
    have hzF : F.IsRoot z := hzG.dvd hGdvdF
    exact hzF
  let distances : Multiset ℝ := G.roots.map (fun z ↦ ‖(10 : ℂ) - z‖)
  have hdistances0 : distances ≠ 0 := by simp [distances, hroots0]
  have hprod : 1 < distances.prod := by
    apply one_lt_multiset_prod hdistances0
    intro x hx
    simp only [distances, Multiset.mem_map] at hx
    obtain ⟨z, hz, rfl⟩ := hx
    exact hrootfar z hz
  have hglead0 : g.leadingCoeff ≠ 0 := leadingCoeff_ne_zero.mpr (by
    intro h
    subst g
    simp at hgdeg)
  have hlead : 1 ≤ ‖G.leadingCoeff‖ := by
    rw [show G.leadingCoeff = ((g.leadingCoeff : ℤ) : ℂ) by
      exact Polynomial.leadingCoeff_map_of_injective Int.cast_injective g]
    rw [Complex.norm_intCast]
    have hi : (1 : ℤ) ≤ |g.leadingCoeff| := by
      rcases lt_or_gt_of_ne hglead0 with hn | hp
      · rw [abs_of_neg hn]
        omega
      · rw [abs_of_pos hp]
        omega
    exact_mod_cast hi
  have hevalnorm : ‖G.eval 10‖ = 1 := by
    have heval : G.eval 10 = ((g.eval 10 : ℤ) : ℂ) := by simp [G, eval_map]
    rw [heval]
    rcases Int.isUnit_iff.mp hgu with h | h
    · rw [h]
      norm_num
    · rw [h]
      norm_num
  have heq := congrArg norm (hsplit.eval_eq_prod_roots (10 : ℂ))
  rw [norm_mul, Multiset.norm_prod] at heq
  simp only [Multiset.map_map, Function.comp_apply] at heq
  have heq' : ‖G.eval 10‖ = ‖G.leadingCoeff‖ * distances.prod := by
    simpa [distances] using heq
  have hprod_le : distances.prod ≤ ‖G.leadingCoeff‖ * distances.prod := by
    simpa only [one_mul] using
      (mul_le_mul_of_nonneg_right hlead (le_trans (by norm_num) hprod.le))
  rw [hevalnorm] at heq'
  linarith

open Polynomial in
theorem problem6 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf0 : f ≠ 0 := by
    intro h
    subst f
    simpa using hp.ne_zero
  refine ⟨?_, ?_⟩
  · intro hfu
    exact hp.not_unit (hfu.map (Polynomial.evalRingHom 10))
  · intro g h hfactor
    have heval : f.eval 10 = g.eval 10 * h.eval 10 := by
      rw [hfactor, Polynomial.eval_mul]
    rcases hp.irreducible.isUnit_or_isUnit heval with hg | hh
    · exact Or.inl (digitPolynomial_factor_isUnit f hdigit hf0 (by
        exact ⟨h, hfactor⟩) hg)
    · exact Or.inr (digitPolynomial_factor_isUnit f hdigit hf0 (by
        exact ⟨g, by simpa [mul_comm] using hfactor⟩) hh)

#print axioms problem6
